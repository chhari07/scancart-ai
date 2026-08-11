// backend/services/orchestrator.js
// Runs 6 agents in PARALLEL via Promise.allSettled.
// Total time = slowest single agent.
import { reviewEngineAgent    } from '../agents/reviewEngineAgent.js'
import { ratingEngineAgent    } from '../agents/ratingEngineAgent.js'
import { sellerShieldAgent    } from '../agents/sellerShieldAgent.js'
import { pricePiggyAgent      } from '../agents/pricePiggyAgent.js'
import { qualityStarAgent     } from '../agents/qualityStarAgent.js'
import { alternativeLightbulbAgent } from '../agents/alternativeLightbulbAgent.js'
import { getTrustLevel, buildAuthenticitySummary } from '../utils/trustScore.js'
import { detectPlatform } from '../utils/platformDetector.js'

export async function runAgenticScan({ url, productData, userId }) {
  const startTime = Date.now()
  console.log(`\n[ScanCart Orchestrator] Starting scan: ${url}`)
  console.log(`[ScanCart Orchestrator] Product: ${productData?.productName || productData?.name || 'unknown'}`)

  const input = { url, productData, userId }

  // ── 6 agents in parallel ───────────────────────────────────────────
  const [
    reviewResult,
    ratingResult,
    sellerResult,
    priceResult,
    qualityResult,
    alternativeResult,
  ] = await Promise.allSettled([
    reviewEngineAgent(input),
    ratingEngineAgent(input),
    sellerShieldAgent(input),
    pricePiggyAgent(input),
    qualityStarAgent(input),
    alternativeLightbulbAgent(input),
  ])

  const elapsed = Date.now() - startTime
  console.log(`[ScanCart Orchestrator] All agents done in ${elapsed}ms`)

  // ── Extract with safe fallbacks ────────────────────────────────────
  const review = getValue(reviewResult, {
    fakePercent: 15, botPercent: 5, realPercent: 80,
    reviewRatingRatio: 5, reviewPatternScore: 72,
    redFlags: [], reviewSummary: 'Analysis unavailable, using baseline estimate',
    totalReviews: 0, totalRatings: 0,
  })
  const rating = getValue(ratingResult, {
    currentRating: 0, numRatings: 0,
    healthyRangeMin: 3.5, healthyRangeMax: 4.6,
    ratingInHealthyRange: true, ratingAboveRange: false, ratingBelowRange: false,
    ratingCredibilityScore: 65, suspicionLevel: 'none',
    estimatedDistribution: defaultDistribution(),
    category: 'default', ratingSummary: 'Rating analysis unavailable',
  })
  const seller = getValue(sellerResult, {
    sellerRating: 4.0, sellerVerified: true, sellerTrustScore: 65,
    counterfeitRisk: 'medium', priceSuspicious: false,
    sellerHistory: 'Analysis unavailable',
  })
  const price = getValue(priceResult, {
    currentPrice: productData?.price || 0, priceScore: 60,
    priceSuspicious: false,
    bestPrice: { platform: 'Flipkart', price: productData?.price || 0, url: '#', savings: 0 },
    priceFair: 'Within market range',
  })
  const quality = getValue(qualityResult, {
    qualityScore: 65, specAccuracy: 65, brandAuthenticity: 70,
    hasWarranty: true, qualitySummary: 'Quality data unavailable', recommendBuy: true,
  })
  const alternative = getValue(alternativeResult, {
    bestAlternative: { name: 'Similar Product', price: 0, reason: 'Check manually', platformUrl: '#', platform: 'amazon', indianBrand: false, whyAlternative: '', alternativeType: 'value' },
    allAlternatives: [], alternatives: [], totalAlternativesFound: 0,
    alternativeSummary: '',
  })

  // ── Trust Score (5 signals, weights sum to 1.0) ────────────────────
  const reviewScore  = Math.max(0, 100 - review.fakePercent - Math.round(review.botPercent / 2))
  const ratingScore  = Math.max(0, rating.ratingCredibilityScore - (rating.ratingAboveRange ? 20 : 0))
  const sellerScore  = seller.sellerTrustScore  || 65
  const priceScore   = price.priceSuspicious ? 15 : (price.priceScore || 60)
  const qualityScore = quality.qualityScore    || 65

  const rawScore = (reviewScore * 0.25) + (ratingScore * 0.15) + (sellerScore * 0.30) + (priceScore * 0.15) + (qualityScore * 0.15)
  let trustScore = Math.max(0, Math.min(100, Math.round(rawScore)))

  // Safety floor: an unverified seller with high/critical counterfeit risk must never
  // produce an AUTHENTIC result — other signals cannot compensate for a bad seller.
  if (!seller.sellerVerified && (seller.counterfeitRisk === 'high' || seller.counterfeitRisk === 'critical')) {
    trustScore = Math.min(trustScore, 49)  // cap at SUSPICIOUS ceiling
  } else if (!seller.sellerVerified && seller.counterfeitRisk === 'medium') {
    trustScore = Math.min(trustScore, 64)  // cap at CAUTION ceiling
  }

  const trustLevel = getTrustLevel(trustScore)

  const result = {
    // ── Core ──
    productName:  productData?.productName || productData?.name || extractNameFromUrl(url),
    productPrice: productData?.price || price.currentPrice || 0,
    platform:     productData?.platform || detectPlatform(url),
    url,

    // ── Trust ──
    trustScore,
    trustLevel,

    // ── Engine 1A — Review ──
    fakeReviewPercent:           review.fakePercent,
    botReviewPercent:            review.botPercent,
    realReviewPercent:           review.realPercent,
    reviewRatingRatio:           review.reviewRatingRatio,
    totalReviews:                review.totalRatings || productData?.numRatings || productData?.reviewCount || 0,
    reviewTextsAnalysed:         review.reviewTextsAnalysed  || 0,
    similarProductsCompared:     review.similarProductsCompared || 0,

    // ── Engine 1B — Rating ──
    ratingDistribution:      rating.estimatedDistribution,
    ratingCredibilityScore:  rating.ratingCredibilityScore,
    ratingHealthyRange:      { min: rating.healthyRangeMin, max: rating.healthyRangeMax },
    ratingAboveHealthyRange: rating.ratingAboveRange,
    ratingBelowHealthyRange: rating.ratingBelowRange,
    ratingSuspicionLevel:    rating.suspicionLevel,

    // ── Engine 2 — Seller ──
    sellerName:       seller.sellerName      || productData?.seller || '',
    sellerRating:     seller.sellerRating,
    sellerVerified:   seller.sellerVerified,
    sellerType:       seller.sellerType      || 'unknown',
    counterfeitRisk:  seller.counterfeitRisk,
    sellerProfileUrl: seller.sellerProfileUrl || null,
    googleMapsUrl:    seller.googleMapsUrl    || null,
    googleSearchUrl:  seller.googleSearchUrl  || null,
    locationNote:     seller.locationNote     || null,

    // ── Engine 3 — Price ──
    bestPrice: {
      platform: price.bestPrice?.platform || 'Flipkart',
      price:    price.bestPrice?.price    || 0,
      url:      price.bestPrice?.url      || '#',
      savings:  price.bestPrice?.savings  || 0,
    },
    savings:         price.bestPrice?.savings  || 0,
    priceDiffReason: price.priceDiffReason     || null,
    priceFactors:    price.priceFactors        || [],
    altPriceRange:   price.altPriceRange       || null,
    fairMarketPrice: price.fairMarketPrice     || 0,

    // ── Engine 5 — Alternatives ──
    alternative:           alternative.bestAlternative,
    alternatives:          (alternative.alternatives || alternative.allAlternatives || []).map(normaliseAlt),
    allAlternatives:       (alternative.allAlternatives || []).map(normaliseRichAlt),
    totalAlternativesFound: alternative.totalAlternativesFound || 0,
    alternativeSummary:    alternative.alternativeSummary || '',

    // ── Analysis text (legacy — kept for backward compat) ──
    analysis: {
      reviewPattern:  buildReviewPatternSummary(review),
      ratingAnalysis: rating.ratingSummary,
      sellerHistory:  seller.sellerHistory,
      priceFair:      price.priceFair,
      authenticity:   buildAuthenticitySummary(trustScore, seller, review),
    },

    // ── AI Summary — structured bullet-point sections ──
    aiSummary: buildAISummary(trustScore, review, rating, seller, price, quality),

    // ── Meta ──
    scanDurationMs: elapsed,
    agentResults: {
      reviewEngine:        { success: reviewResult.status      === 'fulfilled' },
      ratingEngine:        { success: ratingResult.status      === 'fulfilled' },
      sellerShield:        { success: sellerResult.status      === 'fulfilled' },
      pricePiggy:          { success: priceResult.status       === 'fulfilled' },
      qualityStar:         { success: qualityResult.status     === 'fulfilled' },
      alternativeLightbulb:{ success: alternativeResult.status === 'fulfilled' },
    },
  }

  logSummary(result)
  return result
}

