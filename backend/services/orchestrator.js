// backend/services/orchestrator.js
// Runs 5 agents in PARALLEL via Promise.allSettled, then the Compliance Engine.
// Total time = slowest single agent.
// Alternatives are NOT part of the main scan: that agent does live Amazon look-ups and
// was slower than the extension's time limit, so one slow agent failed the whole scan.
// It now runs on demand via runAlternatives() → POST /api/scan/alternatives.
import { reviewEngineAgent    } from '../agents/reviewEngineAgent.js'
import { ratingEngineAgent    } from '../agents/ratingEngineAgent.js'
import { sellerShieldAgent    } from '../agents/sellerShieldAgent.js'
import { pricePiggyAgent      } from '../agents/pricePiggyAgent.js'
import { qualityStarAgent     } from '../agents/qualityStarAgent.js'
import { alternativeLightbulbAgent } from '../agents/alternativeLightbulbAgent.js'
import { complianceEngineAgent } from '../agents/complianceEngineAgent.js'
import { calculateTrustScore, getTrustLevel, buildAuthenticitySummary } from '../utils/trustScore.js'
import { detectPlatform } from '../utils/platformDetector.js'

export async function runAgenticScan({ url, productData, userId }) {
  const startTime = Date.now()
  console.log(`\n[ScanCart Orchestrator] Starting scan: ${url}`)
  console.log(`[ScanCart Orchestrator] Product: ${productData?.productName || productData?.name || 'unknown'}`)

  const input = { url, productData, userId }

  // ── Data gate: a check only runs when the page gave it something to check.
  // Without this, an empty scan produced default numbers (10% fake reviews,
  // a made-up star split, "critical" counterfeit risk from a price of 0).
  const has = dataAvailable(productData)
  const gated = (ok, why, run) => ok ? run() : Promise.reject(new Error(`Skipped: ${why}`))

  // ── 5 agents in parallel ───────────────────────────────────────────
  const [
    reviewResult,
    ratingResult,
    sellerResult,
    priceResult,
    qualityResult,
  ] = await Promise.allSettled([
    gated(has.reviews, 'no rating or review counts on the page', () => reviewEngineAgent(input)),
    gated(has.rating,  'no star rating on the page',             () => ratingEngineAgent(input)),
    gated(has.seller,  'no seller name on the page',             () => sellerShieldAgent(input)),
    gated(has.price,   'no price on the page',                   () => pricePiggyAgent(input)),
    gated(has.rating && has.reviews, 'no rating data on the page', () => qualityStarAgent(input)),
  ])

  const elapsed = Date.now() - startTime
  console.log(`[ScanCart Orchestrator] All agents done in ${elapsed}ms`)

  // ── Extract with safe fallbacks ────────────────────────────────────
  // A failed engine gets `unavailable: true` and empty values — never invented
  // numbers. calculateTrustScore leaves unavailable engines out of the fusion.
  const review = getValue(reviewResult, {
    fakePercent: null, botPercent: null, realPercent: null,
    reviewRatingRatio: null, reviewPatternScore: null,
    redFlags: [], reviewSummary: 'Review check unavailable for this scan.',
    totalReviews: 0, totalRatings: 0,
  })
  const rating = getValue(ratingResult, {
    currentRating: parseFloat(productData?.rating || 0), numRatings: 0,
    healthyRangeMin: null, healthyRangeMax: null,
    ratingInHealthyRange: null, ratingAboveRange: false, ratingBelowRange: false,
    ratingCredibilityScore: null, suspicionLevel: null,
    estimatedDistribution: [],
    category: 'default', ratingSummary: 'Rating check unavailable for this scan.',
  })
  const seller = getValue(sellerResult, {
    sellerRating: null, sellerVerified: null, sellerTrustScore: null,
    counterfeitRisk: null, priceSuspicious: false,
    sellerHistory: 'Seller check unavailable for this scan.',
  })
  const price = getValue(priceResult, {
    currentPrice: productData?.price || 0, priceScore: null,
    priceSuspicious: false,
    bestPrice: { platform: null, price: 0, url: null, savings: 0 },
    priceFair: 'Price check unavailable for this scan.',
  })
  const quality = getValue(qualityResult, {
    qualityScore: null, specAccuracy: null, brandAuthenticity: null,
    hasWarranty: null, qualitySummary: 'Quality data unavailable', recommendBuy: null,
  })

  // ── Phase 2 — Compliance Engine (runs after seller/price are known) ─
  let complianceSettled
  try {
    if (!has.seller && !has.price) throw new Error('Skipped: no seller or price on the page')
    complianceSettled = { status: 'fulfilled', value: await complianceEngineAgent({ url, productData, seller, price }) }
  } catch (reason) {
    complianceSettled = { status: 'rejected', reason }
  }
  const compliance = getValue(complianceSettled, {
    complianceScore: null, checks: [], breaches: [], checksSkipped: [],
    complianceSummary: 'Compliance check unavailable for this scan.',
    disclaimer: 'Heuristic/estimated audit — not a verified government check.',
    confidence: 0,
  })

  // ── Trust Score fusion (single source of truth in utils/trustScore.js) ──
  const trustScore = calculateTrustScore({ review, rating, seller, price, quality, compliance })
  if (trustScore === null) {
    // Nothing real to score — an error is more honest than a verdict built from nothing.
    throw new Error("No checks could run for this product — the page did not give a price, rating, reviews or seller.")
  }
  const trustLevel = getTrustLevel(trustScore)

  const engines = [review, rating, seller, price, quality, compliance]
  const checksCompleted = engines.filter(e => !e.unavailable).length
  const checksFromBackupRules = engines.filter(e => !e.unavailable && e.source !== 'claude').length

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
      platform: price.bestPrice?.platform || null,
      price:    price.bestPrice?.price    || 0,
      url:      price.bestPrice?.url      || null,
      savings:  price.bestPrice?.savings  || 0,
    },
    savings:         price.bestPrice?.savings  || 0,
    priceDiffReason: price.priceDiffReason     || null,
    priceFactors:    price.priceFactors        || [],
    altPriceRange:   price.altPriceRange       || null,
    fairMarketPrice: price.fairMarketPrice     || 0,
    mrp:             price.mrp                 || 0,
    priorPriceVerdict: price.priorPriceVerdict || null,

    // ── Engine 7 — Compliance ──
    complianceScore:        compliance.complianceScore,
    complianceChecks:       compliance.checks || [],
    complianceBreaches:     compliance.breaches || [],
    complianceChecksSkipped: compliance.checksSkipped || [],
    complianceSummary:      compliance.complianceSummary,
    complianceDisclaimer:   compliance.disclaimer,

    // ── Engine 5 — Alternatives: loaded on demand (POST /api/scan/alternatives) ──
    alternativesOnDemand:  true,
    alternative:           null,
    alternatives:          [],
    allAlternatives:       [],
    totalAlternativesFound: 0,
    alternativeSummary:    '',

    // ── Analysis text (legacy — kept for backward compat) ──
    analysis: {
      reviewPattern:  buildReviewPatternSummary(review),
      ratingAnalysis: rating.ratingSummary,
      sellerHistory:  seller.sellerHistory,
      priceFair:      price.priceFair,
      authenticity:   buildAuthenticitySummary(trustScore, seller, review, compliance),
    },

    // ── AI Summary — structured bullet-point sections ──
    aiSummary: buildAISummary(trustScore, trustLevel, review, rating, seller, price, quality, compliance),

    // ── Meta ──
    scanDurationMs: elapsed,
    checksCompleted,
    checksTotal: engines.length,
    checksFromBackupRules,
    agentResults: {
      reviewEngine:         agentStatus(review),
      ratingEngine:         agentStatus(rating),
      sellerShield:         agentStatus(seller),
      pricePiggy:           agentStatus(price),
      qualityStar:          agentStatus(quality),
      complianceEngine:     agentStatus(compliance),
    },
  }

  logSummary(result)
  return result
}

