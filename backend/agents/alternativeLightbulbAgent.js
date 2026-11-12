// backend/agents/alternativeLightbulbAgent.js
// ENGINE 5 — Alternative Lightbulb: Two-Pass Architecture.
// Pass 1: Claude generates N alternatives (names/brands/prices).
// Pass 1b: Verify each via real Amazon scraping — get real URLs, images, prices.
// Pass 2: 3 mini-engines analyse each verified alternative in parallel.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { searchAmazonIndia, amazonSearchUrl, flipkartSearchUrl } from '../services/searchProducts.js'

const PASS1_TIMEOUT = 12000
const N_ALTERNATIVES = 5

// ── HEALTHY RANGES (same as ratingEngineAgent, duplicated to avoid circular dep) ──
const HEALTHY_RANGES = {
  electronics: { min: 3.8, max: 4.6 },
  cosmetics:   { min: 3.5, max: 4.5 },
  clothing:    { min: 3.6, max: 4.4 },
  books:       { min: 3.9, max: 4.7 },
  appliances:  { min: 3.7, max: 4.5 },
  default:     { min: 3.5, max: 4.6 },
}

// ── Indian brand alternatives by category (Vocal for Local) ──────────────
// Used when Amazon search returns only same-brand results.
const INDIAN_BRANDS_BY_CATEGORY = {
  watch:       ['Fastrack', 'Sonata', 'Maxima', 'HMT', 'Timex India'],
  smartphone:  ['Lava', 'Micromax', 'IQOO', 'Nothing'],
  earphone:    ['boAt', 'Noise', 'Boult', 'Zebronics', 'PTron'],
  headphone:   ['boAt', 'Noise', 'Boult', 'Zebronics'],
  speaker:     ['boAt', 'Zebronics', 'Portronics', 'Noise'],
  shoes:       ['Campus', 'Sparx', 'Liberty', 'Lancer', 'Action'],
  shirt:       ['Peter England', 'Allen Solly', 'Van Heusen', 'Arrow'],
  clothing:    ['Fabindia', 'W', 'Biba', 'Jaipur Kurti'],
  skincare:    ['Mamaearth', 'Biotique', 'Himalaya', 'Forest Essentials', 'WOW'],
  shampoo:     ['Mamaearth', 'Biotique', 'Himalaya', 'Indulekha'],
  makeup:      ['Lakme', 'Colorbar', 'SUGAR', 'Mamaearth'],
  mixer:       ['Preethi', 'Sujata', 'Bajaj', 'Prestige', 'Maharaja Whiteline'],
  fan:         ['Orient', 'Usha', 'Havells', 'Crompton', 'Bajaj'],
  refrigerator:['Godrej', 'Voltas', 'Haier India'],
  laptop:      ['ASUS India', 'Acer India'],
  default:     ['Bajaj', 'Havells', 'Godrej', 'Tata', 'Wipro'],
}

function detectCat(name = '') {
  const n = name.toLowerCase()
  if (/phone|mobile|laptop|tv\b|television|earphone|headphone|speaker|camera|tablet|watch|charger|earbuds|iphone|galaxy|oneplus|redmi|realme/.test(n)) return 'electronics'
  if (/foundation|lipstick|moisturizer|serum|shampoo|cream|lotion|sunscreen|kajal|perfume|skincare/.test(n)) return 'cosmetics'
  if (/shirt|jeans|kurta|saree|dress|jacket|shoes|sneaker|sandal|slipper|hoodie/.test(n)) return 'clothing'
  if (/mixer|grinder|fan\b|air conditioner|\bac\b|refrigerator|washing machine|iron\b|microwave|geyser/.test(n)) return 'appliances'
  if (/book|novel|guide|textbook|notes/.test(n)) return 'books'
  return 'default'
}

