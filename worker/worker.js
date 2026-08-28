/**
 * wheel-analyzer data proxy
 * ============================
 * A thin, cache-first proxy in front of Yahoo Finance. It exists for three
 * reasons, none of which a static page on GitHub Pages can do for itself:
 *
 *   1. CORS.   Yahoo sends no `Access-Control-Allow-Origin`, so a browser
 *              refuses to read its responses. This adds the header.
 *   2. Auth.   Some Yahoo endpoints now require a cookie + "crumb" pair.
 *              The handshake is done here, server-side, and cached.
 *   3. Rate.   Yahoo rate-limits hard by IP. The edge cache means repeat
 *              requests for the same symbol never reach Yahoo at all.
 *
 * It is deliberately not an open proxy: only the five routes below, only GET,
 * only Yahoo upstreams.
 *
 * Routes (all GET):
 *   /health                     — liveness + whether the crumb handshake works
 *   /expiries/:symbol           — underlying quote + list of expiry dates
 *   /chain/:symbol?date=EPOCH   — calls + puts for one expiry
 *   /history/:symbol?range=1y   — daily closes, for realised volatility
 *   /summary/:symbol            — earnings date, dividend yield, profile
 *   /rate                       — 13-week T-bill yield (^IRX), the risk-free rate
 */

const UPSTREAM = {
  chart: (s, qs) => `https://query1.finance.yahoo.com/v8/finance/chart/${enc(s)}?${qs}`,
  options: (s, qs) => `https://query1.finance.yahoo.com/v7/finance/options/${enc(s)}${qs ? "?" + qs : ""}`,
  summary: (s, qs) => `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${enc(s)}?${qs}`,
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const BROWSER = { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" };

// How long a cached upstream response is served before we ask Yahoo again.
// Chains move through the day; profile and rate barely move at all.
const TTL = { chain: 180, expiries: 180, history: 1800, summary: 3600, rate: 21600 };

// Credentials survive as long as the isolate stays warm. A cold start pays the
// handshake once; everything after is free until Yahoo expires the crumb.
let cred = { cookie: "", crumb: "", at: 0 };
const CRED_TTL = 30 * 60 * 1000;

const enc = (s) => encodeURIComponent(String(s).trim().toUpperCase());

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET")
      return json({ error: "method not allowed" }, 405, cors);

    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const route = parts[0] || "";
    const symbol = parts[1] || url.searchParams.get("symbol") || "";

    try {
      if (route === "" || route === "health") return json(await health(), 200, cors);
      if (route === "rate") return proxy("rate", UPSTREAM.chart("^IRX", "range=5d&interval=1d"), cors);

      if (!symbol) return json({ error: "missing symbol" }, 400, cors);
      if (!/^[A-Za-z0-9.^-]{1,12}$/.test(symbol))
        return json({ error: "bad symbol" }, 400, cors);

      switch (route) {
        case "expiries":
          return proxy("expiries", UPSTREAM.options(symbol, ""), cors);
        case "chain": {
          const date = url.searchParams.get("date");
          const qs = date && /^\d{6,}$/.test(date) ? `date=${date}` : "";
          return proxy("chain", UPSTREAM.options(symbol, qs), cors);
        }
        case "history": {
          const range = /^(1mo|3mo|6mo|1y|2y|5y)$/.test(url.searchParams.get("range") || "")
            ? url.searchParams.get("range")
            : "1y";
          return proxy("history", UPSTREAM.chart(symbol, `range=${range}&interval=1d`), cors);
        }
        case "summary":
          return proxy(
            "summary",
            UPSTREAM.summary(
              symbol,
              "modules=" +
                encodeURIComponent("calendarEvents,summaryDetail,defaultKeyStatistics,price,assetProfile")
            ),
            cors
          );
        default:
          return json({ error: `unknown route '${route}'` }, 404, cors);
      }
    } catch (err) {
      return json({ error: "proxy failure", detail: String(err && err.message || err) }, 502, cors);
    }
  },
};

