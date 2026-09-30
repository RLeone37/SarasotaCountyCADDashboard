// Cloudflare Worker: CORS proxy + geocoder for the dashboard.
//   GET /                -> Sarasota County 911 dispatch log (HTML)
//   GET /?src=cad        -> same as above
//   GET /?src=fhp        -> Florida Highway Patrol live traffic incidents (statewide RSS)
//   GET /?geocode=<text> -> {"lat":..,"lng":..} or {"lat":null,"lng":null} (Sarasota region only)
//
// Settings (Worker > Settings > Variables and Secrets / Bindings):
//   GOOGLE_KEY      (secret, required for geocoding) Google Geocoding API key
//   GEOCACHE        (KV namespace binding, optional)  caches geocode results so repeat addresses cost nothing
//   ALLOWED_ORIGINS (variable, optional)              comma-separated origins allowed to use ?geocode,
//                                                     e.g. "https://yanks126.github.io"

const SOURCES = {
  cad: "https://dispatchreporting.scgov.net/",
  fhp: "https://trafficincidents.flhsmv.gov/SmartWebClient/CADrss.aspx",
};

// Sarasota County plus neighbors; results outside this box are treated as "not found"
const REGION = { minLat: 26.5, maxLat: 27.9, minLng: -82.9, maxLng: -81.6 };
const GEO_HIT_TTL  = 60 * 60 * 24 * 90; // 90 days
const GEO_MISS_TTL = 60 * 60 * 24;      // 1 day, in case the address becomes findable

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function inRegion(lat, lng) {
  return lat >= REGION.minLat && lat <= REGION.maxLat && lng >= REGION.minLng && lng <= REGION.maxLng;
}

// Google falls back to a street, ZIP or city centroid when it can't find an address. Those would put a
// marker somewhere plausible but wrong, so only accept results that pin down an actual place.
const PRECISE_TYPES = ["street_address", "premise", "subpremise", "intersection", "establishment", "point_of_interest"];

function isPrecise(result) {
  const lt = result.geometry && result.geometry.location_type;
  if (lt === "ROOFTOP" || lt === "RANGE_INTERPOLATED") return true;
  return (result.types || []).some((t) => PRECISE_TYPES.includes(t));
}

async function geocode(request, env, rawQuery) {
  if (env.ALLOWED_ORIGINS) {
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") || "";
    if (!allowed.includes(origin)) return json({ error: "origin not allowed" }, 403);
  }
  if (!env.GOOGLE_KEY) return json({ error: "GOOGLE_KEY is not configured" }, 500);

  const q = rawQuery.replace(/\s+/g, " ").trim();
  if (q.length < 4 || q.length > 200) return json({ error: "bad query" }, 400);

  // "geo2:" = cache generation that only stores precise matches (bump to discard older entries)
  const cacheKey = "geo2:" + q.toUpperCase();
  if (env.GEOCACHE) {
    const hit = await env.GEOCACHE.get(cacheKey, "json");
    if (hit) return json(hit, 200, { "X-Geo-Cache": "HIT" });
  }

  const url =
    "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(q) +
    "&bounds=" + REGION.minLat + "," + REGION.minLng + "|" + REGION.maxLat + "," + REGION.maxLng +
    "&key=" + env.GOOGLE_KEY;
  const data = await (await fetch(url)).json();

  let result = { lat: null, lng: null };
  if (data.status === "OK" && data.results && data.results.length) {
    const top = data.results[0];
    const loc = top.geometry.location;
    if (isPrecise(top) && inRegion(loc.lat, loc.lng)) result = { lat: loc.lat, lng: loc.lng };
  } else if (data.status !== "ZERO_RESULTS") {
    // Quota / key / transient errors: report (with Google's explanation), don't cache
    return json({ error: data.status || "geocoder error", detail: data.error_message || "" }, 502);
  }

  if (env.GEOCACHE) {
    await env.GEOCACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: result.lat === null ? GEO_MISS_TTL : GEO_HIT_TTL,
    });
  }
  return json(result, 200, { "X-Geo-Cache": "MISS" });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    const params = new URL(request.url).searchParams;

    if (params.has("geocode")) {
      try {
        return await geocode(request, env, params.get("geocode") || "");
      } catch (err) {
        return json({ error: err.message }, 502);
      }
    }

    const src = params.get("src") || "cad";
    const upstream = SOURCES[src];
    if (!upstream) return new Response("Unknown source", { status: 400, headers: CORS });

    try {
      const res = await fetch(upstream, {
        headers: { "User-Agent": "Mozilla/5.0 (SarasotaCountyCADDashboard)" },
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: {
          ...CORS,
          "Content-Type": res.headers.get("Content-Type") || "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    } catch (err) {
      return new Response("Upstream error: " + err.message, { status: 502, headers: CORS });
    }
  },
};