// Returns a short category keyword good for search queries (e.g. "watch", "smartphone", "TV")
// BUG 1 FIX: Added watch movement/style terms (quartz, analog, chronograph) and known watch
// brand prefixes so "Titan Workwear Quartz NT18025L11" correctly resolves to 'watch'.
const WATCH_BRANDS = /^(titan|fastrack|sonata|casio|timex|seiko|citizen|fossil|hmt|maxima|rado|omega|longines|tissot)/
function extractCategoryKeyword(name = '') {
  const n = name.toLowerCase()
  if (/\bwatch\b|\bquartz\b|\bchronograph\b|\banalog\b|\bwristwatch\b/.test(n) || WATCH_BRANDS.test(n)) return 'watch'
  if (/phone|mobile|smartphone/.test(n))              return 'smartphone'
  if (/\blaptop\b|\bnotebook\b/.test(n))              return 'laptop'
  if (/earphone|earbuds/.test(n))                     return 'earphone'
  if (/headphone/.test(n))                            return 'headphone'
  if (/\bspeaker\b/.test(n))                          return 'speaker'
  if (/\bcamera\b/.test(n))                           return 'camera'
  if (/\btablet\b/.test(n))                           return 'tablet'
  if (/tv\b|television/.test(n))                      return 'TV'
  if (/charger/.test(n))                              return 'charger'
  if (/shoes|sneaker|boot|sandal|slipper/.test(n))    return 'shoes'
  if (/shirt|tshirt|t-shirt/.test(n))                 return 'shirt'
  if (/jeans|trouser/.test(n))                        return 'jeans'
  if (/kurta|saree|dress|jacket|hoodie/.test(n))      return 'clothing'
  if (/foundation|lipstick|kajal/.test(n))            return 'makeup'
  if (/moisturizer|serum|cream|lotion|sunscreen/.test(n)) return 'skincare'
  if (/shampoo/.test(n))                              return 'shampoo'
  if (/perfume/.test(n))                              return 'perfume'
  if (/mixer|grinder/.test(n))                        return 'mixer grinder'
  if (/refrigerator|fridge/.test(n))                  return 'refrigerator'
  if (/washing machine/.test(n))                      return 'washing machine'
  if (/microwave/.test(n))                            return 'microwave'
  if (/\bfan\b/.test(n))                              return 'fan'
  if (/book|novel|textbook/.test(n))                  return 'book'
  return ''
}

