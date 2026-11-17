// Where to buy: same product on other sites + its own review check. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAmazonListing, reviewCheck, findSameProduct } from '../services/sameProduct.js'

const pad = '<div>' + 'x'.repeat(4000) + '</div>'
const page = (reviews) => `<html>${pad}
<span id="acrPopover" class="reviewCountTextLinkedHistogram" title="4.3 out of 5 stars"></span>
<span id="acrCustomerReviewText" class="a-size-base">12,345 ratings</span>
<a aria-label="64 percent of reviews have 5 stars"></a><a aria-label="21 percent of reviews have 4 stars"></a>
<a aria-label="7 percent of reviews have 3 stars"></a><a aria-label="3 percent of reviews have 2 stars"></a><a aria-label="5 percent of reviews have 1 stars"></a>
<a id="sellerProfileTriggerId" href="/sp?x">Appario Retail</a> Fulfilled by Amazon
${reviews.map(r => `<span data-hook="review-body" class="a-size-base"><div class="a-expander"><span>${r}</span></div></span>`).join('\n')}
</html>`

const REVIEWS = [
  'Using it for 3 months now. Battery easily lasts a full day and the camera is great in daylight, but low light photos are a bit noisy.',
  'Bought during the sale, delivered in 2 days. Display is bright and sharp. Only issue is the charger is not included in the box.',
  'Good product',
  'BEST BEST BEST PRODUCT EVER AMAZING SUPERB!!!!! MUST BUY!!!!!',
  'After 2 weeks of use the phone heats up while charging. Otherwise performance is smooth and the build quality feels premium.',
]

test('reads rating, count, star split, seller and reviews from an Amazon page', () => {
  const l = parseAmazonListing(page(REVIEWS))
  assert.equal(l.rating, 4.3); assert.equal(l.ratingCount, 12345)
  assert.deepEqual(l.stars, { 5: 64, 4: 21, 3: 7, 2: 3, 1: 5 })
  assert.equal(l.seller, 'Appario Retail'); assert.equal(l.fulfilled, true)
  assert.equal(l.reviews.length, 5)
})

test('a CAPTCHA page is not read', () => {
  assert.equal(parseAmazonListing(pad + 'Type the characters you see in this image'), null)
})

test('review check: real / fake split and a real quote', () => {
  const r = reviewCheck(REVIEWS, 'Samsung Galaxy S24 smartphone')
  assert.equal(r.checked, 5); assert.equal(r.realPercent, 60); assert.equal(r.fakePercent, 20)
  assert.equal(r.verdict, 'mostly_real'); assert.ok(r.quote.length > 20)
})

test('only the same product is opened and checked', async () => {
  const search = async () => [
    { name: 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage)', price: 62999, url: 'https://www.amazon.in/dp/B0AAAAAAA1', platform: 'amazon' },
    { name: 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 256GB Storage)', price: 69999, url: 'https://www.amazon.in/dp/B0AAAAAAA2', platform: 'amazon' },
  ]
  const opened = []
  const fetchPage = async (u) => { opened.push(u); return parseAmazonListing(page(REVIEWS)) }
  const r = await findSameProduct({ url: 'https://www.flipkart.com/x/p/itm1?pid=MOB1', productData: { productName: 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage)', price: 64999, platform: 'flipkart' } }, { search, fetchPage })
  assert.deepEqual(opened, ['https://www.amazon.in/dp/B0AAAAAAA1'])
  assert.equal(r.listings.length, 1)
  const l = r.listings[0]
  assert.equal(l.diff, -2000); assert.equal(l.rating, 4.3); assert.equal(l.reviews.verdict, 'mostly_real'); assert.equal(l.ratingCheck.ok, true)
})

test('reads the 2026 Amazon review layout', () => {
  const html = pad + `<span id="acrCustomerReviewText" aria-label="58,685 Reviews" class="a-size-small">(58,685)</span>
  <a id='sellerProfileTriggerId' class='a-size-small'>Cocoblu Retail</a>
  <div data-hook="reviewRichContentContainer" lang="en-IN" class="x"><p><span>Perfect fitting for the phone and the leather quality is good after 2 weeks</span></p></div>`
  const l = parseAmazonListing(html)
  assert.equal(l.ratingCount, 58685); assert.equal(l.seller, 'Cocoblu Retail')
  assert.deepEqual(l.reviews, ['Perfect fitting for the phone and the leather quality is good after 2 weeks'])
})
