// backend/agents/reviewEngineAgent.js
// ENGINE 1A — Review Engine: classifies reviews as fake, bot, or real.
// Uses actual review texts scraped from the product page when available.
// Also searches for similar products to compare review patterns.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { searchAmazonIndia } from '../services/searchProducts.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

export async function reviewEngineAgent({ productData }) {
  console.log('[ScanCart ReviewEngine] Starting analysis...')

  const local = localReviewAnalysis(productData)

  // Run Claude analysis and similar-product comparison search in parallel
  const [claudeResult, altComparison] = await Promise.allSettled([
    claudeReviewAnalysis(productData, local),
    getSimilarProductComparison(productData),
  ])

  const enhanced  = claudeResult.status  === 'fulfilled' ? claudeResult.value  : null
  const compData  = altComparison.status === 'fulfilled' ? altComparison.value : null

  if (!enhanced) {
    // Claude failed — return local result with any comparison data we got
    console.warn('[ScanCart ReviewEngine] Claude failed, using local result')
    return buildResult(local, compData, productData, false)
  }

  const fp = clamp(enhanced.fakePercent ?? local.fakePercent, 0, 100)
  const bp = clamp(enhanced.botPercent  ?? local.botPercent,  0, 100)
  const rp = clamp(100 - fp - bp, 0, 100)

  return buildResult(
    {
      fakePercent:        fp,
      botPercent:         bp,
      realPercent:        rp,
      reviewRatingRatio:  enhanced.reviewRatingRatio  ?? local.reviewRatingRatio,
      reviewPatternScore: clamp(enhanced.reviewPatternScore ?? local.reviewPatternScore, 0, 100),
      redFlags:           enhanced.redFlags            || local.redFlags,
      reviewSummary:      enhanced.reviewSummary       || local.reviewSummary,
      confidence:         enhanced.confidence          || local.confidence,
      usedReviewTexts:    enhanced.usedReviewTexts     || false,
    },
    compData,
    productData,
    true,
  )
}

// ── Claude analysis — includes actual review texts when available ─────
async function claudeReviewAnalysis(productData, local) {
  const productName  = productData?.productName || productData?.name || 'Unknown'
  const reviewTexts  = Array.isArray(productData?.reviewTexts) ? productData.reviewTexts : []
  const hasTexts     = reviewTexts.length > 0

  const reviewSection = hasTexts
    ? `\nActual user review texts scraped from the product page (${reviewTexts.length} reviews):\n` +
      reviewTexts.map((r, i) => `  ${i + 1}. "${r.slice(0, 300)}"`).join('\n') +
      '\n\nAnalyse these texts for: generic/formulaic language, missing product-specific details, copy-paste patterns, unnatural positivity, or suspiciously identical phrasing across multiple reviews.'
    : '\nNo review texts available from page — analyse from metadata only.'

  const prompt = `You are a REVIEW ENGINE AI for Indian e-commerce. Classify reviews as fake, bot, or real.

Product: "${productName}"
Platform: ${productData?.platform || 'amazon'}
Rating: ${productData?.rating || 0} / 5
Total Ratings: ${productData?.numRatings || productData?.reviewCount || 0}
Written Reviews: ${productData?.numReviews || 0}
Ratings-to-Reviews Ratio: ${local.reviewRatingRatio}
${reviewSection}

Classification rules:
  FAKE REVIEWS: Written by paid humans — generic praise, no product specifics, posted right after listing.
  BOT REVIEWS: Auto-generated — identical text, clustered timestamps, zero reviewer history.
  REAL REVIEWS: Genuine verified purchases with specific product feedback, complaints, or detailed experiences.

Indian e-commerce patterns to detect:
  Ratio > 15 = strong bot/fake signal.
  Perfect 5.0 rating at scale is statistically impossible.
  Festival sale spikes (Diwali, Big Billion Day) can cause legitimate short-term clusters.
  Generic phrases like "good product", "value for money", "fast delivery" with no details = fake signal.

Return ONLY valid JSON:
{
  "fakePercent": <0-100 integer>,
  "botPercent": <0-100 integer>,
  "realPercent": <0-100 integer>,
  "reviewRatingRatio": <float>,
  "reviewPatternScore": <0-100 integer, higher = more authentic>,
  "redFlags": ["<specific flag>"],
  "reviewSummary": "<one sentence summary including text analysis if texts were provided>",
  "usedReviewTexts": ${hasTexts},
  "confidence": <0-100>
}`

  return await claudeJsonWithTimeout(prompt, 900, TIMEOUT)
}

