// Price check: verdicts (good deal / fair / wait / fake discount) + same-product matching. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { priceVerdict } from '../utils/priceVerdict.js'
import { compareProducts, productAttrs } from '../utils/productMatch.js'

process.env.SCANCART_DATA_DIR = fs.mkdtempSync('/tmp/scancart-pc-')
const { findRealBestPrice } = await import('../agents/pricePiggyAgent.js')
const DAY = 864e5, now = Date.UTC(2026, 10, 17, 12)
const series = (prices, mrps = []) => prices.map((price, i) => ({ t: now - (prices.length - i) * 5 * DAY, price, ...(mrps[i] ? { mrp: mrps[i] } : {}) }))

test('verdict file is identical in backend and extension', () => {
  const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
  assert.equal(read('../utils/priceVerdict.js'), read('../../extension/src/utils/priceVerdict.js'))
})

test('not enough history', () => {
  assert.equal(priceVerdict(series([999]), { price: 999, now }).verdict, 'not_enough_history')
})

test('good deal: lowest in the window', () => {
  const v = priceVerdict(series([6299, 6199, 5999, 5499, 5299, 5199]), { price: 4999, mrp: 6999, now })
  assert.equal(v.verdict, 'good_deal'); assert.equal(v.status, 'new_low')
  assert.match(v.title, /^Lowest price in \d+ days$/)
})

test('good deal: within 3% of the lowest', () => {
  const v = priceVerdict(series([5500, 5000, 5400, 5300]), { price: 5100, now })
  assert.equal(v.verdict, 'good_deal'); assert.equal(v.title, 'Close to the lowest price')
})

test('wait: well above the 30-day lowest → "It was ₹X N days ago"', () => {
  const v = priceVerdict(series([5799, 5299, 4999, 5299, 4499, 4999]), { price: 4999, now })
  assert.equal(v.verdict, 'wait'); assert.equal(v.wasPrice, 4499); assert.equal(v.wasDaysAgo, 10)
  assert.equal(v.title, 'It was ₹4,499 10 days ago')
})

test('fair: close to the usual price', () => {
  const v = priceVerdict(series([5500, 5200, 5600, 5300, 5400]), { price: 5400, now })
  assert.equal(v.verdict, 'fair')
})

test('fake discount: MRP raised just before the sale', () => {
  // 90 days at ₹5,499 with MRP ₹5,499; MRP jumps to ₹6,999 nine days ago; "29% off" today at ₹4,999
  const pts = [80, 60, 40, 20, 9, 4].map(d => ({ t: now - d * DAY, price: 5499, mrp: d <= 9 ? 6999 : 5499 }))
  pts.unshift({ t: now - 85 * DAY, price: 5499, mrp: 5499 })
  const v = priceVerdict(pts, { price: 4999, mrp: 6999, now })
  assert.equal(v.verdict, 'fake_discount'); assert.equal(v.status, 'fake_sale')
  assert.equal(v.claimedDiscountPercent, 29); assert.equal(v.realSavingPercent, 9); assert.equal(v.realSavingAmount, 500)
  assert.equal(v.title, '"29% off" is not real'); assert.match(v.message, /raised from ₹5,499 to ₹6,999/)
})

test('fake discount: price pushed up before the sale', () => {
  const pts = [60, 45, 30, 20].map(d => ({ t: now - d * DAY, price: 1000 })).concat([{ t: now - 7 * DAY, price: 1400 }])
  const v = priceVerdict(pts, { price: 950, mrp: 1600, now })
  assert.equal(v.verdict, 'fake_discount'); assert.equal(v.realSavingPercent, 5)
})

test('a real sale is not called fake', () => {
  const pts = [60, 45, 30, 20, 10].map(d => ({ t: now - d * DAY, price: 2000, mrp: 2500 }))
  assert.equal(priceVerdict(pts, { price: 1500, mrp: 2500, now }).verdict, 'good_deal')
})

test('match: 128 GB vs 256 GB, other colour, accessory are left out', () => {
  const page = 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage)'
  assert.equal(compareProducts(page, 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage) with AI').same, true)
  assert.equal(compareProducts(page, 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 256GB Storage)').reason, 'Storage is different')
  assert.equal(compareProducts(page, 'Samsung Galaxy S24 5G (Cobalt Violet, 8GB RAM, 128GB Storage)').reason, 'Colour is different')
  assert.equal(compareProducts(page, 'Spigen Back Cover Case for Samsung Galaxy S24 Black').reason, 'An accessory, not the product')
  assert.equal(compareProducts(page, 'Apple iPhone 15 (128 GB) - Black').reason, 'Different brand')
})

test('match: shoe size and pack size', () => {
  assert.equal(compareProducts('Nike Air Max 270 Running Shoes UK 9 Black', 'Nike Air Max 270 Running Shoes UK 10 Black').reason, 'Size is different')
  assert.equal(compareProducts('Dove Body Wash 250 ml', 'Dove Body Wash 250 ml Pack of 2').reason, 'Pack size is different')
  assert.deepEqual(productAttrs('Galaxy S24 8GB RAM 1TB').storage, [1024])
})

test('best price only comes from the same product', async () => {
  const fake = async () => [
    { name: 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage)', price: 62999, url: 'https://www.amazon.in/dp/B0AAAAAAA1' },
    { name: 'Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 256GB Storage)', price: 59999, url: 'https://www.amazon.in/dp/B0AAAAAAA2' },
    { name: 'Spigen Case for Samsung Galaxy S24', price: 999, url: 'https://www.amazon.in/dp/B0AAAAAAA3' },
  ]
  const r = await findRealBestPrice('Samsung Galaxy S24 5G (Onyx Black, 8GB RAM, 128GB Storage)', 64999, 'flipkart', null, fake)
  assert.equal(r.price, 62999)
  assert.equal(r.matches.matched.length, 1)
  assert.deepEqual(r.matches.excluded.map(e => e.reason), ['Storage is different', 'An accessory, not the product'])
})

test('match: two shades of the same colour are different', () => {
  assert.equal(compareProducts('Samsung Galaxy M35 5G (Moonlight Blue, 6GB RAM, 128GB Storage)', 'Samsung Galaxy M35 5G (DayBreak Blue,6GB RAM,128GB Storage)').reason, 'Colour is different')
  assert.equal(compareProducts('Samsung Galaxy M35 5G (Moonlight Blue, 6GB RAM, 128GB Storage)', 'Samsung Galaxy M35 5G (Moonlight Blue, 6GB RAM, 128GB Storage) | AI').same, true)
})

test('match: number-only model names must match (Airdopes 141 ≠ 219)', () => {
  assert.equal(compareProducts('boAt Airdopes 141 Bluetooth TWS Earbuds (Bold Black)', 'boAt Airdopes 219, 4Mics ENx, 40H Battery (Bold Black)').reason, 'Model number is different')
  assert.equal(compareProducts('boAt Airdopes 141 Bluetooth TWS Earbuds (Bold Black)', 'boAt Airdopes 141 with 42H Playtime, Bluetooth TWS Earbuds (Bold Black)').same, true)
})

test('match: a bundle with extras is not the same product', () => {
  assert.equal(compareProducts('Apple iPhone 16 (128 GB) - Black', 'Apple iPhone 16 128 GB: 5G Mobile Phone Black with Apple Care').reason, 'Sold with extras (bundle)')
})
