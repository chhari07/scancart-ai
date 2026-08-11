// backend/agents/qualityStarAgent.js
// ENGINE 4 — Quality Star
// LOCAL LOGIC first, then Claude enhancement.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { detectCategory } from '../utils/priceValidator.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

export async function qualityStarAgent({ productData }) {
  console.log('[ScanCart QualityStar] Starting quality analysis')

  const local = localQualityAnalysis(productData)

  try {
    const prompt = `You are a PRODUCT QUALITY ANALYST AI for Indian e-commerce.

Product: "${productData?.productName || productData?.name || 'Unknown'}"
Rating: ${productData?.rating || 0} / 5
Num Ratings: ${productData?.numRatings || productData?.reviewCount || 0}
Price: Rs. ${productData?.price || 0}
Seller: "${productData?.seller || 'Unknown'}"
Platform: ${productData?.platform || 'amazon'}
Category: ${detectCategory(productData?.productName || productData?.name || '')}

Assess product quality for Indian market. Consider:
- Brand authenticity from product name and seller
- BIS/ISI certification for electronics/appliances
- FSSAI for food, AYUSH for health products
- Rating volume vs quality claim (high rating with few reviews = suspicious)
- Price vs expected quality level

Quality credibility = rating x log(numRatings + 1) / 5

Return ONLY valid JSON:
{
  "qualityScore": <0-100>,
  "specAccuracy": <0-100>,
  "brandAuthenticity": <0-100>,
  "hasWarranty": <boolean>,
  "certifications": ["<cert>"],
  "qualitySummary": "<one sentence>",
  "recommendBuy": <boolean>,
  "confidence": <0-100>
}`

    const enhanced = await claudeJsonWithTimeout(prompt, 600, TIMEOUT)
    console.log('[ScanCart QualityStar] Claude enhanced result')
    return {
      agent: 'qualityStar',
      qualityScore:    clamp(enhanced.qualityScore    ?? local.qualityScore,    0, 100),
      specAccuracy:    clamp(enhanced.specAccuracy    ?? local.specAccuracy,    0, 100),
      brandAuthenticity: clamp(enhanced.brandAuthenticity ?? local.brandAuthenticity, 0, 100),
      hasWarranty:     enhanced.hasWarranty     ?? local.hasWarranty,
      certifications:  enhanced.certifications  || [],
      qualitySummary:  enhanced.qualitySummary  || local.qualitySummary,
      recommendBuy:    enhanced.recommendBuy    ?? local.recommendBuy,
      confidence:      enhanced.confidence      || local.confidence,
      success: true,
    }
  } catch (err) {
    console.warn('[ScanCart QualityStar] Claude failed, using local result:', err.message)
    return { agent: 'qualityStar', ...local, success: true }
  }
}

function localQualityAnalysis(d = {}) {
  const rating     = parseFloat(d.rating    || 0)
  const numRatings = parseInt(d.numRatings || d.reviewCount || 0)
  const price      = d.price  || 0
  const name       = (d.productName || d.name || '').toLowerCase()

  // Quality credibility = rating * log(numRatings + 1) / 5
  const qualityCredibility = numRatings > 0
    ? Math.min(100, Math.round((rating * Math.log(numRatings + 1) / 5) * 20))
    : 40

  // Brand authenticity from known brand keywords
  const knownBrands = ['apple', 'samsung', 'sony', 'lg', 'nike', 'adidas', 'boat', 'noise',
    'oneplus', 'realme', 'xiaomi', 'mi', 'lakme', 'maybelline', 'loreal', 'philips']
  const brandRecognized = knownBrands.some(b => name.includes(b))

  const qualityScore    = clamp(qualityCredibility, 20, 95)
  const brandAuthenticity = brandRecognized ? 80 : 55
  const specAccuracy    = clamp(rating * 18, 30, 90)
  const hasWarranty     = brandRecognized || price > 2000

  return {
    qualityScore,
    specAccuracy,
    brandAuthenticity,
    hasWarranty,
    qualitySummary: qualityScore >= 70
      ? `Good quality signals — ${numRatings} ratings support the ${rating}/5 score`
      : qualityScore >= 50
      ? `Moderate quality confidence — insufficient ratings to fully trust the ${rating} score`
      : `Low quality confidence — high rating with very few reviews is suspicious`,
    recommendBuy: qualityScore >= 55,
    confidence: numRatings > 500 ? 80 : numRatings > 50 ? 55 : 30,
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || 0)) }