function getValue(settled, fallback) {
  if (settled.status === 'fulfilled') return settled.value
  console.error('[ScanCart Orchestrator] Agent failed:', settled.reason?.message)
  return fallback
}

function extractNameFromUrl(url) {
  try {
    return new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0]
      .replace(/[-_]/g, ' ').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 60)
  } catch { return 'Product' }
}

function normaliseAlt(a) {
  return {
    name:     a.name,
    brand:    a.brand    || (a.name || '').split(' ')[0],
    price:    a.price    || 0,
    platform: a.platform || 'amazon',
    url:      a.url      || a.platformUrl || '#',
    image:    a.image    || null,
    reason:   a.reason   || a.whyAlternative || '',
    type:     a.type     || a.alternativeType || 'value',
    savings:  a.savings  || a.priceAnalysis?.savingsAmount || 0,
  }
}

function normaliseRichAlt(a) {
  return {
    ...a,
    url: a.url || a.platformUrl || '#',
    image: a.image || null,
  }
}

function defaultDistribution() {
  return [
    { stars: 5, percent: 60, label: '5 star' },
    { stars: 4, percent: 25, label: '4 star' },
    { stars: 3, percent: 9,  label: '3 star' },
    { stars: 2, percent: 4,  label: '2 star' },
    { stars: 1, percent: 2,  label: '1 star' },
  ]
}