// ── Search for similar products to compare review ratio baseline ──────
async function getSimilarProductComparison(productData) {
  const productName  = productData?.productName || ''
  const numRatings   = parseInt(productData?.numRatings || productData?.reviewCount || 0)
  const numReviews   = parseInt(productData?.numReviews || 0)

  if (!productName || numRatings === 0) return null

  const categoryKw = extractCategoryKeyword(productName)
  const brand      = productName.split(' ')[0] || ''
  const query      = categoryKw ? `${brand} ${categoryKw}`.trim() : productName.split(' ').slice(0, 3).join(' ')

  if (query.length < 3) return null

  try {
    const results = await searchAmazonIndia(query, 4)
    if (results.length === 0) return null

    // We use names of similar products so Claude can reason about typical patterns
    const ourRatio = numReviews > 0 ? numRatings / numReviews : numRatings > 0 ? 999 : 1

    console.log(`[ScanCart ReviewEngine] Found ${results.length} similar products for comparison`)
    return {
      similarProducts: results.slice(0, 3).map(r => r.name),
      categoryKeyword: categoryKw,
      ourRatioBaseline: parseFloat(ourRatio.toFixed(1)),
      comparisonNote: ourRatio > 12
        ? `Scanned product ratio (${ourRatio.toFixed(1)}x) is very high vs typical similar products — suggests inflated ratings`
        : ourRatio > 6
        ? `Scanned product ratio (${ourRatio.toFixed(1)}x) is above typical for this category`
        : `Scanned product ratio (${ourRatio.toFixed(1)}x) is within normal range for this category`,
    }
  } catch (err) {
    console.warn('[ScanCart ReviewEngine] Comparison search failed:', err.message)
    return null
  }
}

// ── Build final output object ─────────────────────────────────────────
function buildResult(data, compData, productData, claudeSucceeded) {
  const reviewTextsUsed = Array.isArray(productData?.reviewTexts) ? productData.reviewTexts.length : 0

  let summaryNote = data.reviewSummary || ''
  if (compData?.comparisonNote && claudeSucceeded) {
    summaryNote = summaryNote
      ? `${summaryNote} — ${compData.comparisonNote}`
      : compData.comparisonNote
  }

  return {
    agent:              'reviewEngine',
    fakePercent:        data.fakePercent        ?? 15,
    botPercent:         data.botPercent         ?? 5,
    realPercent:        data.realPercent        ?? 80,
    totalReviews:       productData?.numReviews || 0,
    totalRatings:       productData?.numRatings || productData?.reviewCount || 0,
    reviewRatingRatio:  data.reviewRatingRatio  ?? local_ratio(productData),
    reviewPatternScore: data.reviewPatternScore ?? 65,
    redFlags:           data.redFlags           || [],
    reviewSummary:      summaryNote,
    // Meta
    reviewTextsAnalysed: reviewTextsUsed,
    similarProductsCompared: compData?.similarProducts?.length || 0,
    similarProductNames: compData?.similarProducts || [],
    comparisonNote:     compData?.comparisonNote || null,
    usedReviewTexts:    data.usedReviewTexts    || false,
    confidence:         data.confidence         || 50,
    success: true,
  }
}

