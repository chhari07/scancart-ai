// src/utils/jsonld.js
// Reads the schema.org Product data most stores publish for Google (<script type="application/ld+json">).
// It is steadier than CSS class names, which stores change often. Works on a live page
// (content script) and on raw HTML (background price checks, which have no DOM).

const num = (v) => {
  if (v == null) return 0
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function* walk(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return }
  yield node
  if (node['@graph']) yield* walk(node['@graph'])
  if (node.mainEntity) yield* walk(node.mainEntity)
}

const isProduct = (n) => [].concat(n['@type'] || []).some(t => /^(Product|ProductGroup|IndividualProduct)$/i.test(String(t)))

function offerPrice(offers) {
  for (const o of [].concat(offers || [])) {
    if (!o) continue
    const p = num(o.price) || num(o.lowPrice) || num(o.priceSpecification?.price)
    if (p) return { price: p, currency: o.priceCurrency || o.priceSpecification?.priceCurrency || null, inStock: o.availability ? /InStock/i.test(o.availability) : null }
  }
  return null
}

/** Pulls a Product out of JSON-LD text blobs. Returns null when there is none. */
export function productFromJsonLd(blobs) {
  for (const raw of blobs) {
    let data
    try { data = JSON.parse(raw.trim()) } catch { continue }
    for (const n of walk(data)) {
      if (!isProduct(n)) continue
      const offer = offerPrice(n.offers) || offerPrice(n.hasVariant?.[0]?.offers)
      const agg = n.aggregateRating || {}
      const reviews = [].concat(n.review || [])
      return {
        name: typeof n.name === 'string' ? n.name.trim() : '',
        brand: typeof n.brand === 'string' ? n.brand : n.brand?.name || '',
        image: [].concat(n.image || [])[0]?.url || [].concat(n.image || [])[0] || '',
        price: offer?.price || 0,
        currency: offer?.currency || null,
        inStock: offer?.inStock ?? null,
        rating: num(agg.ratingValue),
        numRatings: Math.round(num(agg.ratingCount) || num(agg.reviewCount)),
        numReviews: Math.round(num(agg.reviewCount)),
        sku: n.sku || n.mpn || n.gtin13 || null,
        reviewDates: reviews.map(r => r?.datePublished).filter(Boolean),
        reviewTexts: reviews.map(r => (typeof r?.reviewBody === 'string' ? r.reviewBody.trim() : '')).filter(t => t.length >= 20).slice(0, 8),
      }
    }
  }
  return null
}

/** On a live page */
export function readPageJsonLd(doc = document) {
  try {
    return productFromJsonLd([...doc.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent || ''))
  } catch { return null }
}

/** Price from raw page HTML (no DOM): JSON-LD first, then common meta tags, then Amazon's price block. */
export function priceFromHtml(html) {
  if (!html) return 0
  const blobs = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1])
  const p = productFromJsonLd(blobs)?.price
  if (p) return p
  const meta = html.match(/<meta[^>]+(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["'][^>]*content=["']([\d.,]+)["']/i)
    || html.match(/<meta[^>]+content=["']([\d.,]+)["'][^>]*(?:property|itemprop|name)=["'](?:product:price:amount|og:price:amount|price)["']/i)
  if (meta) return num(meta[1])
  // Amazon: the selling price block ("priceToPay"), never the struck-through MRP
  const amz = html.match(/class="a-price[^"]*priceToPay[^"]*"[\s\S]{0,400}?class="a-price-whole">([\d,]+)/)
  if (amz) return num(amz[1])
  const amzJson = html.match(/"priceAmount"\s*:\s*([\d.]+)/)
  return amzJson ? num(amzJson[1]) : 0
}
