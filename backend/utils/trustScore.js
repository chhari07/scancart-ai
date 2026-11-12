// backend/utils/trustScore.js
// Single source of truth for the trust-score fusion formula — imported by orchestrator.js.

export const FUSION_WEIGHTS = {
  review: 0.20, rating: 0.10, seller: 0.25, price: 0.15, quality: 0.10, compliance: 0.20,
}

/**
 * Trust Score fusion:
 *   reviewScore     = 100 - fakePercent - botPercent/2 - 15 if a review-date burst was found (weight 20%)
 *   ratingScore     = ratingCredibilityScore (penalised if above healthy range) (weight 10%)
 *   sellerScore     = sellerTrustScore                          (weight 25%)
 *   priceScore      = priceSuspicious ? 15 : priceScore         (weight 15%)
 *   qualityScore    = qualityScore                              (weight 10%)
 *   complianceScore = complianceEngine's score                  (weight 20%)
 *
 * Hard floors (each a ceiling clamp; the most punitive one wins — they do not average away):
 *   - unverified seller + high/critical counterfeit risk → capped at 49
 *   - unverified seller + medium counterfeit risk        → capped at 64
 *   - 1+ critical compliance breach                       → capped at 39
 *   - 2+ high-severity compliance breaches                → capped at 59
 *   - 1 high-severity compliance breach                   → capped at 69
 */
export function calculateTrustScore({ review = {}, rating = {}, seller = {}, price = {}, quality = {}, compliance = {} }) {
  // An engine marked `unavailable` (it threw and returned nothing real) is left out,
  // and the remaining weights are re-normalised — a missing check never contributes
  // an invented number. Returns null when no engine produced a result.
  const components = [
    { key: 'review',     engine: review,     score: () => Math.max(0, 100 - (review.fakePercent ?? 15) - Math.round((review.botPercent ?? 0) / 2) - (review.dateSpike ? 15 : 0)) },
    { key: 'rating',     engine: rating,     score: () => Math.max(0, (rating.ratingCredibilityScore ?? 65) - (rating.ratingAboveRange ? 20 : 0)) },
    { key: 'seller',     engine: seller,     score: () => seller.sellerTrustScore ?? 65 },
    { key: 'price',      engine: price,      score: () => price.priceSuspicious ? 15 : (price.priceScore ?? 60) },
    { key: 'quality',    engine: quality,    score: () => quality.qualityScore ?? 65 },
    { key: 'compliance', engine: compliance, score: () => compliance.complianceScore ?? 75 },
  ].filter(c => !c.engine.unavailable)

  if (components.length === 0) return null

  const totalWeight = components.reduce((sum, c) => sum + FUSION_WEIGHTS[c.key], 0)
  const raw = components.reduce((sum, c) => sum + c.score() * FUSION_WEIGHTS[c.key], 0) / totalWeight

  let trustScore = clamp(Math.round(raw), 0, 100)

  // ── Seller-risk hard floor ──
  if (!seller.sellerVerified && (seller.counterfeitRisk === 'high' || seller.counterfeitRisk === 'critical')) {
    trustScore = Math.min(trustScore, 49)
  } else if (!seller.sellerVerified && seller.counterfeitRisk === 'medium') {
    trustScore = Math.min(trustScore, 64)
  }

  // ── Compliance-breach hard floor ──
  const breaches = compliance.breaches || []
  const criticalBreaches = breaches.filter(b => b.severity === 'critical').length
  const highBreaches     = breaches.filter(b => b.severity === 'high').length
  if (criticalBreaches >= 1) {
    trustScore = Math.min(trustScore, 39)
  } else if (highBreaches >= 2) {
    trustScore = Math.min(trustScore, 59)
  } else if (highBreaches === 1) {
    trustScore = Math.min(trustScore, 69)
  }

  return trustScore
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }

/**
 * 5-level trust classification (from spec):
 *   90–100 : HIGHLY AUTHENTIC
 *   70–89  : AUTHENTIC
 *   50–69  : CAUTION
 *   30–49  : SUSPICIOUS
 *   0–29   : AVOID
 */
export function getTrustLevel(score) {
  if (score >= 90) return 'HIGHLY AUTHENTIC'
  if (score >= 70) return 'AUTHENTIC'
  if (score >= 50) return 'CAUTION'
  if (score >= 30) return 'SUSPICIOUS'
  return 'AVOID'
}

export function buildAuthenticitySummary(score, seller, review, compliance) {
  const fake = review.unavailable ? null : (review.fakeReviewPercent ?? review.fakePercent ?? null)
  const risk = seller.unavailable ? 'unknown' : (seller.counterfeitRisk ?? 'unknown')
  const breachNote = compliance?.breaches?.length ? `, ${compliance.breaches.length} compliance concern(s)` : ''
  const fakeNote = fake === null ? 'review check unavailable' : `${fake}% fake reviews`
  if (score >= 70) return `High confidence — Genuine product (${risk} counterfeit risk${breachNote})`
  if (score >= 50) return `Medium confidence — Proceed with caution (${fakeNote}${breachNote})`
  return `HIGH RISK — Likely counterfeit (${risk} risk, ${fakeNote}${breachNote})`
}
