// backend/utils/trustScore.js

/**
 * Trust Score formula (from spec):
 *   reviewScore  = 100 - fakeReviewPercent         (weight 30%)
 *   sellerScore  = sellerTrustScore                 (weight 30%)
 *   priceScore   = priceSuspicious ? 20 : priceScore (weight 20%)
 *   qualityScore = qualityScore                     (weight 20%)
 */
export function calculateTrustScore({ review, seller, price, quality }) {
  const reviewScore  = 100 - (review.fakeReviewPercent  ?? 15)
  const sellerScore  = seller.sellerTrustScore           ?? 65
  const priceScore   = price.priceSuspicious ? 20 : (price.priceScore ?? 60)
  const qualityScore = quality.qualityScore              ?? 65

  const total = (
    reviewScore  * 0.30 +
    sellerScore  * 0.30 +
    priceScore   * 0.20 +
    qualityScore * 0.20
  )

  return Math.max(0, Math.min(100, Math.round(total)))
}

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

export function buildAuthenticitySummary(score, seller, review) {
  const fake = review.fakeReviewPercent ?? 15
  const risk = seller.counterfeitRisk ?? 'medium'
  if (score >= 70) return `High confidence — Genuine product (${risk} counterfeit risk)`
  if (score >= 50) return `Medium confidence — Proceed with caution (${fake}% fake reviews)`
  return `HIGH RISK — Likely counterfeit (${risk} risk, ${fake}% fake reviews)`
}