// On-demand Alternatives — only runs when the user asks for cheaper options.
export async function runAlternatives({ url, productData }) {
  const started = Date.now()
  const alt = await alternativeLightbulbAgent({ url, productData })
  return {
    alternative:            alt.bestAlternative ? normaliseRichAlt(alt.bestAlternative) : null,
    alternatives:           (alt.alternatives || alt.allAlternatives || []).map(normaliseAlt),
    allAlternatives:        (alt.allAlternatives || []).map(normaliseRichAlt),
    totalAlternativesFound: alt.totalAlternativesFound || 0,
    alternativeSummary:     alt.alternativeSummary || '',
    source:                 alt.source || 'heuristic',
    durationMs:             Date.now() - started,
  }
}

function getValue(settled, fallback) {
  if (settled.status === 'fulfilled' && settled.value) return settled.value
  const why = settled.reason?.message || 'no result'
  if (why.startsWith('Skipped:')) console.log(`[ScanCart Orchestrator] ${why}`)
  else console.error('[ScanCart Orchestrator] Agent failed:', why)
  return { ...fallback, unavailable: true }
}

// What the scraped page actually contains — each check needs real input.
export function dataAvailable(d = {}) {
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 }
  return {
    rating:  num(d?.rating),
    reviews: num(d?.numRatings) || num(d?.reviewCount) || num(d?.numReviews)
             || (Array.isArray(d?.reviewTexts) && d.reviewTexts.length > 0),
    seller:  typeof d?.seller === 'string' && d.seller.trim().length > 0,
    price:   num(d?.price),
  }
}