export async function alternativeLightbulbAgent({ productData, url }) {
  const productName  = productData?.productName || productData?.name || 'Unknown'
  const productPrice = productData?.price  || 0
  const platform     = productData?.platform || 'amazon'
  const categoryKw   = extractCategoryKeyword(productName)
  // Extract original product ASIN — reject only the exact same product, not entire brand
  const originalAsin  = url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] || null
  const originalBrand = productName.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
  // Indian brands for this category — used in Pass 1 prompt and as targeted fallback
  const indianBrands  = INDIAN_BRANDS_BY_CATEGORY[categoryKw] || INDIAN_BRANDS_BY_CATEGORY.default

  // ── PASS 1: Claude generates alternative names/brands/prices ──────────
  console.log('[ScanCart AlternativeEngine] Starting Pass 1...')

  let firstPassAlternatives = []
  try {
    const pass1Prompt = `You are a product research agent for Indian e-commerce.
The user is looking at: "${productName}" priced at Rs. ${productPrice} on ${platform}.
Find ${N_ALTERNATIVES} ALTERNATIVE products available in India on Amazon.in or Flipkart.

CRITICAL RULES:
1. Do NOT suggest the exact same product. Same-brand alternatives in a different tier (budget/premium) ARE allowed.
2. Do NOT suggest variants or sibling models at the same price as the original product.
3. Each brand in the list must be unique — no two alternatives from the same brand.
4. STRONGLY prefer Indian brands (Vocal for Local). Known Indian brands for this category: ${indianBrands.join(', ')}.
5. If a comparable Indian brand exists, include at least 2 Indian brand options.

Return ONLY a JSON array of ${N_ALTERNATIVES} objects with these EXACT fields:
  name: full product name (be specific — brand + model + key spec)
  brand: brand name only
  price: estimated price in Indian Rupees as integer
  platform: "amazon" or "flipkart"
  indianBrand: true if Indian brand, false if international
  whyAlternative: one sentence explaining why this is a good alternative to "${productName}"
  alternativeType: "value" (same quality, cheaper) | "budget" (lower specs, much cheaper) | "premium" (better specs, slightly pricier)

Include at least 1 of each type.
DO NOT include "platformUrl", ratings or review counts — we look those up ourselves and never show guessed ratings.`

    // 5 objects with a sentence each can run past 1000 tokens and cut the JSON off mid-array.
    const result = await claudeJsonWithTimeout(pass1Prompt, 2000, PASS1_TIMEOUT)
    let candidates = Array.isArray(result) ? result : []

    // Only reject if it's literally the same product name — allow same brand in different tier
    candidates = candidates.filter(alt => {
      if (!alt.brand || !alt.name) return false
      const altNameNorm = (alt.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const origNameNorm = productName.toLowerCase().replace(/[^a-z0-9]/g, '')
      // Reject only if the name is near-identical (>85% overlap) — not just same brand
      return altNameNorm !== origNameNorm
    })

    firstPassAlternatives = candidates.slice(0, N_ALTERNATIVES)
    console.log(`[ScanCart AlternativeEngine] Pass 1 complete, ${firstPassAlternatives.length} alternatives from Claude`)
  } catch (err) {
    console.warn('[ScanCart AlternativeEngine] Pass 1 failed:', err.message)
    return await searchBasedFallback(productName, productPrice, platform, originalAsin, originalBrand, categoryKw, indianBrands)
  }

  if (firstPassAlternatives.length === 0) {
    return await searchBasedFallback(productName, productPrice, platform, originalAsin, originalBrand, categoryKw, indianBrands)
  }

  // ── PASS 1b: Verify each alternative via real Amazon scraping ─────────
  console.log('[ScanCart AlternativeEngine] Starting Pass 1b: real product verification...')
  firstPassAlternatives = await Promise.all(
    firstPassAlternatives.map(alt => verifyAlternativeWithSearch(alt, originalAsin, originalBrand))
  )

  // ── PASS 2: 3 mini-engines on each alternative in parallel ──────────
  console.log('[ScanCart AlternativeEngine] Starting Pass 2 analysis...')

  const enriched = await Promise.all(
    firstPassAlternatives.map(alt => analyseAlternative(alt, productPrice))
  )

  // Sort by totalAlternativeScore descending
  enriched.sort((a, b) => b.totalAlternativeScore - a.totalAlternativeScore)

  const best = enriched[0]
  const bestScore = best?.totalAlternativeScore || 0
  console.log(`[ScanCart AlternativeEngine] Pass 2 complete, best score: ${bestScore.toFixed(1)}`)

  return {
    agent: 'alternativeLightbulb',
    bestAlternative:      best || null,
    allAlternatives:      enriched,
    totalAlternativesFound: enriched.length,
    alternativeSummary:   buildSummary(best, enriched.length),
    confidence:           80,
    source: 'claude',
    success: true,
    // Legacy compat fields
    alternatives: enriched.map(a => ({
      name: a.name, brand: a.brand, price: a.price, platform: a.platform,
      url: a.platformUrl || '#', image: null,
      reason: a.whyAlternative, type: a.alternativeType,
      savings: a.priceAnalysis?.savingsAmount || 0,
      priceIsEstimate: a.priceIsEstimate === true,
    })),
  }
}