// Builds structured AI summary — 5 scannable sections, each with bullet points
function buildAISummary(trustScore, review, rating, seller, price, quality) {
  const sections = []

  // ── 1. Review Authenticity ─────────────────────────────────────────
  const reviewLevel = review.fakePercent >= 50 ? 'danger' : review.fakePercent >= 25 ? 'warning' : 'safe'
  const reviewPoints = [
    `${review.realPercent}% genuine, ${review.fakePercent}% fake, ${review.botPercent}% bot-generated`,
  ]
  if (review.reviewTextsAnalysed > 0)
    reviewPoints.push(`${review.reviewTextsAnalysed} actual user review texts analysed for language patterns`)
  if (review.similarProductsCompared > 0)
    reviewPoints.push(`Compared against ${review.similarProductsCompared} similar products on Amazon`)
  if (review.redFlags?.length > 0)
    reviewPoints.push(...review.redFlags.slice(0, 2))
  if (review.comparisonNote)
    reviewPoints.push(review.comparisonNote)
  sections.push({
    id:      'reviews',
    title:   'Review Authenticity',
    level:   reviewLevel,
    verdict: reviewLevel === 'danger' ? 'High Fake Risk' : reviewLevel === 'warning' ? 'Moderate Concern' : 'Looks Genuine',
    points:  reviewPoints,
  })

  // ── 2. Rating Credibility ──────────────────────────────────────────
  const ratingLevel = rating.ratingAboveRange || rating.suspicionLevel === 'high' ? 'warning'
    : rating.ratingBelowRange ? 'warning' : 'safe'
  const ratingPoints = [
    `Credibility score: ${rating.ratingCredibilityScore}/100`,
  ]
  if (rating.ratingAboveRange)
    ratingPoints.push(`Rating is above healthy range (${rating.healthyRangeMin}–${rating.healthyRangeMax}) — statistically suspicious`)
  else if (rating.ratingBelowRange)
    ratingPoints.push(`Rating is below healthy range (${rating.healthyRangeMin}–${rating.healthyRangeMax}) — possible quality issues`)
  else
    ratingPoints.push(`Rating falls within the healthy range (${rating.healthyRangeMin || 3.5}–${rating.healthyRangeMax || 4.6}) for this category`)
  if (rating.suspicionLevel && rating.suspicionLevel !== 'none')
    ratingPoints.push(`Suspicion level: ${rating.suspicionLevel}`)
  if (rating.ratingSummary)
    ratingPoints.push(rating.ratingSummary)
  sections.push({
    id:      'rating',
    title:   'Rating Credibility',
    level:   ratingLevel,
    verdict: ratingLevel === 'danger' ? 'Suspicious' : ratingLevel === 'warning' ? 'Review Carefully' : 'Credible',
    points:  ratingPoints,
  })

  // ── 3. Seller Verification ─────────────────────────────────────────
  const sellerLevel = seller.counterfeitRisk === 'critical' || seller.counterfeitRisk === 'high' ? 'danger'
    : seller.counterfeitRisk === 'medium' ? 'warning' : 'safe'
  const TYPE_READABLE = {
    brand_official:      'Brand\'s official store',
    authorized_reseller: 'Authorized reseller',
    established_3p:      'Established third-party seller',
    new_3p:              'New or low-history seller',
    suspicious:          'Suspicious seller pattern',
  }
  const sellerPoints = [
    seller.sellerVerified
      ? `Seller verified — ${TYPE_READABLE[seller.sellerType] || 'trusted seller'}`
      : `Seller "${seller.sellerName || 'Unknown'}" could not be verified as an authorized retailer`,
  ]
  if (seller.locationNote) sellerPoints.push(seller.locationNote)
  if (seller.sellerHistory) sellerPoints.push(seller.sellerHistory)
  if (seller.priceSuspicious) sellerPoints.push('Price is below expected market range — counterfeit risk elevated')
  sections.push({
    id:      'seller',
    title:   'Seller Verification',
    level:   sellerLevel,
    verdict: sellerLevel === 'danger' ? 'High Risk' : sellerLevel === 'warning' ? 'Use Caution' : 'Trusted',
    points:  sellerPoints,
  })

  // ── 4. Price Analysis ──────────────────────────────────────────────
  const hasSavings   = (price.bestPrice?.savings || 0) > 0
  const priceLevel   = price.priceSuspicious ? 'danger' : hasSavings ? 'warning' : 'safe'
  const pricePoints  = []
  if (price.priceDiffReason) pricePoints.push(price.priceDiffReason)
  if (price.priceFactors?.length > 0) pricePoints.push(...price.priceFactors.slice(0, 2))
  if (price.altPriceRange?.positionNote) pricePoints.push(price.altPriceRange.positionNote)
  if (hasSavings)
    pricePoints.push(`Rs. ${price.bestPrice.savings.toLocaleString('en-IN')} cheaper on ${price.bestPrice.platform}`)
  if (pricePoints.length === 0) pricePoints.push(price.priceFair || 'Price is within normal market range')
  sections.push({
    id:      'price',
    title:   'Price Analysis',
    level:   priceLevel,
    verdict: price.priceSuspicious ? 'Suspicious' : hasSavings ? 'Better Deal Exists' : 'Fair Price',
    points:  pricePoints,
  })

  // ── 5. Overall Verdict ─────────────────────────────────────────────
  const overallLevel  = trustScore >= 70 ? 'safe' : trustScore >= 45 ? 'warning' : 'danger'
  const overallPoints = [
    trustScore >= 70
      ? `Trust score ${trustScore}/100 — product appears genuine and safe to buy`
      : trustScore >= 45
      ? `Trust score ${trustScore}/100 — proceed with caution; some concerns detected`
      : `Trust score ${trustScore}/100 — high risk of counterfeit, inflated reviews, or fraud`,
  ]
  if (quality.qualitySummary && quality.qualitySummary !== 'Quality data unavailable')
    overallPoints.push(quality.qualitySummary)
  if (quality.hasWarranty === false)
    overallPoints.push('No warranty information found — verify before purchase')
  if (quality.recommendBuy === false)
    overallPoints.push('Quality analysis does not recommend this purchase')
  else if (quality.recommendBuy === true && trustScore >= 60)
    overallPoints.push('Quality analysis supports purchasing this product')
  sections.push({
    id:      'verdict',
    title:   'Overall Verdict',
    level:   overallLevel,
    verdict: trustScore >= 70 ? 'Safe to Buy' : trustScore >= 45 ? 'Buy with Caution' : 'Avoid',
    points:  overallPoints,
  })

  return sections
}

