// backend/agents/pricePiggyAgent.js
// ENGINE 3 — Price Piggy
// LOCAL LOGIC → real Amazon search for best price + alt price range → Claude enhancement.
// Explains WHY prices differ, not just how much.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { detectPlatform } from '../utils/platformDetector.js'
import { validatePrice, detectCategory } from '../utils/priceValidator.js'
import { searchAmazonIndia, amazonSearchUrl, flipkartSearchUrl } from '../services/searchProducts.js'
import { productKeyFor, getHistory, summarise, recordPrice } from '../services/priceStore.js'

// ScanCart's own tracked prices for this exact listing (Firestore or the local store).
async function getPriorPriceStats(key, windowDays = 30) {
  const s = summarise(await getHistory(key, { days: windowDays }))
  if (!s) return null
  const spanDays = (Date.now() - s.firstSeen) / 86400000
  return { priorLow: s.low, priorHigh: s.high, priorAvg: s.avg, sampleCount: s.count, windowDays, spanDays }
}

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

// Maps category to a good search term for finding similar products
const CATEGORY_SEARCH_TERMS = {
  smartphone:  'smartphone india',
  smartwatch:  'watch india',
  laptop:      'laptop india',
  earbuds:     'earbuds india',
  headphones:  'headphones india',
  tablet:      'tablet india',
  television:  'smart tv india',
  shoes:       'shoes india',
  cosmetics:   'face cream india',
  clothing:    'clothing india',
  appliances:  'home appliance india',
}