// 'claude' = model-backed · 'heuristic' / 'search' = the agent's own backup rules · 'failed' = left out
function agentStatus(engine) {
  if (engine.unavailable) return { success: false, source: 'failed' }
  return { success: true, source: engine.source || 'heuristic' }
}

function unavailableSection(id, title) {
  return {
    id, title, level: 'unknown', verdict: 'Check unavailable',
    points: ['This check could not run for this scan, so it is left out of the Trust Score.'],
  }
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
    price:    a.price ?? null,
    priceIsEstimate: a.priceIsEstimate === true,
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

// Builds structured AI summary — 6 scannable sections, each with bullet points
function buildAISummary(trustScore, trustLevel, review, rating, seller, price, quality, compliance) {
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

  // ── 5. Compliance Audit (heuristic) ─────────────────────────────────
  const breaches = compliance.breaches || []
  const complianceLevel = breaches.some(b => b.severity === 'critical') ? 'danger'
    : breaches.some(b => b.severity === 'high' || b.severity === 'medium') ? 'warning' : 'safe'
  const compliancePoints = breaches.length === 0
    ? ['No compliance concerns detected in this heuristic audit.']
    : breaches.slice(0, 4).map(b => `${b.field}: ${b.message}`)
  if (compliance.disclaimer) compliancePoints.push(compliance.disclaimer)  // always shown, non-negotiable
  sections.push({
    id:      'compliance',
    title:   'Compliance Audit (Heuristic)',
    level:   complianceLevel,
    verdict: complianceLevel === 'danger' ? 'Major Gaps' : complianceLevel === 'warning' ? 'Some Gaps' : 'Looks Compliant',
    points:  compliancePoints,
  })

  // Engines that failed get an honest "unavailable" section instead of a verdict built on empty values.
  const engineById = { reviews: review, rating, seller, price, compliance }
  for (let i = 0; i < sections.length; i++) {
    if (engineById[sections[i].id]?.unavailable) sections[i] = unavailableSection(sections[i].id, sections[i].title)
  }

  // ── 6. Overall Verdict — cites concrete evidence, not vague adjectives ──
  const overallLevel = trustScore >= 70 ? 'safe' : trustScore >= 45 ? 'warning' : 'danger'
  const evidence = collectTopEvidence({ review, rating, seller, price, compliance })
  const overallPoints = [`Trust score ${trustScore}/100 (${trustLevel})`]
  const skipped = [review, rating, seller, price, quality, compliance].filter(e => e.unavailable).length
  if (skipped > 0) overallPoints.push(`${skipped} check(s) could not run and were left out of this score`)
  if (evidence.length) overallPoints.push(...evidence)
  else overallPoints.push(trustScore >= 70 ? 'No significant negative signals found across engines.' : 'Mixed signals across engines — see individual sections above.')
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

// Ranks the strongest concrete facts across all engines for the Overall Verdict section —
// replaces vague adjectives ("some concerns detected") with cited evidence.
function collectTopEvidence({ review, rating, seller, price, compliance }, n = 3) {
  const candidates = []
  if (!review.unavailable && review.fakePercent >= 25)
    candidates.push({ weight: review.fakePercent, text: `${review.fakePercent}% of reviews flagged as fake` })
  if (!rating.unavailable && rating.ratingAboveRange)
    candidates.push({ weight: 40, text: `Rating is statistically above the healthy range (${rating.healthyRangeMin}–${rating.healthyRangeMax})` })
  if (!seller.unavailable && !seller.sellerVerified)
    candidates.push({
      weight: { critical: 90, high: 70, medium: 40 }[seller.counterfeitRisk] ?? 30,
      text: `Seller "${seller.sellerName || 'Unknown'}" not verified as an authorized retailer (${seller.counterfeitRisk || 'unknown'} counterfeit risk)`,
    })
  if (price.priceSuspicious)
    candidates.push({
      weight: 60,
      text: `Price flagged as suspicious${price.priorPriceVerdict?.discountClaimHonest === false ? ' — discount claim contradicted by ScanCart\'s own tracked price history' : ''}`,
    })
  for (const b of (compliance.breaches || []))
    candidates.push({
      weight: { critical: 95, high: 70, medium: 40, low: 15 }[b.severity] ?? 20,
      text: `${b.field}: ${b.message}`,
    })
  return candidates.sort((a, b) => b.weight - a.weight).slice(0, n).map(c => c.text)
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
  console.log(`  Duration:    ${r.scanDurationMs}ms\n`)
}
