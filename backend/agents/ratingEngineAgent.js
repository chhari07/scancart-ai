// backend/agents/ratingEngineAgent.js
// ENGINE 1B — Rating Engine: range analysis, volume credibility, distribution chart.
// LOCAL LOGIC first, then Claude enhancement. Never throws.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { detectCategory } from '../utils/priceValidator.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

// Healthy rating ranges per category for Indian e-commerce
const HEALTHY_RANGES = {
  electronics:  { min: 3.8, max: 4.6 },
  cosmetics:    { min: 3.5, max: 4.5 },
  clothing:     { min: 3.6, max: 4.4 },
  books:        { min: 3.9, max: 4.7 },
  appliances:   { min: 3.7, max: 4.5 },
  default:      { min: 3.5, max: 4.6 },
}

// More granular category detection for this agent
function detectRatingCategory(productName = '') {
  const n = productName.toLowerCase()
  if (/phone|mobile|laptop|tv\b|television|earphone|headphone|speaker|camera|tablet|watch|charger|earbuds|iphone|galaxy|pixel|oneplus|redmi|realme/.test(n)) return 'electronics'
  if (/foundation|lipstick|moisturizer|serum|shampoo|cream|lotion|sunscreen|kajal|nail|perfume|skincare|makeup/.test(n)) return 'cosmetics'
  if (/shirt|jeans|kurta|saree|dress|jacket|shoes|sneaker|sandal|slipper|hoodie|t-shirt|footwear/.test(n)) return 'clothing'
  if (/mixer|grinder|fan\b|air conditioner|\bac\b|refrigerator|washing machine|iron\b|microwave|pressure cooker|geyser/.test(n)) return 'appliances'
  if (/book|novel|guide|textbook|notes/.test(n)) return 'books'
  return 'default'
}

// Estimated star distribution from rating + volume
function estimateDistribution(rating, numRatings) {
  const r = parseFloat(rating) || 3.5
  // 5-star % ≈ (rating - 1) / 4 * 80 + 10
  const fiveStar = Math.round(((r - 1) / 4) * 80 + 10)

  // Distribute remaining across 4,3,2,1 proportionally
  // High-rated products: more 4-star, less 1-star
  const remaining = 100 - fiveStar
  const fourStar  = Math.round(remaining * 0.50)
  const threeStar = Math.round(remaining * 0.25)
  const twoStar   = Math.round(remaining * 0.15)
  const oneStar   = 100 - fiveStar - fourStar - threeStar - twoStar  // ensure sum = 100

  return [
    { stars: 5, percent: Math.max(0, fiveStar),  label: '5 star' },
    { stars: 4, percent: Math.max(0, fourStar),  label: '4 star' },
    { stars: 3, percent: Math.max(0, threeStar), label: '3 star' },
    { stars: 2, percent: Math.max(0, twoStar),   label: '2 star' },
    { stars: 1, percent: Math.max(0, oneStar),   label: '1 star' },
  ]
}