export async function pricePiggyAgent({ url, productData }) {
  console.log('[ScanCart PricePiggy] Starting price analysis')
  const platform     = productData?.platform || detectPlatform(url)
  const currentPrice = productData?.price || 0   // actual price scraped from the product page
  const mrp          = productData?.mrpPrice || 0  // claimed "was" price scraped from the page, 0 if not found
  const name         = productData?.productName || productData?.name || 'Unknown'
  const category     = detectCategory(name)
  // Extract original ASIN so we never return the same product as "best price"
  const originalAsin = url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] || null
  const productKey    = productKeyFor({ url, platform, productName: name })

  // ── Step 1: local heuristic baseline ───────────────────────────────
  const local = localPriceAnalysis(currentPrice, name, platform)

  // ── Step 2: run real price search + alt range search + our own price
  //    history lookup in PARALLEL ────────────────────────────────────
  const [bestPriceResult, altRangeResult, priorStatsResult] = await Promise.allSettled([
    findRealBestPrice(name, currentPrice, platform, originalAsin),
    findAltPriceRange(name, currentPrice, category),
    getPriorPriceStats(productKey),
  ])

  const realBestPrice = bestPriceResult.status === 'fulfilled' ? bestPriceResult.value : null
  const altRange      = altRangeResult.status  === 'fulfilled' ? altRangeResult.value  : null
  const priorStats    = priorStatsResult.status === 'fulfilled' ? priorStatsResult.value : null

  // Fire-and-forget: feed FUTURE scans of this exact listing. Never blocks the response.
  recordPrice(productKey, { price: currentPrice, mrp, platform, productName: name, url }).catch(() => {})

  // ── Prior-price verdict — the primary discount-claim verifier when we ─
  // have real, self-tracked history for this exact listing (not another guess).
  let priorPriceVerdict = null
  if (priorStats) {
    const claimedDiscountPercent = mrp > currentPrice ? Math.round((mrp - currentPrice) / mrp * 100) : null
    const genuineDiscountPercent = priorStats.priorLow > currentPrice
      ? Math.round((priorStats.priorLow - currentPrice) / priorStats.priorLow * 100)
      : 0
    const isNewLow = currentPrice <= priorStats.priorLow
    // Only judge a sale as fake with a real history: 3+ saved prices spread over 7+ days.
    // (One earlier price from a minute ago says nothing about whether the "75% off" is real.)
    const enoughHistory = priorStats.sampleCount >= 3 && priorStats.spanDays >= 7
    const discountClaimHonest = claimedDiscountPercent == null || !enoughHistory
      ? null
      : genuineDiscountPercent >= claimedDiscountPercent * 0.5

    priorPriceVerdict = {
      ...priorStats,
      isNewLow,
      enoughHistory,
      claimedDiscountPercent,
      genuineDiscountPercent,
      discountClaimHonest,
      source: 'scancart-self-tracked-history',
    }

    if (discountClaimHonest === false) {
      local.priceSuspicious = true
      local.priceScore = Math.min(local.priceScore, 30)
      local.priceFair = `Claimed ${claimedDiscountPercent}% off MRP, but ScanCart has tracked this exact listing at Rs.${priorStats.priorLow}-Rs.${priorStats.priorHigh} over the last ${priorStats.windowDays} days — today's price is not meaningfully lower.`
    } else if (isNewLow && enoughHistory) {
      local.priceScore = Math.max(local.priceScore, 85)
      local.priceFair = `Lowest price ScanCart has recorded for this listing in ${priorStats.windowDays} days (previous low: Rs.${priorStats.priorLow}).`
    }
  }

  if (realBestPrice) {
    // Savings always = currentPrice (from product page) − best price found
    const savings = Math.max(0, currentPrice - realBestPrice.price)
    local.bestPrice = { ...realBestPrice, savings }
    if (savings > 0) {
      const savingsPct = savings / currentPrice * 100
      local.priceScore = Math.min(100, Math.round(local.priceScore + savingsPct))
    }
    local.priceFair = realBestPrice.price < currentPrice
      ? `Rs. ${(currentPrice - realBestPrice.price).toLocaleString('en-IN')} cheaper found on ${realBestPrice.platform}`
      : local.priceFair
    console.log(`[ScanCart PricePiggy] Real best price: Rs.${realBestPrice.price} on ${realBestPrice.platform}, savings: Rs.${savings}`)
  }

  if (altRange) {
    console.log(`[ScanCart PricePiggy] Alt range: Rs.${altRange.minPrice}–Rs.${altRange.maxPrice} (${altRange.sampleCount} similar products)`)
  }

  // ── Step 3: Claude enhancement — add reason + factors ──────────────
  try {
    const realSavings       = local.bestPrice.savings || 0
    const bestPriceContext  = local.bestPrice.price > 0
      ? `Best price found: Rs.${local.bestPrice.price} on ${local.bestPrice.platform} (Rs.${realSavings} cheaper than current Rs.${currentPrice})`
      : `No cheaper price found — current price is Rs.${currentPrice}`
    const altRangeContext = altRange
      ? `Similar ${category} products on Amazon range from Rs.${altRange.minPrice} to Rs.${altRange.maxPrice} (${altRange.sampleCount} products checked)`
      : 'No alternative price range data available'
    const priorPriceContext = priorPriceVerdict
      ? `ScanCart's own tracked price history for THIS EXACT listing over the last ${priorPriceVerdict.windowDays} days: Rs.${priorPriceVerdict.priorLow}-Rs.${priorPriceVerdict.priorHigh} (${priorPriceVerdict.sampleCount} observations). Discount claim honest: ${priorPriceVerdict.discountClaimHonest}.`
      : 'No self-tracked price history yet for this exact listing (first time scanned) — discount-claim honesty cannot be verified this way yet.'

    const prompt = `You are a PRICE INTELLIGENCE AI for Indian e-commerce.

Product: "${name}"
Category: ${category}
Current Platform: ${platform}
Current Price (scraped from product page): Rs. ${currentPrice}
${bestPriceContext}
${altRangeContext}
${priorPriceContext}

Tasks:
1. Determine if the current price (Rs. ${currentPrice}) is fair, suspicious, or a great deal.
2. If a cheaper price was found, explain WHY it is cheaper in a single clear sentence.
3. List up to 3 short specific reasons for the price difference as bullet phrases.
4. Position this product in the category price range.

Return ONLY valid JSON:
{
  "fairMarketPrice": <estimated fair INR integer>,
  "priceScore": <0-100 integer>,
  "priceSuspicious": <boolean>,
  "underpriced": <boolean>,
  "priceDiffReason": "<one sentence: WHY the price is different, or why it is a good/bad deal>",
  "priceFactors": ["<factor 1>", "<factor 2>", "<factor 3>"],
  "priceFair": "<one sentence assessment of whether Rs.${currentPrice} is a fair price>",
  "confidence": <0-100>
}`

    const enhanced = await claudeJsonWithTimeout(prompt, 800, TIMEOUT)
    console.log('[ScanCart PricePiggy] Claude enhanced result')

    return {
      agent:           'pricePiggy',
      currentPrice,
      mrp,
      priorPriceVerdict,
      fairMarketPrice: enhanced.fairMarketPrice || local.fairMarketPrice,
      priceScore:      clamp(enhanced.priceScore  ?? local.priceScore, 0, 100),
      priceSuspicious: enhanced.priceSuspicious   ?? local.priceSuspicious,
      underpriced:     enhanced.underpriced        ?? local.underpriced,
      // bestPrice comes ONLY from real search — never from Claude (avoids hallucinated prices)
      bestPrice: {
        platform: local.bestPrice.platform,
        price:    local.bestPrice.price,   // 0 if no real result found — shown as "not found"
        url:      local.bestPrice.url,
        savings:  local.bestPrice.savings ?? 0,
      },
      priceDiffReason: enhanced.priceDiffReason || buildDefaultReason(currentPrice, local.bestPrice.price, local.bestPrice.platform),
      priceFactors:    Array.isArray(enhanced.priceFactors) ? enhanced.priceFactors.slice(0, 3) : [],
      altPriceRange:   altRange,
      priceFair:       enhanced.priceFair || local.priceFair,
      confidence:      enhanced.confidence || local.confidence,
      source: 'claude', success: true,
    }
  } catch (err) {
    console.warn('[ScanCart PricePiggy] Claude failed, using local+search result:', err.message)
    return {
      agent:           'pricePiggy',
      currentPrice,
      mrp,
      priorPriceVerdict,
      ...local,
      priceDiffReason: buildDefaultReason(currentPrice, local.bestPrice.price, local.bestPrice.platform),
      priceFactors:    [],
      altPriceRange:   altRange,
      source: 'heuristic', success: true,
    }
  }
}