// ── Pass 1b: verify via real Amazon scraping, fall back to search URL ──
async function verifyAlternativeWithSearch(alt, originalAsin = null, originalBrand = '') {
  const altPlatform  = alt.platform || 'amazon'
  const altBrandNorm = (alt.brand || '').toLowerCase().replace(/[^a-z]/g, '')

  // Only attempt scraping for Amazon — Flipkart is CAPTCHA-blocked server-side
  if (altPlatform === 'amazon') {
    const categoryKw = extractCategoryKeyword(alt.name || '')
    // Search for the specific alternative brand + model — NOT the original brand
    const queries = [
      alt.brand && categoryKw ? `${alt.brand} ${categoryKw}` : null,
      `${alt.brand || ''} ${alt.name || ''}`.trim().split(' ').slice(0, 5).join(' '),
    ].filter(q => q && q.length >= 3)

    for (const searchQuery of queries) {
      try {
        const results = await searchAmazonIndia(searchQuery, 4)
        // BUG 2 FIX: Only reject same-brand Amazon results when the Claude-suggested alt
        // itself is a DIFFERENT brand. If Claude explicitly suggested a same-brand
        // alternative (e.g. "Titan Edge" for a Titan watch), allow same-brand results.
        const altBrandIsOriginal = (alt.brand || '').toLowerCase().replace(/[^a-z]/g, '') === originalBrand
        const filtered = results.filter(r => {
          const asin        = r.url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]
          const resultBrand = (r.name || '').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')
          if (!r.price || r.price <= 0) return false
          if (asin && asin === originalAsin) return false
          // Only block original-brand results when we're looking for a cross-brand alternative
          if (!altBrandIsOriginal && originalBrand && resultBrand === originalBrand) return false
          return true
        })
        // Accept ONLY a result from the brand Claude suggested. Swapping in whatever
        // came first showed a different brand under the suggested product's reason.
        const real = filtered.find(r => {
          const rb = (r.name || '').toLowerCase().replace(/[^a-z]/g, '')
          // first word of the brand, so "Timex India" still matches a "Timex ..." listing
          const brandHead = (alt.brand || '').split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '')
          return brandHead.length >= 2 && rb.startsWith(brandHead)
        })
        if (real) {
          console.log(`[ScanCart AlternativeEngine] Verified: "${alt.name}" → "${real.name}" Rs.${real.price}`)
          return {
            ...alt,
            name:            real.name,
            price:           real.price,
            image:           real.image || null,
            platformUrl:     real.url,
            platform:        'amazon',
            estimatedRating: real.rating || null,
            realProduct:     true,
          }
        }
      } catch { /* scraping failed — try next query */ }
    }
  }

  // Scraping failed, blocked, or Flipkart — keep Claude's suggestion with a real search URL.
  // Its price is Claude's guess, so it is flagged for an "est." label; no rating is shown.
  return {
    ...alt,
    platformUrl:     buildSearchUrl(altPlatform, `${alt.brand || ''} ${alt.name || ''}`),
    image:           null,
    estimatedRating: null,
    realProduct:     false,
  }
}

