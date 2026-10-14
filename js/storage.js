/* SeriesLog storage: localStorage backed state with import/export. */
const Store = (function () {
  let state = null;

  function emptyState() {
    return {
      version: 1,
      settings: {},
      series: {}
    };
  }

  function normalizeSeries(sr) {
    sr = sr || {};
    sr.watched = sr.watched || {};
    sr.seasons = sr.seasons || {};
    // seasons may be given as {n: count} or {n:{count,episodes}}
    Object.keys(sr.seasons).forEach(function (k) {
      const v = sr.seasons[k];
      if (typeof v === "number") sr.seasons[k] = { count: v, episodes: [] };
      else {
        sr.seasons[k].count = v.count || (v.episodes ? v.episodes.length : 0);
        sr.seasons[k].episodes = v.episodes || [];
      }
    });
    if (!sr.current) sr.current = { s: 1, e: 1 };
    sr.id = sr.id != null ? String(sr.id) : (sr.tmdbId != null ? String(sr.tmdbId) : "");
    sr.tvmazeId = sr.tvmazeId != null ? sr.tvmazeId : null;
    sr.totalSeasons = Object.keys(sr.seasons).length;
    sr.manual = !!sr.manual;
    sr.status = computeStatus(sr);
    return sr;
  }

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      // One-time migration from the old storage key (renamed app).
      if (!raw && CONFIG.LEGACY_STORAGE_KEY) {
        const legacy = localStorage.getItem(CONFIG.LEGACY_STORAGE_KEY);
        if (legacy) {
          raw = legacy;
          localStorage.setItem(CONFIG.STORAGE_KEY, legacy);
          localStorage.removeItem(CONFIG.LEGACY_STORAGE_KEY);
        }
      }
    } catch (e) {
      raw = null;
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.series) {
          Object.keys(parsed.series).forEach(function (id) {
            parsed.series[id] = normalizeSeries(parsed.series[id]);
          });
          parsed.settings = parsed.settings || {};
          return parsed;
        }
      } catch (e) {
        console.warn("SeriesLog: corrupt storage, starting fresh", e);
      }
    }
    // Fall back to seed data (js/data.js) if present.
    const seeded = emptyState();
    if (window.SEED && window.SEED.series) {
      Object.keys(window.SEED.series).forEach(function (id) {
        seeded.series[id] = normalizeSeries(window.SEED.series[id]);
      });
    }
    if (window.SEED && window.SEED.settings) {
      Object.assign(seeded.settings, window.SEED.settings);
    }
    return seeded;
  }

  function save() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("SeriesLog: unable to save", e);
    }
  }

  function init() {
    if (!state) state = load();
    return state;
  }

  /* ---------- totals / status ---------- */
  function totalEpisodes(sr) {
    let total = 0;
    Object.keys(sr.seasons).forEach(function (k) {
      total += sr.seasons[k].count || 0;
    });
    return total;
  }

  function watchedCount(sr) {
    let count = 0;
    Object.keys(sr.watched).forEach(function (key) {
      if (!sr.watched[key]) return;
      const parts = key.split(":");
      const season = sr.seasons[parts[0]];
      if (season && Number(parts[1]) <= season.count) count++;
    });
    return count;
  }

  function computeStatus(sr) {
    const total = totalEpisodes(sr);
    const watched = watchedCount(sr);
    if (total > 0 && watched >= total) return CONFIG.STATUS.COMPLETED;
    if (watched === 0) return CONFIG.STATUS.NOT_STARTED;
    return CONFIG.STATUS.WATCHING;
  }

  function isWatched(sr, s, e) {
    return !!sr.watched[s + ":" + e];
  }

  /** Watched map with every episode of every season marked watched. */
  function allWatchedMap(seasons) {
    const watched = {};
    Object.keys(seasons).forEach(function (k) {
      const count = seasons[k].count || 0;
      for (let e = 1; e <= count; e++) watched[k + ":" + e] = true;
    });
    return watched;
  }

  /** First unwatched episode in order, else the last episode. */
  function nextEpisode(sr) {
    const seasons = Object.keys(sr.seasons)
      .map(Number)
      .sort(function (a, b) { return a - b; });
    for (let i = 0; i < seasons.length; i++) {
      const s = seasons[i];
      const count = sr.seasons[s].count || 0;
      for (let e = 1; e <= count; e++) {
        if (!isWatched(sr, s, e)) return { s: s, e: e };
      }
    }
    const lastS = seasons[seasons.length - 1] || 1;
    const lastCount = (sr.seasons[lastS] && sr.seasons[lastS].count) || 1;
    return { s: lastS, e: lastCount };
  }

  /* ---------- series CRUD ---------- */
  function getSeries(id) {
    return state.series[String(id)] || null;
  }

  function seriesList() {
    return Object.keys(state.series)
      .map(function (id) { return state.series[id]; })
      .sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  }

  function addSeries(sr) {
    sr = normalizeSeries(sr);
    sr.updatedAt = Date.now();
    const existing = state.series[sr.id];
    if (existing) {
      // keep progress if re-adding
      sr.watched = existing.watched || sr.watched;
      sr.current = existing.current || sr.current;
    }
    sr.status = computeStatus(sr);
    state.series[sr.id] = sr;
    save();
    return sr;
  }

  function updateSeries(id, patch) {
    const sr = state.series[String(id)];
    if (!sr) return null;
    Object.assign(sr, patch);
    sr.updatedAt = Date.now();
    sr.totalSeasons = Object.keys(sr.seasons).length;
    sr.status = computeStatus(sr);
    save();
    return sr;
  }

  function removeSeries(id) {
    delete state.series[String(id)];
    save();
  }

  /** Mark a series complete by filling in every episode as watched. */
  function markCompleted(id) {
    const sr = state.series[String(id)];
    if (!sr) return null;
    return updateSeries(id, { watched: allWatchedMap(sr.seasons) });
  }

  /* ---------- import / export ---------- */
  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !parsed.series) {
      throw new Error("Invalid SeriesLog backup file.");
    }
    const next = emptyState();
    next.settings = Object.assign(next.settings, parsed.settings || {});
    Object.keys(parsed.series).forEach(function (id) {
      next.series[id] = normalizeSeries(parsed.series[id]);
    });
    state = next;
    save();
    return state;
  }

  return {
    init: init,
    state: function () { return state; },
    seriesList: seriesList,
    getSeries: getSeries,
    addSeries: addSeries,
    updateSeries: updateSeries,
    removeSeries: removeSeries,
    totalEpisodes: totalEpisodes,
    watchedCount: watchedCount,
    computeStatus: computeStatus,
    nextEpisode: nextEpisode,
    isWatched: isWatched,
    allWatchedMap: allWatchedMap,
    markCompleted: markCompleted,
    exportJSON: exportJSON,
    importJSON: importJSON,
    save: save
  };
})();
