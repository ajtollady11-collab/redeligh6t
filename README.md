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

## Checkout
Paste a checkout link into `checkoutUrl` for each market. `{qty}` is replaced with the quantity.
- Shopify: `https://YOURSTORE.myshopify.com/cart/VARIANT_ID:{qty}`
- Stripe Payment Link: paste the link (set quantity rules in Stripe)
Until then, the checkout button shows a "not connected yet" note.

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
- Real reviews (search the page for `PLACEHOLDER`), or connect a reviews app
- Delivery times (search `[X–X]`) and processing time
- Charging type and battery life (FAQ)
- LED colours: page assumes red, blue and amber. Change in the `modes` list in the script if different
- Guarantee length (`guaranteeDays`, currently 30)
- Safety wording against your supplier's instruction manual
- Footer links: shipping, returns, privacy, terms, contact email
- Newsletter: connect the form to Klaviyo or Mailchimp
