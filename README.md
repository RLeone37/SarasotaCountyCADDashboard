# Sarasota County CAD Dashboard

A live emergency incident dashboard pulling from the Sarasota County 911 Dispatch Reporting system. Incidents are displayed in real time with an interactive map, agency filters, and incident type filters. Designed for wall monitor display with a responsive layout that also works on mobile.

## What It Does

Fetches the public dispatch log from Sarasota County's 911 reporting site, parses the incident table, deduplicates multi-agency responses into single cards, and displays everything on an interactive dark-themed dashboard. The feed refreshes automatically every 60 seconds.

## Files

- `index.html` — The entire application. HTML, CSS, and JavaScript are contained in this single file.
- `worker.js` — A Cloudflare Worker that proxies the county dispatch site and the FHP feed (bypassing browser CORS restrictions) and geocodes addresses with the Google key kept server-side. Must be deployed separately on Cloudflare Workers.

## Data Source

Incident data is pulled from the Sarasota County 911 Dispatch Reporting site at `dispatchreporting.scgov.net`. This is the county's own CAD (Computer Aided Dispatch) system and represents the most direct public source available — updated faster than third-party aggregators which receive a secondary feed from the same system.

Note: The county dispatch site covers fire and rescue incidents only. EMS and medical calls are handled through a separate system and are not published on the public feed.

### FHP Traffic Incidents

Florida Highway Patrol live traffic incidents come from the FLHSMV public CAD view (`trafficincidents.flhsmv.gov`) via its RSS feed (`CADrss.aspx`). The feed is statewide; the dashboard keeps only counties listed in `FHP_COUNTIES` (default `["SARASOTA"]`). FHP incidents include exact coordinates, so they are mapped without geocoding. They appear in the list and on the map with a gold 🚓 marker and can be isolated with the **FHP Traffic** filter.

### PulsePoint

PulsePoint (agency `16072`, Sarasota County) includes medical/EMS calls that the county dispatch site does not publish. PulsePoint's data API is protected by an AWS WAF bot challenge, so it is not scraped. Instead, the map panel embeds PulsePoint's own web app (`https://web.pulsepoint.org/?agencies=16072`), which has its own list and map views. The panel's view switch offers **Map**, **Split** (map above PulsePoint) and **PulsePoint**; the panel can render PulsePoint in dark colors (◐), reload it (↻) or open it in a new tab (↗). If a browser's privacy settings stop PulsePoint loading inside the page, the panel offers the new-tab link after 20 seconds. Merging PulsePoint incidents onto this dashboard's map would require an authorized data feed from PulsePoint or Sarasota County Fire.

## Architecture

```
index.html  →  Cloudflare Worker  →  dispatchreporting.scgov.net          (default / ?src=cad)
                                  →  trafficincidents.flhsmv.gov CADrss   (?src=fhp)
                                  →  Google Geocoding API (+ KV cache)    (?geocode=...)
index.html  →  <iframe> web.pulsepoint.org/?agencies=16072
```

The dashboard is a static HTML file hosted on GitHub Pages. It calls the Cloudflare Worker, which fetches the county dispatch page and FHP feed server-side. The dashboard parses them, deduplicates incidents, asks the worker to geocode addresses, and renders everything in the browser.

## Features

- Live incident feed refreshing every 60 seconds in the background — the map view, open popup, selected incident and list scroll position are kept across refreshes; refreshing pauses while the tab is hidden
- Feed health in the header: LIVE / STALE (no update for 3 min) / OFFLINE (10 min), with time since the last update; on a failed refresh the last good data stays on screen
- New incidents are flagged NEW for 5 minutes, with an optional sound alert (🔔 button)
- Cards show "Not mapped" when an incident has no exact location or its address could not be found
- Stats follow the selected agency
- Incident cards can be selected with the keyboard (Tab, then Enter or Space)
- Multi-agency deduplication — when multiple departments respond to the same call, a single incident card is shown with all responding agency tags displayed
- Interactive Leaflet map with geocoded incident markers, bounded to Sarasota and surrounding counties (Charlotte, Manatee, DeSoto, Hardee)
- FHP traffic incidents merged into the feed (sorted newest first with county incidents)
- PulsePoint panel (Map / Split / PulsePoint views) embedding PulsePoint's Sarasota County feed, including medical calls
- Agency filters: All, North Port, SCFD, Venice, Englewood, Nokomis, Other, FHP Traffic
- Incident type filters: All, Today, Fire, Marine, Traffic, Alarms
- Incidents that do not match a specific category appear in the All view
- Side-by-side layout on wide screens (map left, incidents right), stacked automatically on mobile
- Command center styling with Barlow Condensed, Rajdhani and Inter fonts, color-coded agency tags, and glowing stat numbers

