// Run with: npm test   (no API key or Firebase needed)
import { test } from 'node:test'
import assert from 'node:assert/strict'

delete process.env.ANTHROPIC_API_KEY
const { runAgenticScan, dataAvailable } = await import('../services/orchestrator.js')

test('empty page → no verdict built from nothing', async () => {
  await assert.rejects(
    runAgenticScan({ url: 'https://www.amazon.in/dp/B0TEST1234', productData: {} }),
    /No checks could run/,
  )
})

test('price only → review/rating/seller checks are left out, not faked', async () => {
  const r = await runAgenticScan({
    url: 'https://www.amazon.in/dp/B0TEST1234',
    productData: { productName: 'Generic USB cable', price: 299 },
  })
  assert.equal(r.fakeReviewPercent, null)
  assert.equal(r.botReviewPercent, null)
  assert.deepEqual(r.ratingDistribution, [])
  assert.equal(r.sellerRating, null)
  assert.equal(r.agentResults.reviewEngine.source, 'failed')
  assert.equal(r.agentResults.sellerShield.source, 'failed')
  assert.equal(r.agentResults.pricePiggy.success, true)
})

test('full page data → all checks run on backup rules, seller rating not invented', async () => {
  const r = await runAgenticScan({
    url: 'https://www.amazon.in/dp/B0TEST1234',
    productData: {
      productName: 'boAt Airdopes 141 earbuds', price: 1299, rating: 4.1,
      numRatings: 52000, numReviews: 3100, seller: 'Appario Retail', platform: 'amazon',
    },
  })
  assert.equal(r.checksCompleted, 6)
  assert.ok(r.trustScore >= 0 && r.trustScore <= 100)
  assert.equal(r.sellerRating, null)
  assert.notEqual(r.counterfeitRisk, 'critical')
})

test('dataAvailable reads only real values', () => {
  assert.deepEqual(dataAvailable({ price: '0', rating: '', seller: '  ' }),
    { rating: false, reviews: false, seller: false, price: false })
})
