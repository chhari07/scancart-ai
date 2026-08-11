// backend/agents/pricePiggyAgent.js
// ENGINE 3 — Price Piggy
// LOCAL LOGIC → real Amazon search for best price + alt price range → Claude enhancement.
// Explains WHY prices differ, not just how much.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { detectPlatform } from '../utils/platformDetector.js'
import { validatePrice, detectCategory } from '../utils/priceValidator.js'
import { searchAmazonIndia, amazonSearchUrl, flipkartSearchUrl } from '../services/searchProducts.js'

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
  const name         = productData?.productName || productData?.name || 'Unknown'
  const category     = detectCategory(name)
  // Extract original ASIN so we never return the same product as "best price"
  const originalAsin = url?.match(/\/dp\/([A-Z0-9]{10})/i)?.[1] || null

  // ── Step 1: local heuristic baseline ───────────────────────────────
  const local = localPriceAnalysis(currentPrice, name, platform)

  // ── Step 2: run real price search + alt range search in PARALLEL ───
  const [bestPriceResult, altRangeResult] = await Promise.allSettled([
    findRealBestPrice(name, currentPrice, platform, originalAsin),
    findAltPriceRange(name, currentPrice, category),
  ])

  const realBestPrice = bestPriceResult.status === 'fulfilled' ? bestPriceResult.value : null
  const altRange      = altRangeResult.status  === 'fulfilled' ? altRangeResult.value  : null

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

    const prompt = `You are a PRICE INTELLIGENCE AI for Indian e-commerce.

Product: "${name}"
Category: ${category}
Current Platform: ${platform}
Current Price (scraped from product page): Rs. ${currentPrice}
${bestPriceContext}
${altRangeContext}

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
      success: true,
    }
  } catch (err) {
    console.warn('[ScanCart PricePiggy] Claude failed, using local+search result:', err.message)
    return {
      agent:           'pricePiggy',
      currentPrice,
      ...local,
      priceDiffReason: buildDefaultReason(currentPrice, local.bestPrice.price, local.bestPrice.platform),
      priceFactors:    [],
      altPriceRange:   altRange,
      success: true,
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