// Builds a rich review pattern summary including text analysis and alt comparison
function buildReviewPatternSummary(review) {
  let summary = review.reviewSummary || 'Review pattern analysis unavailable'

  const extras = []
  if (review.reviewTextsAnalysed > 0) {
    extras.push(`Analysed ${review.reviewTextsAnalysed} actual user review texts`)
  }
  if (review.similarProductsCompared > 0) {
    extras.push(`Compared with ${review.similarProductsCompared} similar products`)
  }
  if (review.comparisonNote) {
    extras.push(review.comparisonNote)
  }

  return extras.length > 0 ? `${summary} (${extras.join('; ')})` : summary
}

function logSummary(r) {
  console.log(`\n[ScanCart Orchestrator] SCAN SUMMARY`)
  console.log(`  Product:     ${r.productName}`)
  console.log(`  Trust Score: ${r.trustScore} (${r.trustLevel})`)
  console.log(`  Fake Reviews:  ${r.fakeReviewPercent}%`)
  console.log(`  Bot Reviews:   ${r.botReviewPercent}%`)
  console.log(`  Real Reviews:  ${r.realReviewPercent}%`)
  console.log(`  Rating Range:  ${r.ratingHealthyRange.min} to ${r.ratingHealthyRange.max}`)
  console.log(`  Rating Score:  ${r.ratingCredibilityScore}`)
  console.log(`  Seller:      ${r.sellerName} — ${r.sellerVerified ? 'Verified' : 'Unverified'} (${r.sellerRating}/5, type: ${r.sellerType})`)
  console.log(`  Best Price:  Rs.${r.bestPrice?.price} on ${r.bestPrice?.platform}`)
  console.log(`  Alternatives:  ${r.totalAlternativesFound} found`)
  console.log(`  Duration:    ${r.scanDurationMs}ms\n`)
}
