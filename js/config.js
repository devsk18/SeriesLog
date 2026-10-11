/* SeriesLog configuration
 * Edit the SERVERS array to add/remove streaming servers.
 * Each server needs a unique id, a label and a build({id, s, e}) -> URL function.
 */
const CONFIG = {
  SERVERS: [
    {
      id: "vidsrc",
      label: "VidSrc",
      default: true,
      build: ({ id, s, e }) =>
        `https://www.streamex.hn/watch/tv/${id}?s=${s}&e=${e}&server=vidsrc`
    }
    // Example - uncomment / copy to add more:
    // {
    //   id: "streamx",
    //   label: "StreamX",
    //   build: ({ id, s, e }) =>
    //     `https://www.streamex.hn/watch/tv/${id}?s=${s}&e=${e}&server=streamx`
    // }
  ],

  STATUS: {
    NOT_STARTED: "not-started",
    WATCHING: "watching",
    COMPLETED: "completed"
  },

  STORAGE_KEY: "serieslog.v1",
  LEGACY_STORAGE_KEY: "linkplay.v1",
  TVMAZE_BASE: "https://api.tvmaze.com"
};

/** Return the server marked default, or the first one. */
CONFIG.defaultServer = function () {
  return this.SERVERS.find((s) => s.default) || this.SERVERS[0];
};

/** Return a server by id, falling back to the default. */
CONFIG.getServer = function (id) {
  return this.SERVERS.find((s) => s.id === id) || this.defaultServer();
};

/** Human readable status label + icon. */
CONFIG.statusMeta = function (status) {
  switch (status) {
    case CONFIG.STATUS.COMPLETED:
      return { label: "Completed", icon: "\u2705", cls: "completed" };
    case CONFIG.STATUS.WATCHING:
      return { label: "Watching", icon: "\u25B6\uFE0F", cls: "watching" };
    default:
      return { label: "Not started", icon: "\u26AA", cls: "not-started" };
  }
};
