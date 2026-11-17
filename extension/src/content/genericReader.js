// src/content/genericReader.js
// ScanCart works on ANY online shop, not a fixed list. Amazon, Flipkart, Myntra, Nykaa and Meesho get
// extra-tuned readers (utils/selectors.js); every other shop is read from the product data shops publish
// for Google (schema.org JSON-LD), then Open Graph / microdata tags, then the visible page.
// Used by the Chrome extension, the Android app and the Expo app (same code).
import { readPageJsonLd } from '../utils/jsonld'

const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0 }
const meta = n => document.querySelector(`meta[property="${n}"],meta[name="${n}"],meta[itemprop="${n}"]`)?.getAttribute('content') || ''
const itemprop = n => { const el = document.querySelector(`[itemprop="${n}"]`); return el ? (el.getAttribute('content') || el.textContent || '').trim() : '' }

/** "www.croma.com" → "croma", "shop.example.co.in" → "example" */
export function storeKey(host = location.hostname) {
  const parts = host.replace(/^www\d?\./, '').split('.')
  const tld2 = ['co', 'com', 'net', 'org', 'gov', 'ac'].includes(parts[parts.length - 2])
  return (parts[parts.length - (tld2 ? 3 : 2)] || parts[0] || 'store').toLowerCase()
}

function sellerFromJsonLd() {
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    const m = (s.textContent || '').match(/"seller"\s*:\s*\{[^{}]*?"name"\s*:\s*"([^"]{2,80})"/)
    if (m) return m[1]
  }
  return ''
}

function mrpFromPage(price) {
  // struck-through "was" price: <del>, <s>, .strike, .mrp, .was-price …
  const els = document.querySelectorAll('del, s, strike, [class*="strike" i], [class*="mrp" i], [class*="was-price" i], [class*="original-price" i], [class*="old-price" i], [class*="compare" i]')
  for (const el of els) {
    const v = num((el.textContent || '').replace(/,/g, ''))
    if (v > price && v < price * 10) return v
  }
  return num(meta('product:original_price:amount')) || 0
}

const BUY = /add to (cart|bag|basket)|buy now|add to trolley|buy it now/i
const RUPEE = /(?:₹|Rs\.?|INR)\s?([0-9][0-9,]*(?:\.\d{1,2})?)/

// Shop pages built with JavaScript frameworks (Next.js, Nuxt …) carry the product in an embedded JSON blob.
// Find the object that looks most like this page's product: a name + a selling price.
const NAME_KEYS = ['name', 'title', 'product_name', 'productName', 'displayName']
const PRICE_KEYS = ['selling_price', 'sellingPrice', 'final_price', 'finalPrice', 'offer_price', 'offerPrice', 'special_price', 'specialPrice', 'sale_price', 'salePrice', 'discounted_price', 'discountedPrice', 'price', 'member_price']
const MRP_KEYS = ['mrp', 'MRP', 'list_price', 'listPrice', 'original_price', 'originalPrice', 'compare_at_price', 'regular_price', 'actual_price', 'strike_price']
function embeddedProduct() {
  const blobs = []
  for (const sc of document.querySelectorAll('script#__NEXT_DATA__, script#__NUXT_DATA__, script[type="application/json"]')) blobs.push(sc.textContent || '')
  for (const sc of document.querySelectorAll('script:not([src])')) {
    const t = sc.textContent || ''
    const m = t.match(/(?:window\.)?(?:__[A-Za-z0-9_]+|__data)\s*=\s*(\{[\s\S]*\})\s*;?\s*$/)
    if (m) blobs.push(m[1])
  }
  const words = new Set((document.title + ' ' + (document.querySelector('h1')?.textContent || '')).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2))
  let best = null, bestScore = 0, seen = 0
  const pick = (o) => {
    const name = NAME_KEYS.map(k => o[k]).find(v => typeof v === 'string' && v.length >= 6 && v.length <= 300)
    if (!name) return
    const price = PRICE_KEYS.map(k => num(typeof o[k] === 'object' && o[k] ? (o[k].value ?? o[k].amount ?? o[k].price) : o[k])).find(v => v > 0 && v < 1e7)
    if (!price) return
    const hit = name.toLowerCase().split(/[^a-z0-9]+/).filter(w => words.has(w)).length
    const score = hit + (/product/i.test(Object.keys(o).join(' ')) ? 0.5 : 0)
    const rating = ['rating', 'avg_rating', 'average_rating', 'averageRating', 'ratingValue', 'star_rating'].map(k => num(typeof o[k] === 'object' && o[k] ? (o[k].value ?? o[k].average ?? o[k].avg) : o[k])).find(v => v > 0 && v <= 5) || 0
    const count = ['rating_count', 'ratingCount', 'ratings_count', 'review_count', 'reviewCount', 'reviews_count', 'total_reviews', 'totalReviews', 'total_ratings'].map(k => num(o[k])).find(v => v > 0) || 0
    if (score > bestScore) { bestScore = score; best = { name, price, rating, count, mrp: MRP_KEYS.map(k => num(o[k])).find(v => v > price) || 0, image: typeof o.image === 'string' ? o.image : '' } }
  }
  const walk = (x, d) => {
    if (!x || typeof x !== 'object' || d > 14 || ++seen > 40000) return
    if (Array.isArray(x)) { for (const y of x) walk(y, d + 1); return }
    pick(x)
    for (const k in x) walk(x[k], d + 1)
  }
  for (const b of blobs) { try { walk(JSON.parse(b), 0) } catch {} }
  return bestScore >= 1 ? best : null
}

