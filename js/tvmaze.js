/* SeriesLog TVmaze helper (free, no API key, CORS enabled).
 * Data by TVmaze (https://www.tvmaze.com) - CC BY-SA.
 */
const TVmaze = (function () {
  const BASE = CONFIG.TVMAZE_BASE;
  const CACHE_KEY = "serieslog.tvmazecache.v1";
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

  let cache = loadCache();

  function loadCache() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      /* quota errors are non-fatal */
    }
  }

  function imageUrl(image) {
    if (!image) return "";
    return image.medium || image.original || "";
  }

  async function api(path) {
    const cached = cache[path];
    if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

    const res = await fetch(BASE + path, { headers: { accept: "application/json" } });
    if (res.status === 404) throw new Error("Not found on TVmaze.");
    if (!res.ok) throw new Error("TVmaze request failed (" + res.status + ").");

    const data = await res.json();
    cache[path] = { ts: Date.now(), data: data };
    saveCache();
    return data;
  }

  async function searchShows(query) {
    if (!query) return [];
    const data = await api("/search/shows?q=" + encodeURIComponent(query));
    return (data || []).map(function (r) {
      const show = r.show || {};
      return {
        id: show.id,
        tvmazeId: show.id,
        title: show.name,
        poster: imageUrl(show.image),
        year: (show.premiered || "").slice(0, 4)
      };
    });
  }

  /** Normalized series object (title, poster, seasons with episode names). */
  async function getSeries(id) {
    const show = await api("/shows/" + encodeURIComponent(id));
    const episodes = await api("/shows/" + encodeURIComponent(id) + "/episodes");

    const seasons = {};
    (episodes || []).forEach(function (ep) {
      const s = ep.season;
      if (!s || s < 1) return; // skip specials / season 0
      if (!seasons[s]) seasons[s] = { count: 0, episodes: [] };
      seasons[s].count++;
      seasons[s].episodes.push({ n: ep.number, name: ep.name || "" });
    });

    Object.keys(seasons).forEach(function (s) {
      seasons[s].episodes.sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
    });

    // Fallback for shows with unusual numbering: use the seasons endpoint counts.
    if (!Object.keys(seasons).length) {
      const list = await api("/shows/" + encodeURIComponent(id) + "/seasons");
      (list || []).forEach(function (se) {
        if (se.number > 0 && se.episodeOrder) {
          seasons[se.number] = { count: se.episodeOrder, episodes: [] };
        }
      });
    }

    return {
      title: show.name,
      poster: imageUrl(show.image),
      seasons: seasons,
      tvmazeId: show.id
    };
  }

  return {
    searchShows: searchShows,
    getSeries: getSeries,
    imageUrl: imageUrl
  };
})();
