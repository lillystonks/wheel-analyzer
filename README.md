# wheel-analyzer

A single-page tool for sizing up one wheel trade. Type a ticker, pick an expiry,
and it pulls the live option chain, works the numbers a wheel seller cares
about, scores the trade out of 100, and shows the strikes and expiries that look
better.

**Live site:** https://lillystonks.github.io/wheel-analyzer/ *(after you deploy — see [SETUP.md](SETUP.md))*

It is a companion to [wheel-watch](https://github.com/lillystonks/wheel-watch),
not a replacement. wheel-watch is the daily glance at a fixed watchlist;
this is the deep look at a specific trade when you are about to place one.

It reports quantities and probabilities. Nothing in it tells you what to trade.

---

## What it shows

For a cash-secured put at your chosen strike and expiry:

| | |
|---|---|
| **The trade** | premium, static and annualised return, breakeven, downside cushion, effective cost basis if assigned, theta per day |
| **Odds** | chance of keeping the full premium, chance of assignment, chance of any profit, expected P&L |
| **Why it's good / against it** | generated from the same rubric the score uses — implied vs realised volatility, delta, liquidity, cushion, days to expiry, earnings before expiry |
| **Potential outcomes** | a 20,000-path Monte-Carlo of the expiry P&L, a percentile table, and a rough one-year projection of wheeling the name |
| **Payoff & probability** | the P&L line, and where implied volatility says the stock lands, shaded by outcome |
| **Better options** | every out-of-the-money put strike at that expiry, scored and charted on a risk/return frontier, plus a nearby-expiry comparison |
| **The covered-call leg** | assuming assignment, the calls worth selling against the shares and the round-trip return |
| **Context** | one year of price against your strike and breakeven, the 52-week range, an IV-rank stand-in, liquidity, beta, dividend yield |

## How the numbers are made

- **Pricing and greeks** — Black–Scholes with a continuous dividend yield. Fine
  for the American options on liquid US names that the wheel is run on; the
  early-exercise premium is small for the out-of-the-money puts it looks at.
- **Implied volatility** — solved from the contract's own mid price by bisection,
  falling back to Yahoo's published number if the quote is unusable.
- **Realised volatility** — close-to-close over the trailing month and year.
- **Risk-free rate** — the live 13-week T-bill yield (`^IRX`), or a value you set.
- **Probabilities** — a lognormal price distribution. The "expected annual drift"
  in *Assumptions* defaults to 0%, which keeps the odds close to what the option
  market itself is pricing (roughly, assignment probability ≈ |delta|). Raise it
  to model a more bullish path.
- **Score** — a transparent weighted blend of annualised return, delta,
  implied-vs-realised volatility, liquidity, cushion and tenor, with a penalty
  for earnings before expiry. Every input is spelled out in the "why it's good"
  list, so the number is a summary, not a verdict.

## Architecture

```
 index.html                     one self-contained page — GitHub Pages
   │  (fetch)
   ▼
 worker/worker.js               a Cloudflare Worker (free tier)
   │  cookie + crumb, CORS, 3-min edge cache
   ▼
 query1/query2.finance.yahoo.com
```

GitHub Pages serves only static files, and a browser will not read a response
from Yahoo (no CORS header), nor will Yahoo answer an unauthenticated request
for some endpoints, nor does it take kindly to being called repeatedly from one
IP. The Worker deals with all three. It is not an open proxy — five fixed
routes, GET only, Yahoo upstreams only.

## Running it locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`, then paste your Worker URL into **Settings**
(top right). The URL is kept in the browser's `localStorage`, nowhere else.

## Setup

[SETUP.md](SETUP.md) — deploy the Worker, then put the page on GitHub Pages.
About fifteen minutes, most of it waiting for pages to load.

## Note

Educational tool, not financial advice. Every figure is an estimate from a
simplified model and data that is typically delayed about 15 minutes and can be
wrong. Selling puts and calls can lose far more than the premium collected.
Verify every number in your broker before acting, and talk to a licensed
professional about your own situation.