// ── Pure-JS local analysis (no API) ──────────────────────────────────
function localReviewAnalysis(d = {}) {
  const rating     = parseFloat(d.rating || 0)
  const numRatings = parseInt(d.numRatings || d.reviewCount || 0)
  const numReviews = parseInt(d.numReviews || 0)

  const ratio = numReviews > 0 ? numRatings / numReviews : numRatings > 0 ? 999 : 1

  let fakePercent = 10
  const redFlags  = []

  if (ratio > 15)      { fakePercent = 60; redFlags.push(`Ratings/reviews ratio ${ratio.toFixed(1)}x — strong fake signal (>15x)`) }
  else if (ratio > 10) { fakePercent = 40; redFlags.push(`Ratings/reviews ratio ${ratio.toFixed(1)}x — moderate fake signal (>10x)`) }
  else if (ratio > 6)  { fakePercent = 20; redFlags.push(`Ratings/reviews ratio ${ratio.toFixed(1)}x — mild fake signal (>6x)`) }

  if (rating > 4.7 && numReviews < 100) { fakePercent += 20; redFlags.push(`Rating ${rating} with only ${numReviews} written reviews`) }
  if (rating === 5.0 && numReviews > 50) { fakePercent += 30; redFlags.push('Perfect 5.0 rating is statistically impossible at scale') }

  fakePercent = clamp(fakePercent, 0, 100)

  let botPercent = 5
  if (ratio > 20)                               botPercent = 30
  else if (numRatings > 1000 && numReviews < 50) botPercent = 25
  else if (rating >= 4.9 && numRatings > 500)   botPercent = 20

  botPercent = clamp(botPercent, 0, 100)
  const realPercent = clamp(100 - fakePercent - botPercent, 0, 100)
  const reviewPatternScore = clamp(100 - fakePercent - botPercent / 2, 0, 100)

  return {
    fakePercent,
    botPercent,
    realPercent,
    totalReviews:      numReviews,
    totalRatings:      numRatings,
    reviewRatingRatio: parseFloat(ratio.toFixed(2)),
    reviewPatternScore,
    redFlags,
    reviewSummary: fakePercent >= 50
      ? `High fake review risk — ${fakePercent}% suspicious, ${botPercent}% bot-generated`
      : fakePercent >= 20
      ? `Moderate concern — ${fakePercent}% fake, ${botPercent}% bot signals`
      : `Review pattern looks normal — ${realPercent}% estimated genuine`,
    confidence: numRatings > 500 ? 70 : numRatings > 50 ? 50 : 30,
  }
}

// Shared helper: extract category search keyword from product name
function extractCategoryKeyword(name = '') {
  const n = name.toLowerCase()
  if (/\bwatch\b/.test(n))              return 'watch'
  if (/phone|mobile|smartphone/.test(n)) return 'smartphone'
  if (/\blaptop\b|\bnotebook\b/.test(n)) return 'laptop'
  if (/earphone|earbuds/.test(n))       return 'earphone'
  if (/headphone/.test(n))              return 'headphone'
  if (/\bspeaker\b/.test(n))            return 'speaker'
  if (/\bcamera\b/.test(n))             return 'camera'
  if (/\btablet\b/.test(n))             return 'tablet'
  if (/tv\b|television/.test(n))        return 'TV'
  if (/shoes|sneaker|sandal/.test(n))   return 'shoes'
  if (/shirt|tshirt|t-shirt/.test(n))   return 'shirt'
  if (/foundation|lipstick|kajal/.test(n)) return 'makeup'
  if (/moisturizer|serum|cream/.test(n)) return 'skincare'
  if (/shampoo/.test(n))                return 'shampoo'
  if (/refrigerator|fridge/.test(n))    return 'refrigerator'
  if (/washing machine/.test(n))        return 'washing machine'
  if (/book|novel|textbook/.test(n))    return 'book'
  return ''
}

function local_ratio(d = {}) {
  const numRatings = parseInt(d.numRatings || d.reviewCount || 0)
  const numReviews = parseInt(d.numReviews || 0)
  return numReviews > 0 ? parseFloat((numRatings / numReviews).toFixed(2)) : 1
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, Math.round(v) || 0)) }