/* ---------- the Yahoo handshake ----------
 * Yahoo gates v7/finance/options and v10/quoteSummary behind a cookie + a
 * matching "crumb". The cookie has moved around over the years, so try a few
 * sources and keep the first that yields real auth cookies; the getcrumb
 * endpoint also sets one on its own response, which is often the good one.
 */

const cookieValid = (c) => /(^|;\s*)(A1|A3|GUC|A1S)=/.test(c);
const crumbValid = (s) => s && s.length >= 6 && s.length < 40 && !/[<>\s"]/.test(s) && s !== "Too Many Requests";

function collectCookies(res) {
  const list = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const pairs = (list.length ? list : (res.headers.get("set-cookie") || "").split(/,(?=[^ ;,]+=)/))
    .map((c) => c.split(";")[0].trim())
    .filter((c) => /^[A-Za-z0-9_]+=.+/.test(c));
  return pairs.join("; ");
}

function mergeCookies(a, b) {
  const jar = new Map();
  for (const part of (a + "; " + b).split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function credentials(force = false) {
  if (!force && cred.crumb && Date.now() - cred.at < CRED_TTL) return cred;

  let cookie = "";
  for (const url of ["https://fc.yahoo.com/", "https://finance.yahoo.com/", "https://www.yahoo.com/"]) {
    try {
      const r = await fetch(url, { headers: { ...BROWSER, Accept: "text/html,application/xhtml+xml" }, redirect: "follow" });
      const got = collectCookies(r);
      cookie = cookie ? mergeCookies(cookie, got) : got;
      if (cookieValid(cookie)) break;
    } catch { /* try the next source */ }
  }

  let crumb = "";
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v1/test/getcrumb`, {
        headers: { ...BROWSER, Cookie: cookie, Accept: "text/plain" },
      });
      const fresh = collectCookies(r);
      if (fresh) cookie = mergeCookies(cookie, fresh);
      const body = (await r.text()).trim();
      if (crumbValid(body)) { crumb = body; break; }
    } catch { /* try the other host */ }
  }

  cred = { cookie, crumb, at: Date.now() };
  return cred;
}

/* ---------- fetch one upstream, with cache + one auth retry ---------- */

async function proxy(kind, upstreamUrl, cors) {
  const cache = caches.default;
  const cacheKey = new Request("https://cache.invalid/" + kind + "?u=" + encodeURIComponent(upstreamUrl));

  const hit = await cache.match(cacheKey);
  if (hit) {
    const h = new Headers(hit.headers);
    Object.entries(cors).forEach(([k, v]) => h.set(k, v));
    h.set("x-wa-cache", "hit");
    return new Response(hit.body, { status: 200, headers: h });
  }

  let res = await callYahoo(upstreamUrl, false);
  if (res.status === 401 || res.status === 403) res = await callYahoo(upstreamUrl, true);

  const bodyText = await res.text();
  if (!res.ok) {
    return json(
      { error: "upstream " + res.status, upstream: hostOf(upstreamUrl), body: bodyText.slice(0, 300) },
      res.status === 429 ? 429 : 502,
      cors
    );
  }

  const ttl = TTL[kind] || 300;
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${ttl}`,
    "x-wa-cache": "miss",
    ...cors,
  });
  // Store a clean copy (no CORS headers baked in — they are per-request).
  const storeHeaders = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${ttl}`,
  });
  await cache.put(cacheKey, new Response(bodyText, { headers: storeHeaders }));

  return new Response(bodyText, { status: 200, headers });
}

async function callYahoo(upstreamUrl, forceFresh) {
  const c = await credentials(forceFresh);
  const u = new URL(upstreamUrl);
  if (c.crumb && !u.searchParams.has("crumb")) u.searchParams.set("crumb", c.crumb);
  return fetch(u.toString(), {
    headers: { ...BROWSER, Cookie: c.cookie },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
}

/* ---------- helpers ---------- */

async function health() {
  const c = await credentials();
  return {
    ok: true,
    service: "wheel-analyzer data proxy",
    crumb: c.crumb ? "acquired" : "unavailable",
    note: c.crumb
      ? "All routes should work."
      : "Chain and history will work; earnings/dividend data may be missing.",
    time: new Date().toISOString(),
  };
}

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return "unknown";
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(cors || {}) },
  });
}