// ── Fallback: search Amazon directly when Claude is unavailable ────────
async function searchBasedFallback(productName, productPrice, platform, originalAsin = null, originalBrand = '', categoryKw = '', indianBrands = []) {
  console.log('[ScanCart AlternativeEngine] Using search-based fallback...')

  const categoryKeyword = categoryKw || extractCategoryKeyword(productName)
  const words = productName.replace(/[A-Z0-9]{10}/g, '').trim().split(/\s+/).filter(Boolean)
  const brand = words[0] || ''

  // Build queries — category-level first, then targeted Indian brand searches
  const queries = [
    categoryKeyword ? `best ${categoryKeyword} india` : null,
    categoryKeyword ? `top ${categoryKeyword} under ${Math.round(productPrice * 1.3)}` : null,
    // Indian brand targeted queries (Vocal for Local) — these find cross-brand results reliably
    ...(indianBrands.slice(0, 2).map(b => categoryKeyword ? `${b} ${categoryKeyword}` : null)),
    categoryKeyword ? `${categoryKeyword} india buy online` : null,
  ].filter(q => q && q.length >= 3)

  if (queries.length === 0) {
    console.warn('[ScanCart AlternativeEngine] Product name too short for search:', productName)
    return searchUrlFallback(productName, productPrice, brand, categoryKeyword, indianBrands)
  }

  const seenAsins = new Set()
  if (originalAsin) seenAsins.add(originalAsin)
  let priced = []

  // BUG 4 FIX: build a normalised set of Indian brand names for badge detection
  const indianBrandNorms = (indianBrands || []).map(b => b.toLowerCase().replace(/[^a-z]/g, ''))

  for (const query of queries) {
    console.log(`[ScanCart AlternativeEngine] Trying Amazon search: "${query}"`)
    // BUG 3 FIX: wrap each search call so one failed query doesn't crash the whole fallback
    let results = []
    try {
      results = await searchAmazonIndia(query, 8)
    } catch (err) {
      console.warn(`[ScanCart AlternativeEngine] Search failed for "${query}":`, err.message)
      continue
    }
    const batch = results.filter(r => {
      if (!r.price || r.price <= 0) return false
      const asin = r.url?.split('/dp/')[1]?.split('/')[0]
      if (!asin || seenAsins.has(asin)) return false
      seenAsins.add(asin)
      return true
    }).slice(0, 4)
    if (batch.length > 0) {
      priced.push(...batch)
      console.log(`[ScanCart AlternativeEngine] Amazon returned ${batch.length} results for "${query}"`)
      if (priced.length >= 4) break
    }
  }

  if (priced.length > 0) {
    const alts = priced.map((r, idx) => {
      const priceRatio  = productPrice > 0 ? r.price / productPrice : 1
      const altType     = priceRatio < 0.9 ? 'budget' : priceRatio > 1.1 ? 'premium' : 'value'
      // Only what the search page really showed — no filler ratings or review counts.
      const rating      = r.rating || null
      const numRatings  = null
      const numReviews  = null
      // BUG 6 FIX: guard against null/undefined r.name before calling split
      const safeName    = r.name || ''
      const brand       = safeName.split(' ')[0] || ''
      // BUG 4 FIX: detect Indian brand from scraped name, not hardcoded false
      const brandNorm   = brand.toLowerCase().replace(/[^a-z]/g, '')
      const isIndian    = indianBrandNorms.some(b => b === brandNorm || safeName.toLowerCase().includes(b))
      return {
        name: safeName, brand, price: r.price,
        platform: 'amazon', platformUrl: r.url, image: r.image,
        estimatedRating: rating, estimatedNumRatings: numRatings, estimatedNumReviews: numReviews,
        indianBrand: isIndian,
        whyAlternative: altType === 'budget'  ? 'More affordable option available on Amazon'
                      : altType === 'premium' ? 'Premium alternative with potentially better specs'
                      : 'Similar product at competitive price on Amazon',
        alternativeType: altType, realProduct: true,
      }
    })

    const enriched = await Promise.all(alts.map(a => analyseAlternative(a, productPrice)))
    enriched.sort((a, b) => b.totalAlternativeScore - a.totalAlternativeScore)
    const best = enriched[0]
    return {
      agent: 'alternativeLightbulb', bestAlternative: best || null,
      allAlternatives: enriched, totalAlternativesFound: enriched.length,
      alternativeSummary: buildSummary(best, enriched.length), confidence: 55, source: 'search', success: true,
      alternatives: enriched.map(a => ({
        name: a.name, brand: a.brand, price: a.price, platform: a.platform,
        url: a.platformUrl, image: a.image, reason: a.whyAlternative,
        type: a.alternativeType, savings: a.priceAnalysis?.savingsAmount || 0,
      priceIsEstimate: a.priceIsEstimate === true,
      })),
    }
  }

  // Amazon search returned no usable results — give clickable search links including Indian brand links
  console.warn('[ScanCart AlternativeEngine] Amazon search returned no results — using search URL fallback')
  return searchUrlFallback(productName, productPrice, brand, categoryKeyword, indianBrands)
}