export async function ratingEngineAgent({ productData }) {
  console.log('[ScanCart RatingEngine] Starting analysis...')

  const local = localRatingAnalysis(productData)

  try {
    const category = detectRatingCategory(productData?.productName || productData?.name || '')
    const prompt = `You are a RATING ENGINE AI for Indian e-commerce. Analyse star rating distribution and credibility.

Product: "${productData?.productName || productData?.name || 'Unknown'}"
Rating: ${productData?.rating || 0} / 5
Number of Ratings: ${productData?.numRatings || productData?.reviewCount || 0}
Category: ${category}
Platform: ${productData?.platform || 'amazon'}

Healthy rating ranges for ${category}:
  min: ${local.healthyRangeMin}, max: ${local.healthyRangeMax}

Tasks:
1. Determine if rating is in healthy range, above it (suspicious), or below it (quality issue).
2. Calculate rating credibility from volume: base = rating * log(numRatings + 1) / 5, scale 0-100.
3. Estimate realistic 5-star distribution percentages (must sum to 100).
4. Assess suspicion level.

Return ONLY valid JSON:
{
  "ratingCredibilityScore": <0-100 integer>,
  "ratingInHealthyRange": <boolean>,
  "ratingAboveRange": <boolean>,
  "ratingBelowRange": <boolean>,
  "suspicionLevel": <"none"|"low"|"medium"|"high">,
  "estimatedDistribution": [
    {"stars": 5, "percent": <integer>, "label": "5 star"},
    {"stars": 4, "percent": <integer>, "label": "4 star"},
    {"stars": 3, "percent": <integer>, "label": "3 star"},
    {"stars": 2, "percent": <integer>, "label": "2 star"},
    {"stars": 1, "percent": <integer>, "label": "1 star"}
  ],
  "ratingSummary": "<one sentence>",
  "confidence": <0-100>
}`

    const enhanced = await claudeJsonWithTimeout(prompt, 700, TIMEOUT)
    console.log('[ScanCart RatingEngine] Claude enhanced result')

    // Validate distribution sums to 100
    const dist = enhanced.estimatedDistribution || local.estimatedDistribution
    const distSum = dist.reduce((s, d) => s + (d.percent || 0), 0)
    const validDist = distSum === 100 ? dist : local.estimatedDistribution

    return {
      agent: 'ratingEngine',
      currentRating:         parseFloat(productData?.rating || 0),
      numRatings:            parseInt(productData?.numRatings || productData?.reviewCount || 0),
      healthyRangeMin:       local.healthyRangeMin,
      healthyRangeMax:       local.healthyRangeMax,
      ratingInHealthyRange:  enhanced.ratingInHealthyRange  ?? local.ratingInHealthyRange,
      ratingAboveRange:      enhanced.ratingAboveRange      ?? local.ratingAboveRange,
      ratingBelowRange:      enhanced.ratingBelowRange      ?? local.ratingBelowRange,
      ratingCredibilityScore: clamp(enhanced.ratingCredibilityScore ?? local.ratingCredibilityScore, 0, 100),
      suspicionLevel:        enhanced.suspicionLevel        || local.suspicionLevel,
      estimatedDistribution: validDist,
      category:              local.category,
      ratingSummary:         enhanced.ratingSummary         || local.ratingSummary,
      confidence:            enhanced.confidence            || local.confidence,
      success: true,
    }
  } catch (err) {
    console.warn('[ScanCart RatingEngine] Claude failed, using local:', err.message)
    return { agent: 'ratingEngine', ...local, success: true }
  }
}

function localRatingAnalysis(d = {}) {
  const rating     = parseFloat(d.rating || 0)
  const numRatings = parseInt(d.numRatings || d.reviewCount || 0)
  const name       = d.productName || d.name || ''

  const category = detectRatingCategory(name)
  const range     = HEALTHY_RANGES[category] || HEALTHY_RANGES.default

  const ratingInHealthyRange = rating >= range.min && rating <= range.max
  const ratingAboveRange     = rating > range.max
  const ratingBelowRange     = rating < range.min && rating > 0

  // Credibility: base = rating * log(numRatings + 1) / 5, scale to 0-100
  const base = numRatings > 0
    ? (rating * Math.log(numRatings + 1)) / 5
    : 0
  const ratingCredibilityScore = clamp(base * 20, 0, 100)

  const suspicionLevel = ratingAboveRange && rating > 4.7
    ? 'high'
    : ratingAboveRange
    ? 'medium'
    : ratingBelowRange
    ? 'low'
    : 'none'

  const estimatedDistribution = estimateDistribution(rating, numRatings)

  return {
    currentRating:         rating,
    numRatings,
    healthyRangeMin:       range.min,
    healthyRangeMax:       range.max,
    ratingInHealthyRange,
    ratingAboveRange,
    ratingBelowRange,
    ratingCredibilityScore,
    suspicionLevel,
    estimatedDistribution,
    category,
    ratingSummary: ratingAboveRange
      ? `Rating ${rating}/5 is above healthy range (${range.min}–${range.max}) — possible manipulation`
      : ratingBelowRange
      ? `Rating ${rating}/5 is below healthy range — product may have genuine quality issues`
      : `Rating ${rating}/5 falls within healthy range (${range.min}–${range.max}) for ${category}`,
    confidence: numRatings > 1000 ? 75 : numRatings > 100 ? 55 : 35,
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v) || 0)) }
