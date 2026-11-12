// v2: price history, discount verdict, review bursts, quick badge, watches. Run: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'

delete process.env.ANTHROPIC_API_KEY
process.env.SCANCART_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scancart-test-'))
const store = await import('../services/priceStore.js')
const { reviewDateSpike, parseReviewDate } = await import('../utils/reviewSpike.js')
const { scanRouter } = await import('../routes/scan.js')
const { priceRouter } = await import('../routes/price.js')
const { watchRouter } = await import('../routes/watch.js')
const DAY = 864e5

test('same Amazon product with different tracking links → same key', () => {
  const a = store.productKeyFor({ url: 'https://www.amazon.in/boAt-Airdopes/dp/B0ABCDE123?ref=xyz&tag=a' })
  const b = store.productKeyFor({ url: 'https://amazon.in/gp/product/b0abcde123/' })
  assert.equal(a, b)
})

test('price history: dedupes repeats, keeps changes, summarises', async () => {
  store._resetLocalStore()
  const k = 'k1', now = Date.now()
  assert.equal(await store.recordPrice(k, { price: 1000, at: now - 5 * DAY }), true)
  assert.equal(await store.recordPrice(k, { price: 1000, at: now - 5 * DAY + 3600e3 }), false)   // same price within 6 h
  assert.equal(await store.recordPrice(k, { price: 900, at: now - 3 * DAY }), true)
  assert.equal(await store.recordPrice(k, { price: 0 }), false)                                    // never store 0
  const s = store.summarise(await store.getHistory(k))
  assert.deepEqual([s.low, s.high, s.count], [900, 1000, 2])
})

test('discount verdict: not enough history → says so', () => {
  const v = store.discountVerdict([{ t: Date.now() - DAY, price: 999 }], { price: 999, mrp: 1999 })
  assert.equal(v.status, 'not_enough_history')
})

test('discount verdict: big "% off" but same price for days → fake sale', () => {
  const now = Date.now()
  const pts = [10, 7, 4, 2].map(d => ({ t: now - d * DAY, price: 1499 }))
  const v = store.discountVerdict(pts, { price: 1499, mrp: 2999 })
  assert.equal(v.status, 'fake_sale')
  assert.equal(v.claimedDiscountPercent, 50)
})

test('discount verdict: below every earlier price → new low', () => {
  const now = Date.now()
  const pts = [9, 6, 3].map((d, i) => ({ t: now - d * DAY, price: 2000 + i * 50 }))
  assert.equal(store.discountVerdict(pts, { price: 1799, mrp: 2999 }).status, 'new_low')
})

test('review dates: parses store formats', () => {
  const now = Date.UTC(2026, 10, 12)
  assert.equal(parseReviewDate('Reviewed in India on 3 November 2026', now), Date.UTC(2026, 10, 3))
  assert.equal(parseReviewDate('November 3, 2026', now), Date.UTC(2026, 10, 3))
  assert.equal(parseReviewDate('2 days ago', now), now - 2 * DAY)
  assert.equal(parseReviewDate('no date here', now), null)
  assert.equal(parseReviewDate('3 months ago', now), null, 'too rough to place in a 3-day window')
  assert.equal(parseReviewDate('Nov, 2025', now), null)
})

test('review burst: 6 of 8 reviews in 2 days → spike', () => {
  const now = Date.UTC(2026, 10, 12)
  const d = (n) => new Date(now - n * DAY).toISOString()
  const r = reviewDateSpike([d(60), d(40), d(10), d(10), d(9), d(9), d(9), d(11)], { now })
  assert.equal(r.checked, true); assert.equal(r.spike, true); assert.ok(r.peak.count >= 6)
})

test('review burst: spread-out dates → no spike; too few → not checked', () => {
  const now = Date.UTC(2026, 10, 12)
  const spread = Array.from({ length: 10 }, (_, i) => new Date(now - i * 12 * DAY).toISOString())
  assert.equal(reviewDateSpike(spread, { now }).spike, false)
  assert.equal(reviewDateSpike(spread.slice(0, 3), { now }).checked, false)
})

// ── routes, on a throwaway server ──
const app = express(); app.use(express.json())
app.use('/api/scan', scanRouter); app.use('/api/price', priceRouter); app.use('/api/watch', watchRouter)
const server = await new Promise(r => { const s = app.listen(0, () => r(s)) })
const base = `http://127.0.0.1:${server.address().port}`
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.json() }))
test.after(() => server.close())

const PAGE = { url: 'https://www.amazon.in/dp/B0TEST9999', productData: { productName: 'boAt Airdopes 141', price: 1299, mrpPrice: 4490, rating: 4.1, numRatings: 52000, numReviews: 3100, seller: 'Appario Retail', platform: 'amazon' } }

test('quick badge: rules only, fast, then cached', async () => {
  const t0 = Date.now()
  const a = await post('/api/scan/quick', PAGE)
  assert.equal(a.status, 200); assert.equal(a.body.result.quick, true)
  assert.ok(a.body.result.trustScore >= 0 && a.body.result.trustScore <= 100)
  assert.ok(Date.now() - t0 < 3000, 'quick check should not call AI or the web')
  const b = await post('/api/scan/quick', PAGE)
  assert.equal(b.body.cached, true)
  assert.equal((await post('/api/scan/quick', { url: PAGE.url, productData: {} })).status, 422)
})

test('price observe: saves + returns history', async () => {
  const r = await post('/api/price/observe', { url: 'https://www.flipkart.com/x/p/itm1?pid=ABC123', productData: { productName: 'Kettle', price: 799, mrpPrice: 1299 } })
  assert.equal(r.status, 200); assert.equal(r.body.store, 'local-file'); assert.ok(r.body.points.length >= 1)
  assert.equal(r.body.discount.status, 'not_enough_history')
  assert.equal((await post('/api/price/observe', { url: 'https://x.in/p', productData: { price: 0 } })).status, 400)
})

test('watches: add, list, price drop hits target once, delete', async () => {
  const owner = 'install_test_123'
  const w = (await post('/api/watch', { ownerId: owner, url: PAGE.url, productName: 'Airdopes', currentPrice: 1299, targetPrice: 1100 })).body.watch
  const list = await fetch(`${base}/api/watch?ownerId=${owner}`).then(r => r.json())
  assert.equal(list.watches.length, 1)
  const c1 = (await post('/api/watch/check', { ownerId: owner, prices: [{ id: w.id, price: 1199 }] })).body.results[0]
  assert.equal(c1.dropped, true); assert.equal(c1.hitTarget, false)
  const c2 = (await post('/api/watch/check', { ownerId: owner, prices: [{ id: w.id, price: 1049 }] })).body.results[0]
  assert.equal(c2.hitTarget, true)
  const c3 = (await post('/api/watch/check', { ownerId: owner, prices: [{ id: w.id, price: 1049 }] })).body.results[0]
  assert.equal(c3.hitTarget, false, 'no repeat alert while it stays below target')
  const other = (await post('/api/watch/check', { ownerId: 'someone_else', prices: [{ id: w.id, price: 1 }] })).body.results
  assert.equal(other.length, 0, 'cannot touch another owner\'s watch')
  assert.equal((await fetch(`${base}/api/watch/${w.id}?ownerId=${owner}`, { method: 'DELETE' })).status, 200)
})
