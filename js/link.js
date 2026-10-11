/* SeriesLog link builder / parser for streamex-style URLs. */
const Link = (function () {
  /** Build a watch URL for the given params. */
  function build(params) {
    const server = CONFIG.getServer(params.serverId);
    return server.build({ id: params.id, s: params.s, e: params.e });
  }

  /**
   * Parse a streamex link (or any URL with s/e/server query params).
   * Returns { id, s, e, server } or null when no id is found.
   */
  function parse(text) {
    if (!text) return null;
    const str = String(text).trim();

    const idMatch = str.match(/\/tv\/(\d+)/i) || str.match(/[?&]id=(\d+)/i);
    if (!idMatch) return null;

    const out = { id: idMatch[1], s: null, e: null, server: null };

    const sMatch = str.match(/[?&]season=(\d+)/i) || str.match(/[?&]s=(\d+)/i);
    const eMatch = str.match(/[?&]episode=(\d+)/i) || str.match(/[?&]e=(\d+)/i);
    const serverMatch = str.match(/[?&]server=([A-Za-z0-9_-]+)/i);

    if (sMatch) out.s = Number(sMatch[1]);
    if (eMatch) out.e = Number(eMatch[1]);
    if (serverMatch) out.server = serverMatch[1];

    return out;
  }

  return { build: build, parse: parse };
})();
