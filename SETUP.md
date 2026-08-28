# Putting wheel-analyzer online

Two pieces:

1. **The page** goes on **GitHub Pages** — the same free hosting the
   `options-from-zero` site uses.
2. **The data proxy** runs on **Cloudflare Workers**. The page cannot call
   Yahoo Finance directly: a browser blocks it, and Yahoo blocks it back. The
   Worker sits in the middle, does the awkward parts (the cookie/crumb
   handshake), and caches the answers so Yahoo is barely troubled.

> **The Worker is already deployed** as `wheel-analyzer-proxy`, and its URL is
> baked into `index.html` at `CONFIG.workerBase`. Part 1 below is done — you
> only need Part 2 to get the page online. Part 1 is kept as a record and for
> redeploying after you change `worker/worker.js`.

To redeploy the Worker after an edit:

```bash
cd worker && npx wrangler deploy
```

Health check any time: open your Worker's URL with `/health` on the end — you
want `"crumb": "acquired"`.

---

## Part 1 — The data proxy (Cloudflare Worker)

You need the file `worker/worker.js` from this project. Two ways to deploy it.
The dashboard way needs no terminal; skip to the CLI way if you would rather
paste one command.

### The dashboard way

**Step 1 — Make a Cloudflare account.** Skip if you have one.

Go to <https://dash.cloudflare.com/sign-up>. Email and a password. Verify the
email. The free plan is the only plan you need.

**Step 2 — Create the Worker.**

1. In the dashboard sidebar: **Compute (Workers)** → or **Workers & Pages**.
2. **Create application** → **Create Worker**.
3. It offers a name. Something like `wheel-analyzer-proxy`. The name becomes
   part of the address, so pick one you would not mind seeing again.
4. **Deploy.** It deploys a placeholder "Hello World" — that is expected.

**Step 3 — Paste in the real code.**

1. On the Worker's page, click **Edit code** (top right).
2. Select everything in the editor and delete it.
3. Open `worker/worker.js` from this project, copy all of it, paste it in.
4. **Deploy** (top right).

**Step 4 — Copy the address.**

Back on the Worker's overview page there is a URL ending in `.workers.dev`,
something like:

```
https://wheel-analyzer-proxy.your-name.workers.dev
```

Copy it. That is what the page needs.

**Step 5 — Check it works.**

Paste the address into a browser and add `/health`:

```
https://wheel-analyzer-proxy.your-name.workers.dev/health
```

You want to see `"ok": true` and `"crumb": "acquired"`. If the crumb says
`unavailable`, the earnings and dividend fields may be missing but the core
analysis still works — try again in a minute, as Yahoo is sometimes briefly
uncooperative.

### The CLI way

If you have Node installed:

```bash
cd worker
npx wrangler deploy
```

It opens a browser once to authorise, then prints the `.workers.dev` URL.
Done — go to Part 2.

---

## Part 2 — The page (GitHub Pages)

The repo `lillystonks/wheel-analyzer` already exists and the code is pushed. Two
things remain: make it public (GitHub Pages needs a public repo on the free
plan, which is why `options-from-zero` is public too), and switch Pages on.

```bash
gh repo edit lillystonks/wheel-analyzer --visibility public --accept-visibility-change-consequences
gh api -X POST repos/lillystonks/wheel-analyzer/pages -f "source[branch]=main" -f "source[path]=/"
```

Give it a minute, then check the build:

```bash
gh api repos/lillystonks/wheel-analyzer/pages --jq '.status + "  " + .html_url'
```

`built` means it is live at **https://lillystonks.github.io/wheel-analyzer/**.
The Worker URL is already in `index.html`, so it works with no further setup —
on your phone too.

### Or in the browser, no terminal

1. <https://github.com/lillystonks/wheel-analyzer/settings> → scroll to
   **Danger Zone** → **Change visibility** → **Public**.
2. Same page, left sidebar **Pages** → **Source: Deploy from a branch** →
   **Branch: `main` / `/ (root)`** → **Save**.
3. Wait a minute; the live URL appears at the top of that Pages panel.

### Lock the Worker to the site (optional, after Pages is up)

```bash
cd worker && npx wrangler deploy --var ALLOW_ORIGIN:https://lillystonks.github.io
```

After this only your page can call the Worker from a browser. Skip it and the
Worker stays open — it only ever fetches public Yahoo data, and the free plan
is 100,000 requests a day against a cache, so this is housekeeping, not urgent.

---

## Optional: lock the Worker to your site

By default the Worker answers any origin. To restrict it to your Pages site,
in the Cloudflare dashboard open the Worker → **Settings → Variables** → add a
plain-text variable:

```
ALLOW_ORIGIN = https://lillystonks.github.io
```

Deploy. Now only your page can use it. (This does not save Cloudflare quota —
it is only about who may call it from a browser.)

---

## When something goes wrong

**The page says "No data proxy is set".** You have not saved the Worker URL in
Settings, or you saved it in a different browser.

**"Couldn't reach the data proxy".** The URL is wrong, or the Worker did not
deploy. Open `https://<your-worker>/health` directly and see.

**"Yahoo is rate-limiting right now".** It happens. The Worker caches for a few
minutes, so it clears on its own — wait a minute and retry.

**Earnings date is missing, everything else works.** The cookie/crumb handshake
did not complete on that request. Reload; it usually catches on the next try.

**A ticker returns "no options found".** It has no listed US options, or the
symbol is wrong. Index ETFs and large caps work best. For share classes Yahoo
uses a dash: `BRK-B`, not `BRK.B`.