// ── Search-URL fallback: clickable Amazon + Flipkart + Indian brand links ──
function searchUrlFallback(productName, productPrice, brand = '', categoryKeyword = '', indianBrands = []) {
  const searchTerm = categoryKeyword || productName.split(' ').slice(0, 3).join(' ')

  const base = [
    {
      name: `Search ${categoryKeyword || searchTerm} on Amazon India`,
      brand: '',
      price: null, // search link, not a product — no made-up price
      platform: 'amazon',
      platformUrl: buildSearchUrl('amazon', `best ${searchTerm} india`),
      image: null,
      estimatedRating: null, estimatedNumRatings: null, estimatedNumReviews: null,
      indianBrand: false,
      whyAlternative: `Browse all ${searchTerm} options on Amazon India`,
      alternativeType: 'value',
      realProduct: false,
    },
    {
      name: `Search ${categoryKeyword || searchTerm} on Flipkart`,
      brand: '',
      price: null, // search link, not a product — no made-up price
      platform: 'flipkart',
      platformUrl: buildSearchUrl('flipkart', searchTerm),
      image: null,
      estimatedRating: null, estimatedNumRatings: null, estimatedNumReviews: null,
      indianBrand: false,
      whyAlternative: `Browse all ${searchTerm} options on Flipkart`,
      alternativeType: 'value',
      realProduct: false,
    },
  ]

  // Add up to 2 Indian brand search links (Vocal for Local)
  const indianLinks = indianBrands.slice(0, 2).map(b => ({
    name: `${b} ${categoryKeyword || searchTerm} — Indian Brand`,
    brand: b,
    price: null, // search link, not a product — no made-up price
    platform: 'amazon',
    platformUrl: buildSearchUrl('amazon', `${b} ${categoryKeyword || searchTerm}`),
    image: null,
    estimatedRating: null, estimatedNumRatings: null, estimatedNumReviews: null,
    indianBrand: true,
    whyAlternative: `${b} is a trusted Indian brand — explore their ${categoryKeyword || searchTerm} range`,
    alternativeType: 'value',
    realProduct: false,
  }))

  const alts = [...base, ...indianLinks].map(a => ({
    ...a,
    priceAnalysis:  defaultPriceAnalysis(),
    ratingAnalysis: defaultRatingAnalysis(),
    reviewAnalysis: defaultReviewAnalysis(),
    totalAlternativeScore: 40,
    verifiedAlternative: false,
    priceIsEstimate: false,
    ratingIsReal: false,
    overallVerdict: 'Search Required',
  }))

  const best = alts[0]
  return {
    agent: 'alternativeLightbulb',
    bestAlternative: best,
    allAlternatives: alts,
    totalAlternativesFound: alts.length,
    alternativeSummary: `Search for ${searchTerm} alternatives on Amazon or Flipkart`,
    confidence: 15,
    source: 'heuristic',
    success: true,
    alternatives: alts.map(a => ({
      name: a.name, brand: a.brand, price: a.price, platform: a.platform,
      url: a.platformUrl, image: null, reason: a.whyAlternative,
      type: a.alternativeType, savings: 0,
    })),
  }
}