## Incident Categories

| Filter | Matched Keywords |
|--------|-----------------|
| Fire | FIRE, BRUSH, EXPLOSION, STRUCTURE, SMOKE, HAZMAT, BURNING, ELECTRICAL |
| Marine | MARINE, WATER, BOAT, DROWNING, FLOOD, SWIFT WATER, SURF, DIVE, VESSEL |
| Traffic | TRAFFIC, CRASH, COLLISION, ACCIDENT, MVC |
| Alarms | ALARM, CARBON, MONOXIDE |
| Other | Anything not matched above — always visible in the All view |

## Geocoding

Addresses are geocoded by the worker's `?geocode=` endpoint using the Google Geocoding API, with results bounded to the southwest Florida region. The Google key lives only in the worker (never in the page). Results are cached three ways: in the worker's KV namespace (shared by all viewers — hits for 90 days, misses for 1 day), in each viewer's browser, and in memory for the session. I-75 mile-marker locations (e.g. `205000 N I75`) fall back to a built-in mile-marker table.

Incidents with only a bare street name (no number, no intersection) are listed but not mapped. Incidents that cannot be reliably located are also listed only, preventing incorrect marker placement. Both are labeled "Not mapped" on their cards (hover for the reason).

## Versioning

The footer shows the version and release date (e.g. `v2.1.0 // RELEASED SEP 30, 2026`), so you can confirm a wall display is running the latest build. When publishing a release, bump `APP_VERSION` and `APP_RELEASED` near the top of the script in `index.html`: patch (`2.1.1`) for small fixes, minor (`2.2.0`) for new features.

## Hosting on GitHub Pages

1. Push `index.html` to your repository.
2. Go to Settings > Pages.
3. Set the source to your main branch, root folder.
4. GitHub will publish the dashboard at `https://yourusername.github.io/your-repo-name`.

## Cloudflare Worker Setup

1. Go to `dash.cloudflare.com` and navigate to Workers & Pages.
2. Create a new Worker and name it `sarasota-cad-proxy`.
3. Paste the contents of `worker.js` into the editor and deploy.
4. Your Worker URL will be `https://sarasota-cad-proxy.your-username.workers.dev`.
5. In `index.html`, confirm the `WORKER_URL` variable matches your deployed Worker URL.
6. Under the Worker's **Settings > Variables and Secrets**, add a **Secret** named `GOOGLE_KEY` containing a Google API key restricted to the Geocoding API. (Don't reuse a key that has ever been in `index.html`; that one is public — delete or rotate it in Google Cloud Console.)
7. Recommended: under **Storage & Databases > KV**, create a namespace (e.g. `sarasota-geocache`), then under the Worker's **Settings > Bindings** bind it with the variable name `GEOCACHE`. Without it geocoding still works but every lookup costs a Google request.
8. Optional: add a plain variable `ALLOWED_ORIGINS` set to your Pages origin (e.g. `https://yourusername.github.io`) so other sites can't use your geocoder.

The Cloudflare free tier allows 100,000 requests per day, which is well within range for a 60-second refresh cycle.

## Limitations

- The county dispatch site serves rendered HTML rather than a JSON API. Changes to the site layout could break the parser.
- Google geocoding is billed per request beyond the free allowance; the KV cache keeps repeat lookups free. When an address cannot be reliably found within the region, no marker is shown rather than an incorrect one.
- PulsePoint is embedded, not merged — its incidents are not on the dashboard's own map or in its counts.
- The county site typically shows the past 24 to 48 hours of incidents. Quieter agencies such as North Port may show no results if there have been no calls in that window.
