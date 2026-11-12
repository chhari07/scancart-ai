# ScanCart v1.1: test checklist (12 Nov 2026)

## What's new
**Backend**
- `POST /api/price/observe`: saves the price each time a product page is opened. Returns the price history and an "is the discount real?" verdict.
- `GET /api/price/history?url=`: the saved price points for one listing.
- `POST /api/scan/quick`: a quick Trust Score from page data only (backup rules, no AI, no web look-ups). Cached for 6 hours.
- `GET/POST/DELETE /api/watch` and `POST /api/watch/check`: price watches.
- The scan result now has `priceHistory` (points, summary, discount verdict) and `reviewSpike` (review-burst check).
- A review burst takes 15 points off the review part of the score.
- Storage: uses Firestore when the Firebase key is set; otherwise `backend/data/store.json`.

**Extension**
- Reads schema.org JSON-LD first (name, price, rating, review dates), with CSS selectors as backup. Amazon keeps its own price block.
- On page load:
  - saves the price
  - shows a **QUICK** score on the ScanCart button and the toolbar icon
  - says "Sale looks fake" when the history shows it
  - The panel no longer opens by itself.
- Price tab (popup and in-page panel): discount verdict, a price history graph (real points only), and **Watch this price** with an optional target price.
- Reviews: a "review burst" note when 50% or more of the dated reviews on the page fall within 3 days.
- Bell icon in the popup opens **Price watches**:
  - lists your watches
  - **Check now** checks them straight away
  - a setting turns the quick score off
- Background: checks watches every 6 hours by fetching each product page. It shows a Chrome notification when the price drops or reaches the target. Clicking the notification opens the product.

## Run it
1. Backend:
   - `cd backend && cp .env.example .env` and add `ANTHROPIC_API_KEY` (without it, checks run on backup rules only)
   - `npm install` (first time only), then `npm start` (port 4000)
   - `npm test` runs 15 tests
2. Extension:
   - `cd extension && npm run build`
   - Go to `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `extension/dist`
   - If you loaded it before, press the reload button on the extension card.

## Test it
1. Open an Amazon.in or Flipkart product page. The button at the bottom right shows `ScanCart · checking…`, then `QUICK 62 · Buy with caution` (or similar). The toolbar icon shows the same number.
2. Reload the page later, or on another day. The price history grows by one point each time the price changes. A repeat of the same price within 6 hours is not saved again.
3. Click the button and choose **Real price & discount**. You should see:
   - the discount verdict ("Price history is just starting" for new products)
   - the graph
   - **Watch this price**
4. Click **Watch**, then the bell in the popup. The watch is listed. Click **Check now**. It shows the time of the check, or "Could not check: …" when the store blocks it.
5. Click **Reviews** on a product with many reviews shown on the page. A burst note appears only when the page shows 6 or more reviews with day-level dates.
6. In the popup, the bell's **Settings** turns the quick score off. Reload the product page and the button shows the plain "Scan with ScanCart".

## Known limits (honest)
- The quick score is from page data only and is labelled QUICK. The full AI scan runs when you open the panel or the popup.
- The price history only knows what ScanCart has seen. A new product needs 3+ prices over 2+ days before the fake-sale check can judge it.
- Watch checks fetch the store page from your browser. Amazon and Flipkart sometimes return a captcha. The watch then shows "Could not check" and tries again in 6 hours.
- The review burst uses only the reviews shown on the product page (usually 8–10). Flipkart's "3 months ago" style dates are too rough and are skipped.
- Not done yet (as agreed): deploy, affiliate tags, fetching other stores.
- The website dashboard does not show watches or price history yet.
