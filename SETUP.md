# Putting wheel-analyzer online

Two pieces:

1. **The page** goes on **GitHub Pages** — the same free hosting the
   `options-from-zero` site uses.
2. **The data proxy** runs on **Cloudflare Workers**. The page cannot call
   Yahoo Finance directly: a browser blocks it, and Yahoo blocks it back. The
   Worker sits in the middle, does the awkward parts (the cookie/crumb
   handshake), and caches the answers so Yahoo is barely troubled.

> **The Worker is already deployed** to your Cloudflare account
> (`hello@lillyreid.com`) as `wheel-analyzer-proxy`, and its URL is baked into
> `index.html` at `CONFIG.workerBase`. So Part 1 below is done — you only need
> Part 2 to get the page online. Part 1 is kept as a record and for
> redeploying after you change `worker/worker.js`.

To redeploy the Worker after an edit:

```bash
cd worker && npx wrangler deploy
```

Health check any time: open `https://wheel-analyzer-proxy.wheel-analyzer-proxy.workers.dev/health`
— you want `"crumb": "acquired"`.

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

This is the part you have done before, with `options-from-zero`. If you are
comfortable there, the short version is: publish this repo, turn on Pages for
the `main` branch, root folder. The longer version follows.

**Step 1 — Add the project to GitHub Desktop.**

Paste into Terminal:

```bash
open -a "GitHub Desktop" /Users/lillyreid/dev/wheel-analyzer
```

GitHub Desktop opens with the repository already added.

> If it says the folder is not a repository, it has not been initialised yet.
> `cd /Users/lillyreid/dev/wheel-analyzer && git init`, then try again.

**Step 2 — Check what is about to be uploaded.**

The left column lists the files for the first commit. You should see roughly:
`index.html`, `README.md`, `SETUP.md`, `.gitignore`, `.nojekyll`, and the
`worker` folder. You should **not** see `node_modules` or anything under
`.wrangler`.

Nothing here is secret — there is no notification code and no API key. The
Worker address is not sensitive either; the Worker only talks to Yahoo.

**Step 3 — Publish.**

1. Bottom left, **Summary** box: `Wheel analyzer`.
2. **Commit to main.**
3. Top of the window: **Publish repository.**
4. The name should be `wheel-analyzer` to match the live URL in the README.
   Private or public is up to you — Pages works either way on a personal
   account.
5. **Publish repository.**

**Step 4 — Turn on Pages.**

1. GitHub Desktop: **Repository → View on GitHub.**
2. **Settings** tab (along the top of the repository).
3. Left sidebar: **Pages.**
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. **Branch**: `main`, folder `/ (root)`. **Save.**

Wait a minute or two, refresh, and the top of the Pages panel shows the live
address:

```
https://lillystonks.github.io/wheel-analyzer/
```

**Step 5 — Connect the two.**

Open that address. Click **Settings** (top right of the page). Paste the
Worker's `.workers.dev` URL. **Test** — it should say *Reachable*. **Save.**

Type a ticker and an expiry. That is it.

> The Worker URL is stored only in your browser. Open the site on your phone and
> you will paste it once there too. To ship the site pre-wired, put the URL in
> `CONFIG.workerBase` near the top of `index.html` before you commit.

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
