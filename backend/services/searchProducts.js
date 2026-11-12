// backend/services/searchProducts.js
// Real product search: Amazon India (scraping works), Flipkart (CAPTCHA-blocked — URL only)

const SEARCH_TIMEOUT = 8000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
}

/**
 * Search Amazon India for real products.
 * Returns up to `maxResults` products with real name, price, image, url.
 */
export async function searchAmazonIndia(query, maxResults = 3) {
  const url = `https://www.amazon.in/s?k=${encodeURIComponent(query)}&ref=nb_sb_noss`
  try {
    const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(SEARCH_TIMEOUT) })
    if (!resp.ok) return []
    const html = await resp.text()
    // Bail out if Amazon returned a CAPTCHA page (not a normal bot-check meta tag)
    if (html.includes('Type the characters you see in this image') || html.length < 5000) return []
    return parseAmazonResults(html, maxResults)
  } catch (err) {
    console.warn(`[searchProducts] Amazon search failed for "${query}":`, err.message)
    return []
  }
}

/**
 * Flipkart is CAPTCHA-blocked for server-side scraping.
 * Returns a search URL so the user can open it manually.
 */
export function flipkartSearchUrl(query) {
  return `https://www.flipkart.com/search?q=${encodeURIComponent(query)}&sort=relevance`
}

/**
 * Build an Amazon search URL (for display / click-through).
 */
export function amazonSearchUrl(query) {
  return `https://www.amazon.in/s?k=${encodeURIComponent(query)}`
}

// ─────────────────────────────────────────────────────────
//  Amazon HTML parser — fixed title and URL extraction
// ─────────────────────────────────────────────────────────
function parseAmazonResults(html, maxResults) {
  const results = []
  const blocks  = html.split('data-component-type="s-search-result"')

  for (let i = 1; i < blocks.length && results.length < maxResults; i++) {
    const block = blocks[i]

    // ASIN (Amazon product ID)
    const asin = block.match(/\bdata-asin="([A-Z0-9]{10})"/)?.[1]
    if (!asin) continue

    // Title — image alt is the most reliable source (full title, no nested HTML)
    let title = (
      block.match(/class="s-image"[^>]+alt="([^"]{10,200})"/)?.[1] ||
      block.match(/<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([\s\S]{10,200}?)<\/span>/)?.[1]
        ?.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim()
    )
    if (!title) continue

    // Skip sponsored ads (they show "Sponsored Ad - " in the alt attribute)
    if (/^Sponsored\b/i.test(title)) continue
    // Strip any leftover "Sponsored " prefix that leaks through
    title = title.replace(/^Sponsored\s+(Ad\s*-?\s*)?/i, '').trim()
    if (title.length < 5) continue

    // Image — Amazon CDN URL
    const image = block.match(/class="s-image"[^>]+src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/)?.[1] || null

    // Price — a-offscreen is the screen-reader price (selling price, not MRP strikethrough)
    const price = parsePriceFromBlock(block)

    // Rating — must be a realistic product rating (2.0–4.9). Avoid matching badge text like "5 out of 5 stars"
    const rawRating = parseFloat(block.match(/([0-9.]+) out of 5 stars/)?.[1] || '0')
    const rating = (rawRating >= 2.0 && rawRating < 5.0) ? rawRating : null

    // Clean product URL — ASIN only, no tracking params
    const productUrl = `https://www.amazon.in/dp/${asin}`

    results.push({
      name:     title.slice(0, 150),
      price:    price || 0,
      image:    image || null,
      url:      productUrl,
      platform: 'amazon',
      rating,
    })
  }

  return results
}

function parsePriceFromBlock(block) {
  // a-offscreen span = screen-reader accessible price = the actual selling price
  const offscreen = block.match(/<span class="a-offscreen">₹([0-9,]+)<\/span>/)
  if (offscreen) return parseInt(offscreen[1].replace(/,/g, ''))

  // Fallback: first a-price-whole
  const whole = block.match(/class="a-price-whole">([0-9,]+)</)
  if (whole) return parseInt(whole[1].replace(/,/g, ''))

  return 0
}
