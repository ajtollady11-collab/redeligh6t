# AURELI product site

Static site (one `index.html`) plus one small Vercel function (`api/geo.js`) for UK/US pricing.

## Deploy (GitHub + Vercel)
1. Put these files in a GitHub repo, keeping the folder structure:
   ```
   index.html
   api/geo.js
   ```
2. In Vercel: Add New Project, import the repo, Framework preset "Other", deploy.
3. Every push to GitHub redeploys automatically.

## Pricing (fixed per market, never converted)
Edit the `CONFIG` block near the bottom of `index.html`.
- UK: £49.99, compare-at £79.99, gift value £29.99
- US: $64.99, compare-at $89.99, gift value $39.99 (confirm this)
Visitors in the UK see £, US see $. Detection uses Vercel's IP country, with a timezone fallback.
Everyone else sees `defaultMarket`. Visitors can switch with the UK £ / US $ toggle.

## Checkout (Square)
The bag's "Checkout securely" button (and "Buy it now") opens `checkout.html` on your own site,
where customers enter email, phone and shipping address. "Continue to payment" calls
`api/checkout.js` (the only payment file), which creates a Square payment page for the exact quantity with those details
already filled in, so customers only add payment there (card, Apple Pay, Google Pay).
After paying, customers land on `thank-you.html`. Orders, with shipping address, appear in your
Square Dashboard.
Prices are set in `api/checkout.js` (PRICES), not in the browser, so they can't be tampered with.
If you change a price, change it there AND in CONFIG in `index.html` AND in MARKETS in `checkout.html`.

Set these in Vercel > Project > Settings > Environment Variables, then redeploy.
To check the connection at any time, open https://YOUR-SITE/api/checkout?check=1

- `SQUARE_ACCESS_TOKEN`  production access token (developer.squareup.com > your app > Credentials)
- `SQUARE_LOCATION_ID`   developer.squareup.com > your app > Locations
- `SQUARE_CURRENCY`      `GBP` for a UK Square account, `USD` for a US one
- `SQUARE_ENVIRONMENT`   optional: `sandbox` while testing with sandbox credentials

US orders: a Square account can only charge in its own currency. US shoppers see $64.99 on the
site; at checkout they're charged the GBP equivalent at the day's European Central Bank rate
(in `api/checkout.js`, refreshed every 6 hours). The checkout page shows the exact GBP amount before
they pay. If the rate service is down, a fallback rate is used: set `FX_FALLBACK_USD_GBP` in Vercel
(e.g. `0.75`) and update it occasionally.

## Images
All 19 product images are in `images/` as WebP, each in three sizes (`-s` 240px, `-m` 640px, `-l` full).
Upload the whole `images` folder to the repo alongside `index.html`.
To swap an image later, export a new file and overwrite all three sizes with the same names.

Still placeholders on purpose: the 5 UGC videos and the review photos (add real ones when you have them).

## Swapping placeholders for real assets
Upload images to an `images/` folder and video to `video/`.
Every placeholder looks like:
```html
<div class="media r-1"><div class="ph">…[LABEL]…</div></div>
```
Replace the inner `<div class="ph">…</div>` with:
```html
<img src="/images/hero.jpg" alt="Aureli wand with three free gifts" loading="lazy">
```
For UGC videos:
```html
<video src="/video/ugc-01.mp4" poster="/video/ugc-01.jpg" playsinline muted loop controls></video>
```
The ratio class (`r-1`, `r-45`, `r-916`, `r-43`) keeps the layout identical once assets are in.
Use `loading="eager"` (not lazy) on the first hero image.

## Before launch, fill in / confirm
- Charging type and battery life (FAQ)
- LED colours: page assumes red, blue and amber. Change in the `modes` list in the script if different
- Guarantee length (`guaranteeDays`, currently 30)
- Safety wording against your supplier's instruction manual
- Footer links: shipping, returns, privacy, terms, contact email
- Newsletter: connect the form to Klaviyo or Mailchimp

## Shipping
Processing 1–2 business days, shipping 4–8 business days (UK and US), total 5–10 business days.
Shown in: price area, trust row, Shipping & returns dropdown, FAQ, final CTA, cart, and `shipping.html` (footer link).

## Reviews (imported from your previous store)
The 1,300+ count is written into `index.html` (search `1,300+`). Update it there if the number changes.
Imported reviews go in `reviews.json` at the top level of the repo. Each review looks like:
```json
{ "name": "Sarah M.", "rating": 5, "title": "Optional headline", "body": "Review text", "date": "2026-09-01", "photo": "/images/reviews/sarah.jpg" }
```
`title` and `photo` are optional. The page shows 12 at a time with a "Show more reviews" button.
While `reviews.json` is empty (`[]`), the section shows a short "being transferred" note instead.

## Orders dashboard (/admin.html)
Password-protected page listing every paid order from Square with name, email, phone and
shipping address. Tick orders off as fulfilled (and untick), save carrier, tracking number,
tracking link and a private note, search, and export a CSV.

Setup in Vercel (then redeploy):
- Settings > Environment Variables: add `DASHBOARD_PASSWORD` (12+ characters). Nothing else needed.
Files: `admin.html` (page) and `api/admin.js` (server). Changing the password signs everyone out.
Orders come from Square. Ticks, tracking and notes are saved as metadata on each Square order
(keys aureli_status, aureli_link, aureli_note). Orders stay "open" in Square on purpose, because
Square locks completed orders. Don't mark orders complete in Square's own app, or they lock here too.

## Legal pages
- `/privacy-policy`, `/terms-of-service`, `/cookie-policy` are `privacy-policy.html`, `terms-of-service.html`,
  `cookie-policy.html`, served at the short addresses by the rewrites in `vercel.json`. Shared styles: `legal.css`.
- Linked from the homepage footer (Legal column), "Returns & refunds" in the Help column, and the checkout page.
- Before launch, replace the two dashed "to be added" boxes on each page with the trader's full name and
  geographic business address (search the three files for `class="tbc"`).
- The cookie policy lists everything the site stores. If you ever add analytics, pixels or email marketing,
  update the Cookie and Privacy policies and add a consent tool BEFORE the new scripts load.

## Worldwide sales and currencies
- Header and footer have a currency menu. GBP (£49.99) and USD ($64.99) are fixed prices. All other currencies
  are shown by converting the GBP price at the day's ECB rate (via /api/checkout?rates=1) and charged as £49.99.
- Currency list: CONFIG.currencies in index.html and CURRENCIES in checkout.html (keep them the same).
- Checkout accepts any country except BLOCKED (Cuba, Iran, North Korea, Syria, Russia, Belarus). The list is in
  both checkout.html and api/checkout.js; keep them the same.
- Postcode and county/state are only required for the UK (postcode) and US (ZIP and state).
- Import duties notice appears on checkout for non-UK addresses, in the shipping policy, FAQ and terms.
