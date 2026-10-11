/* SeriesLog UI: rendering and events. */
(function () {
  const $ = function (id) { return document.getElementById(id); };
  const PLACEHOLDER =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  const uiState = {
    currentSeriesId: null,
    selected: { s: 1, e: 1 },
    serverId: CONFIG.defaultServer().id
  };
  let pendingLink = null;
  let pendingSeries = null;

  /* ---------- helpers ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let toastTimer = null;
  function toast(msg, type) {
    const el = $("toast");
    el.textContent = msg;
    el.className = "toast" + (type ? " " + type : "");
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add("hidden"); }, 3200);
  }

  function sortedSeasons(sr) {
    return Object.keys(sr.seasons).map(Number).sort(function (a, b) { return a - b; });
  }

  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }

  function setOptions(select, values, selected) {
    select.innerHTML = "";
    values.forEach(function (v) {
      const opt = document.createElement("option");
      opt.value = v.value;
      opt.textContent = v.label;
      if (String(v.value) === String(selected)) opt.selected = true;
      select.appendChild(opt);
    });
  }

  /* ---------- server selects ---------- */
  function fillServerSelect(select, selected) {
    setOptions(select, CONFIG.SERVERS.map(function (s) {
      return { value: s.id, label: s.label };
    }), selected || uiState.serverId);
  }

  /* ---------- library ---------- */
  function renderLibrary() {
    const grid = $("libraryGrid");
    const filter = ($("librarySearch").value || "").toLowerCase();
    const list = Store.seriesList().filter(function (sr) {
      return !filter || (sr.title || "").toLowerCase().indexOf(filter) !== -1;
    });

    grid.innerHTML = "";
    $("emptyState").classList.toggle("hidden", list.length > 0);

    list.forEach(function (sr) {
      const total = Store.totalEpisodes(sr);
      const watched = Store.watchedCount(sr);
      const pct = total ? Math.round((watched / total) * 100) : 0;
      const meta = CONFIG.statusMeta(sr.status);
      const started = sr.status !== CONFIG.STATUS.NOT_STARTED;
      const next = Store.nextEpisode(sr);

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<img class="poster" alt="" loading="lazy" src="' + escapeHtml(sr.poster || PLACEHOLDER) + '">' +
        '<div class="card-body">' +
          '<div class="card-title" title="' + escapeHtml(sr.title) + '">' + escapeHtml(sr.title) + '</div>' +
          '<div><span class="badge ' + meta.cls + '">' + meta.icon + " " + meta.label + '</span></div>' +
          '<div class="muted small">' + watched + " / " + total + " episodes</div>" +
          (started && sr.status !== CONFIG.STATUS.COMPLETED
            ? '<div class="muted small">Next: S' + next.s + "E" + next.e + '</div>'
            : "") +
          '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
        '</div>';
      card.addEventListener("click", function () { openSeries(sr.id); });
      grid.appendChild(card);
    });
  }

  /* ---------- detail ---------- */
  function openSeries(id) {
    const sr = Store.getSeries(id);
    if (!sr) return;
    uiState.currentSeriesId = id;
    uiState.serverId = sr.server || CONFIG.defaultServer().id;
    $("viewLibrary").classList.add("hidden");
    $("viewDetail").classList.remove("hidden");

    const cur = sr.current || Store.nextEpisode(sr);
    uiState.selected = { s: cur.s, e: cur.e };
    renderDetail();
  }

  function backToLibrary() {
    uiState.currentSeriesId = null;
    $("viewDetail").classList.add("hidden");
    $("viewLibrary").classList.remove("hidden");
    renderLibrary();
  }

  function renderDetail() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return backToLibrary();

    const total = Store.totalEpisodes(sr);
    const watched = Store.watchedCount(sr);
    const pct = total ? Math.round((watched / total) * 100) : 0;
    const meta = CONFIG.statusMeta(sr.status);

    $("detailPoster").src = sr.poster || PLACEHOLDER;
    $("detailTitle").textContent = sr.title || "(untitled)";
    $("detailMeta").textContent =
      sortedSeasons(sr).length + " seasons · " + total + " episodes";
    $("detailStatus").innerHTML =
      '<span class="badge ' + meta.cls + '">' + meta.icon + " " + meta.label + '</span>';
    $("detailProgressBar").style.width = pct + "%";
    $("detailProgressText").textContent = watched + " / " + total + " watched (" + pct + "%)";

    // keep the current selection valid for this series
    const seasons = sortedSeasons(sr);
    if (!sr.seasons[uiState.selected.s]) {
      uiState.selected = { s: seasons[0] || 1, e: 1 };
    }
    const season = sr.seasons[uiState.selected.s];
    if (season && uiState.selected.e > season.count) uiState.selected.e = 1;

    fillServerSelect($("serverSelect"), uiState.serverId);
    populateSeasonSelect();
    populateEpisodeSelect();
    $("seasonSelect").value = uiState.selected.s;
    $("episodeSelect").value = uiState.selected.e;

    renderSeasonTabs();
    renderEpisodeGrid();
    updateLink();
  }

  function renderSeasonTabs() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    const tabs = $("seasonTabs");
    tabs.innerHTML = "";
    sortedSeasons(sr).forEach(function (s) {
      const btn = document.createElement("button");
      btn.className = "tab" + (s === uiState.selected.s ? " active" : "");
      btn.textContent = "Season " + s;
      btn.addEventListener("click", function () {
        if (!sr.seasons[s]) return;
        selectEpisode(s, 1);
      });
      tabs.appendChild(btn);
    });
  }

  function renderEpisodeGrid() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    const grid = $("episodeGrid");
    grid.innerHTML = "";

    const season = sr.seasons[uiState.selected.s];
    if (!season) return;

    for (let e = 1; e <= season.count; e++) {
      const ep = document.createElement("button");
      const watched = Store.isWatched(sr, uiState.selected.s, e);
      const isCurrent = uiState.selected.e === e;
      ep.className = "ep" + (watched ? " watched" : "") + (isCurrent ? " current" : "");
      const name = season.episodes && season.episodes[e - 1] ? season.episodes[e - 1].name : "";
      ep.title = "S" + uiState.selected.s + "E" + e + (name ? " · " + name : "");
      ep.innerHTML = '<span class="ep-num">' + e + "</span>";
      ep.addEventListener("click", function () { toggleWatched(uiState.selected.s, e); });
      grid.appendChild(ep);
    }

    renderEpisodeName();
  }

  function renderEpisodeName() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    const season = sr.seasons[uiState.selected.s];
    const nameEl = $("episodeName");
    if (!season) { nameEl.textContent = ""; return; }
    const ep = season.episodes && season.episodes[uiState.selected.e - 1];
    const label = "S" + uiState.selected.s + "E" + uiState.selected.e;
    nameEl.textContent = ep && ep.name ? label + " · " + ep.name : label;
  }

  function populateSeasonSelect() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    setOptions($("seasonSelect"), sortedSeasons(sr).map(function (s) {
      return { value: s, label: "Season " + s };
    }), uiState.selected.s);
  }

  function populateEpisodeSelect() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    const season = sr.seasons[uiState.selected.s];
    const count = season ? season.count : 0;
    const values = [];
    for (let e = 1; e <= count; e++) values.push({ value: e, label: "Episode " + e });
    setOptions($("episodeSelect"), values, uiState.selected.e);
  }

  /** Select an episode, sync selects + grid, persist as current. */
  function selectEpisode(s, e, persist) {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const season = sr.seasons[s];
    if (!season) return;
    e = Math.min(Math.max(1, e), season.count);
    uiState.selected = { s: s, e: e };

    $("seasonSelect").value = s;
    populateEpisodeSelect();
    $("episodeSelect").value = e;
    renderSeasonTabs();
    renderEpisodeGrid();
    updateLink();

    if (persist !== false) Store.updateSeries(sr.id, { current: { s: s, e: e } });
  }

  function toggleWatched(s, e) {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const key = s + ":" + e;
    const watched = Object.assign({}, sr.watched);
    if (watched[key]) delete watched[key];
    else watched[key] = true;
    Store.updateSeries(sr.id, { watched: watched });

    const updated = Store.getSeries(sr.id);
    const next = Store.nextEpisode(updated);
    selectEpisode(next.s, next.e, true);
    renderDetailHeader();
  }

  function markWatchedNext() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const marked = { s: uiState.selected.s, e: uiState.selected.e };
    const key = marked.s + ":" + marked.e;
    const watched = Object.assign({}, sr.watched);
    watched[key] = true;
    Store.updateSeries(sr.id, { watched: watched });
    const updated = Store.getSeries(sr.id);
    const next = Store.nextEpisode(updated);
    selectEpisode(next.s, next.e, true);
    renderDetailHeader();
    toast("Marked S" + marked.s + "E" + marked.e + " watched", "ok");
  }

  function renderDetailHeader() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const total = Store.totalEpisodes(sr);
    const watched = Store.watchedCount(sr);
    const pct = total ? Math.round((watched / total) * 100) : 0;
    const meta = CONFIG.statusMeta(sr.status);
    $("detailStatus").innerHTML =
      '<span class="badge ' + meta.cls + '">' + meta.icon + " " + meta.label + '</span>';
    $("detailProgressBar").style.width = pct + "%";
    $("detailProgressText").textContent = watched + " / " + total + " watched (" + pct + "%)";
  }

  function updateLink() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const url = Link.build({
      id: sr.id,
      s: uiState.selected.s,
      e: uiState.selected.e,
      serverId: uiState.serverId
    });
    $("linkOutput").value = url;
    renderEpisodeName();
  }

  function currentLink() { return $("linkOutput").value; }

  /* ---------- add / edit / settings ---------- */
  function parseCounts(str, seasonCount) {
    const parts = String(str || "")
      .split(/[,\s]+/)
      .map(function (x) { return parseInt(x, 10); })
      .filter(function (n) { return n > 0; });
    if (!parts.length) return null;
    const counts = [];
    for (let i = 0; i < seasonCount; i++) counts.push(parts[i] || parts[parts.length - 1]);
    return counts;
  }

  function seasonsMapFromCounts(counts) {
    const map = {};
    counts.forEach(function (c, i) { map[i + 1] = { count: c, episodes: [] }; });
    return map;
  }

  async function addFromLink() {
    const parsed = Link.parse($("pasteLink").value);
    if (!parsed) { toast("Could not read a series id from that link.", "error"); return; }
    pendingLink = parsed;
    $("mId").value = parsed.id;
    $("mTitle").value = $("pasteTitle").value.trim();
    activateTab("manual");
    $("mTitle").focus();
    toast("Now fill in seasons & episodes, then Add.", "ok");
  }

  async function runLookup() {
    const q = $("lookupQuery").value.trim();
    const box = $("lookupResults");
    const hint = $("lookupHint");
    box.innerHTML = "";
    if (!q) return;
    hint.className = "muted small";
    hint.textContent = "Searching TVmaze...";
    try {
      const results = await TVmaze.searchShows(q);
      hint.textContent = results.length ? "" : "No results on TVmaze.";
      results.forEach(function (r) {
        const el = document.createElement("div");
        el.className = "result";
        el.innerHTML =
          '<img alt="" loading="lazy" src="' + escapeHtml(r.poster || PLACEHOLDER) + '">' +
          '<div><div class="r-title">' + escapeHtml(r.title) + '</div>' +
          '<div class="r-sub">' + escapeHtml(r.year || "") +
          (r.tvmazeId ? " · TVmaze id " + r.tvmazeId : "") + '</div></div>';
        el.addEventListener("click", async function () {
          try {
            hint.textContent = "Fetching seasons & episode names...";
            pendingSeries = await TVmaze.getSeries(r.tvmazeId);
            $("mTitle").value = pendingSeries.title || r.title;
            $("mPoster").value = pendingSeries.poster || "";
            const keys = Object.keys(pendingSeries.seasons).map(Number).sort(function (a, b) { return a - b; });
            if (keys.length) {
              $("mSeasons").value = keys.length;
              $("mEpisodes").value = keys.map(function (s) { return pendingSeries.seasons[s].count; }).join(",");
            }
            activateTab("manual");
            $("mId").focus();
            toast("Seasons & episodes filled from TVmaze — review then Add.", "ok");
          } catch (e) {
            toast(e.message || "TVmaze fetch failed.", "error");
          }
        });
        box.appendChild(el);
      });
    } catch (e) {
      hint.textContent = e.message || "TVmaze search failed.";
    }
  }

  function addManual() {
    const id = $("mId").value.trim();
    const title = $("mTitle").value.trim();
    const seasonCount = parseInt($("mSeasons").value, 10);
    if (!id || !title || !seasonCount || seasonCount < 1) {
      toast("Id, title and seasons are required.", "error");
      return;
    }
    const counts = parseCounts($("mEpisodes").value, seasonCount);
    if (!counts) { toast("Enter episodes per season.", "error"); return; }

    let seasons = seasonsMapFromCounts(counts);
    let poster = $("mPoster").value.trim();
    let tvmazeId = null;
    if (pendingSeries && pendingSeries.seasons) {
      const ps = pendingSeries.seasons;
      if (Object.keys(ps).length === seasonCount) {
        const merged = {};
        counts.forEach(function (c, i) {
          const s = i + 1;
          const src = ps[s];
          merged[s] = src && src.count === c
            ? { count: c, episodes: src.episodes || [] }
            : { count: c, episodes: [] };
        });
        seasons = merged;
      }
      if (!poster) poster = pendingSeries.poster || "";
      tvmazeId = pendingSeries.tvmazeId || null;
    }

    const sr = {
      id: id,
      tvmazeId: tvmazeId,
      title: title,
      poster: poster,
      seasons: seasons,
      current: pendingLink && pendingLink.s
        ? { s: pendingLink.s, e: pendingLink.e || 1 }
        : { s: 1, e: 1 },
      server: (pendingLink && pendingLink.server) || uiState.serverId,
      manual: true
    };
    Store.addSeries(sr);
    closeModal("modalAdd");
    resetAddForm();
    openSeries(sr.id);
    toast("Added " + title, "ok");
  }

  function resetAddForm() {
    pendingLink = null;
    pendingSeries = null;
    $("pasteLink").value = "";
    $("pasteTitle").value = "";
    $("lookupQuery").value = "";
    $("lookupResults").innerHTML = "";
    $("lookupHint").textContent = "Free lookup from TVmaze · no API key needed. Picks fill the Manual form (episode names included).";
    $("mId").value = "";
    $("mTitle").value = "";
    $("mPoster").value = "";
    $("mSeasons").value = "1";
    $("mEpisodes").value = "";
  }

  function openEdit() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    $("eTitle").value = sr.title || "";
    $("ePoster").value = sr.poster || "";
    const seasons = sortedSeasons(sr);
    $("eSeasons").value = seasons.length;
    $("eEpisodes").value = seasons.map(function (s) { return sr.seasons[s].count; }).join(",");
    fillServerSelect($("eServer"), sr.server || uiState.serverId);
    openModal("modalEdit");
  }

  function saveEdit() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    const seasonCount = parseInt($("eSeasons").value, 10);
    const counts = parseCounts($("eEpisodes").value, seasonCount);
    if (!seasonCount || seasonCount < 1 || !counts) {
      toast("Check the season count and episodes.", "error");
      return;
    }
    const oldSeasons = sr.seasons;
    const seasons = {};
    counts.forEach(function (c, i) {
      const s = i + 1;
      seasons[s] = {
        count: c,
        episodes: oldSeasons[s] ? (oldSeasons[s].episodes || []) : []
      };
    });
    Store.updateSeries(sr.id, {
      title: $("eTitle").value.trim() || sr.title,
      poster: $("ePoster").value.trim(),
      seasons: seasons,
      server: $("eServer").value
    });
    uiState.serverId = $("eServer").value;
    closeModal("modalEdit");
    renderDetail();
    toast("Saved", "ok");
  }

  function resetSeries() {
    if (!confirm("Clear all watched progress for this series?")) return;
    Store.updateSeries(uiState.currentSeriesId, { watched: {}, current: { s: 1, e: 1 } });
    uiState.selected = { s: 1, e: 1 };
    renderDetail();
    toast("Progress reset", "ok");
  }

  function removeSeries() {
    const sr = Store.getSeries(uiState.currentSeriesId);
    if (!sr) return;
    if (!confirm('Remove "' + sr.title + '" and all its progress?')) return;
    Store.removeSeries(uiState.currentSeriesId);
    backToLibrary();
    toast("Removed", "ok");
  }

  /* ---------- copy / open / import / export ---------- */
  async function copyLink() {
    const url = currentLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied", "ok");
    } catch (e) {
      $("linkOutput").select();
      document.execCommand("copy");
      toast("Link copied", "ok");
    }
  }

  function openLink() {
    const url = currentLink();
    if (!url) return;
    window.open(url, "_blank", "noopener");
    toast("Opening... use Ctrl+Shift+N (laptop) or long-press \u2192 incognito (mobile)", "ok");
  }

  function exportData() {
    const blob = new Blob([Store.exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    const d = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = "serieslog-backup-" + d + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded", "ok");
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJSON(reader.result);
        uiState.currentSeriesId = null;
        $("viewDetail").classList.add("hidden");
        $("viewLibrary").classList.remove("hidden");
        renderLibrary();
        toast("Backup imported", "ok");
      } catch (e) {
        toast(e.message || "Import failed.", "error");
      }
    };
    reader.readAsText(file);
  }

  /* ---------- wiring ---------- */
  function activateTab(name) {
    document.querySelectorAll("#addTabs .tab").forEach(function (tab) {
      tab.classList.toggle("active", tab.getAttribute("data-tab") === name);
    });
    document.querySelectorAll("#modalAdd .tab-panel").forEach(function (panel) {
      panel.classList.toggle("hidden", panel.getAttribute("data-panel") !== name);
    });
  }

  function bindAddTabs() {
    document.querySelectorAll("#addTabs .tab").forEach(function (tab) {
      tab.addEventListener("click", function () { activateTab(tab.getAttribute("data-tab")); });
    });
  }

  function init() {
    Store.init();
    uiState.serverId = CONFIG.defaultServer().id;

    $("brand").addEventListener("click", backToLibrary);
    $("librarySearch").addEventListener("input", renderLibrary);
    $("btnAdd").addEventListener("click", function () {
      activateTab("manual");
      openModal("modalAdd");
    });
    $("btnExport").addEventListener("click", exportData);
    $("btnImport").addEventListener("click", function () { $("importFile").click(); });
    $("importFile").addEventListener("change", function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    $("btnBack").addEventListener("click", backToLibrary);
    $("btnEditSeries").addEventListener("click", openEdit);
    $("btnResetSeries").addEventListener("click", resetSeries);
    $("btnRemoveSeries").addEventListener("click", removeSeries);

    $("seasonSelect").addEventListener("change", function () {
      selectEpisode(Number(this.value), 1);
    });
    $("episodeSelect").addEventListener("change", function () {
      selectEpisode(uiState.selected.s, Number(this.value));
    });
    $("serverSelect").addEventListener("change", function () {
      uiState.serverId = this.value;
      updateLink();
    });

    $("btnCopy").addEventListener("click", copyLink);
    $("btnOpen").addEventListener("click", openLink);
    $("btnWatchedNext").addEventListener("click", markWatchedNext);
    $("btnToggleWatched").addEventListener("click", function () {
      toggleWatched(uiState.selected.s, uiState.selected.e);
    });

    $("btnAddFromLink").addEventListener("click", addFromLink);
    $("btnLookup").addEventListener("click", runLookup);
    $("lookupQuery").addEventListener("keydown", function (e) {
      if (e.key === "Enter") runLookup();
    });
    $("btnLookupByTitle").addEventListener("click", function () {
      const title = $("mTitle").value.trim();
      $("lookupQuery").value = title;
      activateTab("lookup");
      if (title) runLookup();
    });
    $("btnAddManual").addEventListener("click", addManual);
    $("btnEditSave").addEventListener("click", saveEdit);

    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () { closeModal(btn.getAttribute("data-close")); });
    });
    document.querySelectorAll(".modal").forEach(function (modal) {
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    bindAddTabs();
    renderLibrary();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