// ── Per-alternative analysis (3 mini-engines in parallel) ───────────
async function analyseAlternative(alt, originalPrice) {
  const [priceResult, ratingResult, reviewResult] = await Promise.allSettled([
    miniPriceEngine(alt, originalPrice),
    miniRatingEngine(alt),
    miniReviewEngine(alt),
  ])

  const priceAnalysis  = priceResult.status  === 'fulfilled' ? priceResult.value  : defaultPriceAnalysis()
  const ratingAnalysis = ratingResult.status === 'fulfilled' ? ratingResult.value : defaultRatingAnalysis()
  const reviewAnalysis = reviewResult.status === 'fulfilled' ? reviewResult.value : defaultReviewAnalysis()

  const totalAlternativeScore = parseFloat(
    ((priceAnalysis.priceScore * 0.40) + (ratingAnalysis.ratingScore * 0.35) + (reviewAnalysis.reviewScore * 0.25)).toFixed(2)
  )

  const overallVerdict = totalAlternativeScore >= 80 ? 'Highly Recommended'
    : totalAlternativeScore >= 60 ? 'Recommended'
    : totalAlternativeScore >= 40 ? 'Consider with Caution'
    : 'Not Recommended'

  // Always ensure a real, clickable URL (never trust Claude's generated URL)
  const platformUrl = (alt.platformUrl && alt.realProduct)
    ? alt.platformUrl
    : buildSearchUrl(alt.platform || 'amazon', `${alt.brand || ''} ${alt.name || ''}`)

  return {
    ...alt,
    platformUrl,
    // UI labels: a price is only "real" if it came from a live product page
    priceIsEstimate: alt.price != null && alt.realProduct !== true,
    ratingIsReal:    alt.realProduct === true && alt.estimatedRating != null,
    priceAnalysis,
    ratingAnalysis,
    reviewAnalysis,
    totalAlternativeScore,
    verifiedAlternative: alt.realProduct === true,
    overallVerdict,
  }
}

// Mini-Engine A — Price
function miniPriceEngine(alt, originalPrice) {
  try {
    if (!alt.price || !originalPrice) {
      return { priceScore: 50, savingsAmount: 0, savingsPercent: 0, priceDifference: 0, priceVerdict: 'price unknown' }
    }
    const altPrice    = alt.price
    const priceDiff   = altPrice - originalPrice
    const diffPercent = originalPrice > 0 ? (priceDiff / originalPrice) * 100 : 0

    let savingsAmount  = 0
    let savingsPercent = 0
    let priceScore
    let priceVerdict

    if (priceDiff < 0) {
      // Alternative is CHEAPER — reward it
      savingsAmount  = Math.abs(priceDiff)
      savingsPercent = parseFloat((savingsAmount / originalPrice * 100).toFixed(1))
      priceScore     = Math.min(100, Math.round(50 + savingsPercent * 1.5))
      priceVerdict   = savingsPercent > 30 ? 'much cheaper' : savingsPercent > 10 ? 'cheaper' : 'slightly cheaper'
    } else if (diffPercent <= 5) {
      // Same price (within 5%) — neutral
      priceScore   = 50
      priceVerdict = 'similar price'
    } else if (diffPercent <= 20) {
      // Up to 20% more expensive — slight penalty (might be better quality)
      priceScore   = Math.round(50 - diffPercent)
      priceVerdict = 'slightly more expensive'
    } else if (diffPercent <= 40) {
      // 20-40% more expensive — notable penalty
      priceScore   = Math.round(35 - (diffPercent - 20) * 0.5)
      priceVerdict = 'more expensive'
    } else {
      // >40% more expensive — premium tier
      priceScore   = 20
      priceVerdict = 'premium price'
    }

    return {
      priceScore:     Math.max(0, Math.min(100, priceScore)),
      savingsAmount,
      savingsPercent,
      priceDifference: priceDiff,
      priceVerdict,
    }
  } catch { return defaultPriceAnalysis() }
}