// ── Real best price: search Amazon, exclude the original product ───────
async function findRealBestPrice(name, currentPrice, platform, originalAsin = null) {
  const query = name.split(' ').slice(0, 5).join(' ')
  try {
    const results = await searchAmazonIndia(query, 6)
    const priced  = results.filter(r => {
      if (!r.price || r.price <= 0) return false
      if (currentPrice > 0 && r.price >= currentPrice * 3) return false  // unreasonably expensive
      // Exclude the product being scanned (same ASIN = same product)
      const asin = r.url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]
      if (originalAsin && asin && asin === originalAsin) return false
      return true
    })
    if (priced.length === 0) return null

    priced.sort((a, b) => a.price - b.price)
    const cheapest = priced[0]

    return {
      platform: 'amazon',
      price:    cheapest.price,
      url:      cheapest.url,
      name:     cheapest.name,
      // savings calculated in caller using currentPrice (the actual page price)
    }
  } catch { return null }
}

// ── Alternative price range: search for similar products in the category ──
async function findAltPriceRange(name, originalPrice, category) {
  const searchTerm = CATEGORY_SEARCH_TERMS[category] || `${name.split(' ').slice(0, 2).join(' ')} india`
  try {
    const results = await searchAmazonIndia(searchTerm, 8)
    const prices  = results
      .filter(r => r.price > 0)
      .map(r => r.price)
      .sort((a, b) => a - b)

    if (prices.length < 2) return null

    const minPrice    = prices[0]
    const maxPrice    = prices[prices.length - 1]
    const medianPrice = prices[Math.floor(prices.length / 2)]

    let positionNote
    if (originalPrice <= minPrice * 1.05) {
      positionNote = 'At or near the lowest price in this category'
    } else if (originalPrice >= maxPrice * 0.95) {
      positionNote = 'At or near the highest price in this category'
    } else if (originalPrice <= medianPrice) {
      positionNote = `Below average for this category (median Rs. ${medianPrice.toLocaleString('en-IN')})`
    } else {
      positionNote = `Above average for this category (median Rs. ${medianPrice.toLocaleString('en-IN')})`
    }

    return {
      minPrice,
      maxPrice,
      medianPrice,
      sampleCount:   prices.length,
      categoryLabel: category,
      positionNote,
    }
  } catch { return null }
}

// ── Default reason string when Claude is unavailable ──────────────
function buildDefaultReason(currentPrice, bestPrice, bestPlatform) {
  if (!bestPrice || bestPrice <= 0 || bestPrice >= currentPrice) {
    return 'No cheaper alternative found on other platforms at this time'
  }
  const diff = currentPrice - bestPrice
  const pct  = Math.round((diff / currentPrice) * 100)
  return `${bestPlatform || 'Alternative platform'} is Rs.${diff.toLocaleString('en-IN')} (${pct}%) cheaper — likely due to direct seller pricing or platform-level discount`
}

// ── Local heuristic baseline (no API) ────────────────────────────
function localPriceAnalysis(price, name, platform) {
  const validation  = validatePrice(price, name)
  const priceSuspicious = validation.risk === 'critical' || validation.risk === 'high'
  const priceScore      = priceSuspicious ? 25 : validation.risk === 'medium' ? 55 : 75

  const query      = name.split(' ').slice(0, 4).join(' ')
  const altUrl     = platform === 'amazon' ? flipkartSearchUrl(query) : amazonSearchUrl(query)
  const altPlatform = platform === 'amazon' ? 'flipkart' : 'amazon'

  return {
    fairMarketPrice: price,
    priceScore,
    priceSuspicious,
    underpriced: validation.risk === 'critical',
    bestPrice: {
      platform: altPlatform,
      price:    0,
      url:      altUrl,
      savings:  0,
    },
    priceFair: priceSuspicious
      ? 'Price appears suspiciously low — possible fake or grey market product'
      : 'Price is within standard market range — verifying on other platforms',
    confidence: 40,
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || 0)) }
