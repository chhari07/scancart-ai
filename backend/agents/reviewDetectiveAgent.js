// backend/agents/reviewDetectiveAgent.js
// ENGINE 1 — Review Detective
// LOCAL LOGIC first, then Claude enhancement.
import { claudeJsonWithTimeout } from '../services/claude.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

export async function reviewDetectiveAgent({ productData }) {
  console.log('[ScanCart ReviewDetective] Starting review analysis')

  // ── LOCAL LOGIC ─────────────────────────────────────────────────
  const local = localReviewAnalysis(productData)

  // ── CLAUDE ENHANCEMENT ─────────────────────────────────────────
  try {
    const prompt = `You are a REVIEW DETECTIVE AI for Indian e-commerce.

Product: "${productData?.productName || productData?.name || 'Unknown'}"
Rating: ${productData?.rating || 0} / 5
Total Ratings: ${productData?.numRatings || productData?.reviewCount || 0}
Written Reviews: ${productData?.numReviews || 0}
Platform: ${productData?.platform || 'amazon'}

Local analysis baseline (enhance this with your reasoning):
  fakeReviewPercent: ${local.fakeReviewPercent}
  reviewPatternScore: ${local.reviewPatternScore}
  ratingManipulation: ${local.ratingManipulation}

Detect: bot reviews, paid reviews, temporal clustering, rating inflation.
Consider Indian e-commerce patterns: sudden review spikes on festival sales,
copy-paste reviews, generic praise without specifics.

Return ONLY valid JSON:
{
  "fakeReviewPercent": <0-100 integer>,
  "reviewPatternScore": <0-100 integer>,
  "ratingManipulation": <boolean>,
  "redFlags": ["<flag>"],
  "reviewPattern": "<one sentence summary>",
  "confidence": <0-100>
}`

    const enhanced = await claudeJsonWithTimeout(prompt, 600, TIMEOUT)
    console.log('[ScanCart ReviewDetective] Claude enhanced result')
    return {
      agent: 'reviewDetective',
      fakeReviewPercent:  clamp(enhanced.fakeReviewPercent  ?? local.fakeReviewPercent,  0, 100),
      reviewPatternScore: clamp(enhanced.reviewPatternScore ?? local.reviewPatternScore, 0, 100),
      ratingManipulation: enhanced.ratingManipulation ?? local.ratingManipulation,
      redFlags:           enhanced.redFlags            || local.redFlags,
      reviewPattern:      enhanced.reviewPattern       || local.reviewPattern,
      totalReviewsEstimate: productData?.numRatings || productData?.reviewCount || 0,
      confidence:         enhanced.confidence          || local.confidence,
      success: true,
    }
  } catch (err) {
    console.warn('[ScanCart ReviewDetective] Claude failed, using local result:', err.message)
    return { agent: 'reviewDetective', ...local, success: true }
  }
}

// ── Pure JS local analysis ─────────────────────────────────────────
function localReviewAnalysis(d = {}) {
  const rating     = parseFloat(d.rating     || 0)
  const numRatings = parseInt(d.numRatings || d.reviewCount || 0)
  const numReviews = parseInt(d.numReviews || 0)

  let fakeScore = 0
  const redFlags = []

  // Ratio check: high ratings-to-reviews ratio signals paid ratings
  const ratio = numReviews > 0 ? numRatings / numReviews : numRatings > 0 ? 999 : 1
  if (ratio > 10) {
    fakeScore += 35
    redFlags.push(`Ratings-to-reviews ratio is ${Math.round(ratio)}x (suspicious > 10x)`)
  } else if (ratio > 6) {
    fakeScore += 18
    redFlags.push(`Ratings-to-reviews ratio is ${Math.round(ratio)}x (moderate suspicion)`)
  }

  // Near-perfect rating with few reviews
  if (rating > 4.7 && numRatings < 200) {
    fakeScore += 25
    redFlags.push(`Rating ${rating} with only ${numRatings} reviews — suspicious`)
  } else if (rating > 4.5 && numRatings < 50) {
    fakeScore += 30
    redFlags.push(`Very high rating ${rating} with only ${numRatings} reviews — very suspicious`)
  }

  // Very few reviews overall
  if (numRatings < 20 && numRatings > 0) {
    fakeScore += 10
    redFlags.push('Insufficient review volume to assess authenticity')
  }

  const fakeReviewPercent  = clamp(fakeScore, 0, 100)
  const reviewPatternScore = clamp(100 - fakeScore, 0, 100)
  const ratingManipulation = fakeScore >= 30

  return {
    fakeReviewPercent,
    reviewPatternScore,
    ratingManipulation,
    redFlags,
    reviewPattern: ratingManipulation
      ? `Suspicious: ${redFlags[0] || 'unusual review patterns detected'}`
      : `Normal review distribution across ${numRatings} ratings`,
    totalReviewsEstimate: numRatings,
    confidence: numRatings > 100 ? 75 : numRatings > 10 ? 50 : 30,
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || 0)) }
