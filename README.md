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
`api/checkout.js`, which creates a Square payment page for the exact quantity with those details
already filled in, so customers only add payment there (card, Apple Pay, Google Pay).
After paying, customers land on `thank-you.html`. Orders, with shipping address, appear in your
Square Dashboard.
Prices are set in `api/checkout.js` (PRICES), not in the browser, so they can't be tampered with.
If you change a price, change it there AND in CONFIG in `index.html`.

Set these in Vercel > Project > Settings > Environment Variables, then redeploy:
- `SQUARE_ACCESS_TOKEN`  production access token (developer.squareup.com > your app > Credentials)
- `SQUARE_LOCATION_ID`   developer.squareup.com > your app > Locations
- `SQUARE_CURRENCY`      `GBP` for a UK Square account, `USD` for a US one
- `SQUARE_ENVIRONMENT`   optional: `sandbox` while testing with sandbox credentials

A Square account can only charge in its own country's currency. A second account for the other
market can be added with `SQUARE_US_ACCESS_TOKEN` + `SQUARE_US_LOCATION_ID` (or `SQUARE_UK_...`).
Without it, checkout for that market shows "isn't available yet".

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
