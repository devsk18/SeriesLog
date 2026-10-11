/* Optional seed data for SeriesLog.
 * Loaded only when there is no saved data in localStorage.
 * Also handy as a manual backup you can keep in version control.
 *
 * Example entry:
 *   window.SEED = {
 *     settings: {},
 *     series: {
 *       "1408": {
 *         id: "1408",
 *         tvmazeId: null,
 *         title: "Example Show",
 *         poster: "",
 *         seasons: {
 *           "1": { count: 10, episodes: [] },
 *           "2": { count: 8,  episodes: [] }
 *         },
 *         watched: { "1:1": true, "1:2": true },
 *         current: { s: 1, e: 3 },
 *         server: "vidsrc"
 *       }
 *     }
 *   };
 */
window.SEED = { settings: {}, series: {} };