// Last resort for shops with no product data: a title + a ₹ price near it + an Add to cart / Bag / Buy button
function visibleProduct() {
  const h1 = document.querySelector('h1') || document.querySelector('[class*="product-title" i], [class*="productTitle"], [class*="product-name" i], [class*="productName"], [itemprop="name"]')
  const title = (h1?.textContent || meta('og:title') || '').replace(/\s+/g, ' ').trim()
  if (title.length < 6) return null
  const buy = [...document.querySelectorAll('button, a, input[type="submit"], [role="button"]')].some(b => BUY.test(b.textContent || b.value || b.getAttribute?.('aria-label') || ''))
    || [...document.querySelectorAll('div, span')].slice(0, 6000).some(e => e.children.length === 0 && BUY.test(e.textContent || ''))
  if (!buy) return null
  // the ₹ price closest to the title on screen (not a "similar products" price further down)
  let price = 0
  if (h1) {
    const t = h1.getBoundingClientRect()
    let best = Infinity
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n, count = 0
    while ((n = walker.nextNode()) && count++ < 20000) {
      const m = (n.textContent || '').match(RUPEE)
      if (!m) continue
      const el = n.parentElement
      if (!el || el.closest('del, s, strike, [class*="strike" i], [class*="mrp" i]')) continue
      const r = el.getBoundingClientRect()
      if (!r.width && !r.height) continue
      const d = Math.abs(r.top - t.bottom) + Math.abs(r.left - t.left) / 4
      if (d < best) { best = d; price = num(m[1].replace(/,/g, '')) }
    }
  }
  if (!price) {
    const box = h1?.closest('main, [class*="product" i], section, article') || document.body
    const m = (box.innerText || '').match(RUPEE)
    price = m ? num(m[1].replace(/,/g, '')) : 0
  }
  return price ? { name: title, price } : null
}

// "4.3 ★ | 1.2k Ratings" near the top of the page
function visibleRating() {
  const t = (document.querySelector('main') || document.body)?.innerText?.slice(0, 6000) || ''
  const r = t.match(/\b([1-4](?:\.\d)?|5(?:\.0)?)\s*(?:★|☆|\/\s*5|out of 5|stars?)/i)
  const c = t.match(/([\d,]+(?:\.\d+)?)\s*(k|l|lakh)?\s*(?:ratings?|reviews?)\b/i)
  const count = c ? Math.round(num(c[1].replace(/,/g, '')) * (c[2] ? (/^l/i.test(c[2]) ? 1e5 : 1e3) : 1)) : 0
  return { rating: r ? num(r[1]) : 0, count }
}

/** Why a page wasn't read as a product (for the app's log): what the page has. */
export function pageClues() {
  return {
    h1: (document.querySelector('h1')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    title: document.title.slice(0, 80),
    jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
    ogType: meta('og:type'),
    nextData: Boolean(document.querySelector('script#__NEXT_DATA__')),
    jsonScripts: document.querySelectorAll('script[type="application/json"]').length,
    rupee: (document.body?.innerText?.match(RUPEE) || [])[0] || '',
    buy: [...document.querySelectorAll('button, a, [role="button"]')].some(b => BUY.test(b.textContent || '')),
    textLen: (document.body?.innerText || '').length,
  }
}

/** Product on any shop's page, in the same shape as the big-store scanner. { notProduct:true } when none. */
export function readGeneric(scanner) {
  const ld = readPageJsonLd() || {}
  let name = ld.name || (/product/i.test(meta('og:type')) ? meta('og:title') : '') || itemprop('name') || ''
  let price = ld.price || num(meta('product:price:amount') || meta('og:price:amount') || itemprop('price'))
  let embedded = null
  if (!name || !price) {
    embedded = embeddedProduct()
    if (embedded) { name = name || embedded.name; price = price || embedded.price }
  }
  if (!name || !price) {
    const v = visibleProduct()
    if (v) { name = name || v.name; price = price || v.price }
  }
  const isProduct = Boolean(name) && (Boolean(ld.name) || /product/i.test(meta('og:type')) || price > 0)
  if (!isProduct) return { notProduct: true, url: location.href, clues: pageClues() }
  const key = storeKey(location.hostname)
  const site = meta('og:site_name') || key.replace(/^./, c => c.toUpperCase())
  return {
    productName: name.replace(/\s+/g, ' ').slice(0, 300),
    price,
    image: ld.image || meta('og:image') || embedded?.image || '',
    rating: ld.rating || num(itemprop('ratingValue')) || embedded?.rating || visibleRating().rating,
    numRatings: ld.numRatings || Math.round(num(itemprop('ratingCount') || itemprop('reviewCount'))) || embedded?.count || visibleRating().count,
    numReviews: ld.numReviews || Math.round(num(itemprop('reviewCount'))),
    reviewCount: ld.numRatings || 0,
    seller: sellerFromJsonLd() || site,
    sellerProfilePath: '',
    reviewTexts: ld.reviewTexts || [],
    reviewDates: ld.reviewDates || [],
    mrpPrice: price ? (mrpFromPage(price) || (embedded?.mrp > price ? embedded.mrp : 0)) : 0,
    brand: ld.brand || meta('product:brand') || itemprop('brand') || '',
    sources: { jsonLd: Boolean(ld.name), jsonLdPrice: Boolean(ld.price), generic: true },
    pageSignals: scanner?.scanPageSignals ? scanner.scanPageSignals() : {},
    platform: key,
    storeName: site,
    url: location.href,
    extractedAt: new Date().toISOString(),
  }
}
