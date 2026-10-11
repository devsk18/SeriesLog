# SeriesLog

A tiny 100% static web app to track what you're watching and grab a watch link for the current episode.

## Features

- Track watched episodes per series, with status badges (watching / completed / not-started)
- Watch links for the current episode (default server: vidsrc, via streamex.hn)
- Add series manually, from a streamex link, or via the built-in TVmaze lookup (free, no API key, episode names included)
- Everything stays in the browser (localStorage) — no account, no server
- Export / import your data as a JSON backup

## Usage

Open `index.html` in any browser. No build step, no dependencies.

> Note: links open in a normal tab. For private browsing, copy the link and open it yourself (laptop: `Ctrl+Shift+N`, mobile: long-press -> incognito).

## Project layout

```
index.html         App shell (library, detail view, add/edit modals)
css/style.css      Dark responsive theme
js/config.js       Servers + status config
js/storage.js      Persistence, status/progress logic, import/export
js/tvmaze.js       TVmaze lookup + cache
js/link.js         Streamex link parser / builder
js/ui.js           Rendering and events
js/data.js         Optional seed data (empty by default)
```

## Data

All data is stored in `localStorage` under `serieslog.v1`. Use **Export** to download a JSON backup you can keep anywhere.

Data by TVmaze (https://www.tvmaze.com) — available under the CC BY-SA license.