// Mini-Engine B — Rating (lightweight, no Claude)
function miniRatingEngine(alt) {
  try {
    // No real rating seen → neutral, never a guessed 4.0
    if (alt.estimatedRating == null) {
      return { ratingScore: 50, ratingCredible: null, ratingInHealthyRange: null, ratingVerdict: 'unknown' }
    }
    // Clamp rating to realistic range — a perfect 5.0 is suspicious
    const rating     = Math.min(4.9, Math.max(2.0, parseFloat(alt.estimatedRating)))
    // Search pages don't show counts; treat as a modest sample rather than inventing volume
    const numRatings = parseInt(alt.estimatedNumRatings || 100)
    const cat        = detectCat(alt.name)
    const range      = HEALTHY_RANGES[cat] || HEALTHY_RANGES.default

    const ratingInHealthyRange = rating >= range.min && rating <= range.max
    // Use multiplier of 10 (not 20) so score saturates only at high volume+quality combos
    // e.g. 4.5★ × 50k ratings → ~97; 4.0★ × 8k ratings → ~72; 3.8★ × 500 ratings → ~45
    const base = numRatings > 0 ? (rating * Math.log(numRatings + 1)) / 5 : 0
    const credibilityRaw = Math.min(100, Math.round(base * 10))

    // Penalise ratings outside the healthy range — likely inflated or low quality
    const ratingScore    = ratingInHealthyRange ? credibilityRaw : Math.max(0, credibilityRaw - 30)
    const ratingCredible = ratingScore >= 50 && ratingInHealthyRange
    const ratingVerdict  = ratingScore >= 80 ? 'excellent' : ratingScore >= 60 ? 'good' : ratingScore >= 40 ? 'average' : 'suspicious'

    return { ratingScore, ratingCredible, ratingInHealthyRange, ratingVerdict }
  } catch { return defaultRatingAnalysis() }
}

// Mini-Engine C — Review (lightweight, no Claude)
function miniReviewEngine(alt) {
  try {
    // BUG 5 FIX: When the product is not real-scraped, numRatings/numReviews were invented
    // by Claude and will always produce a "realistic" ratio → always "trustworthy".
    // Return neutral/uncertain for unverified alternatives so the score reflects that
    // we genuinely don't know whether the reviews are real.
    if (!alt.realProduct || alt.estimatedNumRatings == null || alt.estimatedNumReviews == null) {
      return { reviewScore: 50, estimatedFakePercent: 25, reviewVerdict: 'unverified' }
    }

    const numRatings = parseInt(alt.estimatedNumRatings || 500)
    const numReviews = parseInt(alt.estimatedNumReviews || 100)
    const ratio      = numReviews > 0 ? numRatings / numReviews : 5

    let fakePercent = 10
    if (ratio > 15)      fakePercent = 60
    else if (ratio > 10) fakePercent = 40
    else if (ratio > 6)  fakePercent = 20

    const reviewScore   = Math.max(0, 100 - fakePercent - 5)
    const reviewVerdict = reviewScore >= 75 ? 'trustworthy' : reviewScore >= 50 ? 'moderate' : 'suspicious'
    return { reviewScore, estimatedFakePercent: fakePercent, reviewVerdict }
  } catch { return defaultReviewAnalysis() }
}

// ── Defaults ─────────────────────────────────────────────────────────
function defaultPriceAnalysis()  { return { priceScore: 50, savingsAmount: 0, savingsPercent: 0, priceDifference: 0, priceVerdict: 'similar price' } }
function defaultRatingAnalysis() { return { ratingScore: 50, ratingCredible: true, ratingInHealthyRange: true, ratingVerdict: 'average' } }
function defaultReviewAnalysis() { return { reviewScore: 50, estimatedFakePercent: 25, reviewVerdict: 'moderate' } }

function buildSummary(best, total) {
  if (!best) return 'No alternatives found'
  const save = best.priceAnalysis?.savingsAmount || 0
  return save > 0
    ? `${total} alternative${total > 1 ? 's' : ''} found — best saves Rs. ${save.toLocaleString('en-IN')} with ${best.overallVerdict?.toLowerCase()} rating`
    : `${total} alternative${total > 1 ? 's' : ''} found — ${best.name} is the top pick (${best.overallVerdict})`
}

function buildSearchUrl(platform, query) {
  const q = encodeURIComponent((query || '').slice(0, 80))
  return platform === 'flipkart' ? `https://www.flipkart.com/search?q=${q}` : `https://www.amazon.in/s?k=${q}`
}

