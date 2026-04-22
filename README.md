# North Port Incident Dashboard

A live emergency incident feed for North Port, Florida, built on publicly available PulsePoint data from the Sarasota County Fire Department (SCFD).

## What It Does

Fetches active and recent CAD incidents from PulsePoint, filters for North Port addresses, and displays them in a real-time dashboard. The feed refreshes automatically every 60 seconds.

## Files

- `index.html` — The entire application. HTML, CSS, and JavaScript are contained in this single file.

## Data Source

Incident data is pulled from PulsePoint’s public web endpoint for agency `SCFD`. Because PulsePoint does not provide an official public API, the dashboard uses `allorigins.win` as a CORS proxy to access the data from the browser.

If no North Port incidents are active at a given moment, the dashboard falls back to showing all Sarasota County incidents with a notice.

## Hosting on GitHub Pages

1. Push `index.html` to your repository.
1. Go to Settings > Pages.
1. Set the source to your main branch, root folder.
1. GitHub will publish the dashboard at `https://yourusername.github.io/your-repo-name`.

## Limitations

- PulsePoint does not guarantee a stable or documented public endpoint. If their data structure changes, the feed may break.
- The CORS proxy (`allorigins.win`) is a third-party service. If it is unavailable, the dashboard displays sample data instead of live incidents.
- Medical incident details are intentionally limited by PulsePoint for privacy reasons.
