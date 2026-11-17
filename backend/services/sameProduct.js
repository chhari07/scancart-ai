// backend/services/sameProduct.js
// "Where to buy": the SAME product on other sites, each with its own rating, reviews and review check.
// 1. search the other store, 2. keep only the same product (utils/productMatch.js: storage, size,
// colour, pack… must match), 3. open each matched listing and read its rating, star split, seller
// and review texts, 4. run ScanCart's real / fake review check (rules, no AI) on those reviews.
// Amazon only for now: Flipkart and Myntra block server look-ups, so they stay as search links.
import { searchAmazonIndia, HEADERS } from './searchProducts.js'
import { isQuickScan } from './scanContext.js'
import { compareProducts } from '../utils/productMatch.js'
import { classifyReviews } from '../utils/reviewClassifier.js'
import { detectCategory, tagAspects } from '../utils/reviewAspects.js'
import { detectPlatform } from '../utils/platformDetector.js'

const PAGE_TIMEOUT = 8000
const MAX_LISTINGS = 3

const clean = (s) => String(s || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
const num = (s) => { const n = parseFloat(String(s || '').replace(/,/g, '')); return Number.isFinite(n) ? n : 0 }

/** Reads an Amazon product page (raw HTML). Exported for tests. */
export function parseAmazonListing(html) {
  if (!html || html.length < 3000 || /Type the characters you see in this image|api-services-support@amazon/i.test(html)) return null
  const rating = num((html.match(/id="acrPopover"[^>]*title="([\d.]+) out of 5/) || html.match(/<span class="a-icon-alt">([\d.]+) out of 5 stars<\/span>/) || [])[1])
  const ratingCount = Math.round(num((html.match(/id="acrCustomerReviewText"[^>]*aria-label="([\d,]+)/) || html.match(/id="acrCustomerReviewText"[^>]*>\s*\(?([\d,]+)\)?/) || [])[1]))
  const stars = {}
  for (const m of html.matchAll(/(\d{1,3})\s*percent of reviews have (\d) stars?/gi)) stars[m[2]] ??= +m[1]
  // 2026 layout: reviewRichContentContainer · older layout: review-body
  const reviews = [...html.matchAll(/data-hook="reviewRichContentContainer"[^>]*>([\s\S]*?)<\/div>/g), ...html.matchAll(/data-hook="review-body"[^>]*>([\s\S]*?)<\/(?:span|div)>\s*<\/(?:span|div)>/g)]
    .map(m => clean(m[1]).replace(/\s*Read more\s*$/i, '')).filter(t => t.length >= 4).slice(0, 20)
  const seller = clean((html.match(/id=["']sellerProfileTriggerId["'][^>]*>([\s\S]*?)<\/a>/) || [])[1]) || (/Ships from[\s\S]{0,200}?Amazon[\s\S]{0,200}?Sold by[\s\S]{0,200}?Amazon/i.test(html) ? 'Amazon' : '')
  const fulfilled = /Fulfilled by Amazon|fulfilled-by-amazon|isAmazonFulfilled["']?\s*[:=]\s*["']?true/i.test(html)
  return { rating: rating || null, ratingCount: ratingCount || null, stars: Object.keys(stars).length ? stars : null, reviews, seller: seller || null, fulfilled }
}

/** Real / fake split + what buyers like and dislike, from the reviews read on one listing. */
export function reviewCheck(texts, productName = '') {
  const c = classifyReviews(texts)
  if (!c.checked) return null
  const pct = (n) => Math.round(n / c.checked * 100)
  const labelled = [...c.real.map(r => ({ text: r.text, label: 'real' })), ...c.unclear.map(r => ({ text: r.text, label: 'unclear' })), ...c.fake.map(r => ({ text: r.text, label: 'fake' }))]
  const asp = tagAspects(labelled, detectCategory(productName)).aspects.filter(a => a.mentions > 0)
  const liked = asp.filter(a => a.pos > a.neg).sort((a, b) => b.pos - a.pos).slice(0, 2).map(a => a.label)
  const disliked = asp.filter(a => a.neg > a.pos).sort((a, b) => b.neg - a.neg).slice(0, 2).map(a => a.label)
  const realPercent = pct(c.real.length), fakePercent = pct(c.fake.length)
  const verdict = c.checked < 3 ? 'too_few' : fakePercent >= 35 ? 'many_fake' : realPercent >= 50 && fakePercent <= 20 ? 'mostly_real' : 'mixed'
  return {
    checked: c.checked, realPercent, fakePercent, unclearPercent: 100 - realPercent - fakePercent, verdict, liked, disliked,
    quote: (c.real.find(r => r.text.length <= 220) || c.real[0])?.text?.slice(0, 220) || null,
  }
}

/** Spread of stars: a natural spread looks like real buyers, all-5★ or a U shape is a warning. */
function ratingCheck(stars) {
  if (!stars) return null
  const five = stars['5'] || 0, one = stars['1'] || 0, mid = (stars['2'] || 0) + (stars['3'] || 0) + (stars['4'] || 0)
  if (five >= 85) return { ok: false, note: `${five}% are 5★ — unusually one-sided` }
  if (five + one >= 80 && one >= 15) return { ok: false, note: `Mostly 5★ and 1★ (${one}% 1★) — mixed quality or paid reviews` }
  return { ok: true, note: mid >= 20 ? 'Natural spread of stars' : 'Mostly high ratings, normal spread' }
}

async function fetchListing(url) {
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(PAGE_TIMEOUT) })
    return r.ok ? parseAmazonListing(await r.text()) : null
  } catch { return null }
}

/**
 * @returns {{ listings: Array, checkedStores: string[], note: string }}
 */
export async function findSameProduct({ url, productData }, { search = searchAmazonIndia, fetchPage = fetchListing } = {}) {
  const name = productData?.productName || productData?.name || ''
  const price = Number(productData?.price) || 0
  const platform = productData?.platform || detectPlatform(url)
  const empty = (note) => ({ listings: [], checkedStores: ['amazon'], note })
  if (!name || isQuickScan()) return empty('No product name on the page to search with.')

  const ownAsin = url?.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() || null
  // Clean query: no brackets / pipes / "with …" marketing tail → Amazon returns the exact item more often
  const query = name.replace(/\bwith\b.*$/i, '').replace(/[()|,:+\-–]/g, ' ').replace(/\b(RAM|Storage)\b/gi, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 9).join(' ')
  const results = await search(query, 8).catch(() => [])
  const matched = []
  for (const r of results) {
    if (!r.price || !r.url) continue
    const asin = r.url.match(/\/dp\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase()
    if (asin && asin === ownAsin) continue                       // the page itself
    const m = compareProducts(name, r.name, { pagePrice: price, otherPrice: r.price })
    if (m.same) { matched.push({ ...r, asin, how: m.how, score: m.score }); continue }
    // Same model in another colour: shown with a label (stores share reviews across colours)
    if (m.reason === 'Colour is different') {
      const c = compareProducts(name, r.name, { pagePrice: price, otherPrice: r.price, ignoreColour: true })
      if (c.same) matched.push({ ...r, asin, how: c.how, score: c.score - 0.5, otherColour: true })
    }
  }
  matched.sort((a, b) => b.score - a.score || a.price - b.price)
  const top = matched.slice(0, MAX_LISTINGS)
  const pages = await Promise.all(top.map(r => fetchPage(r.url)))

  const listings = top.map((r, i) => {
    const page = pages[i]
    const reviews = page?.reviews?.length ? reviewCheck(page.reviews, name) : null
    return {
      platform: r.platform || 'amazon', name: r.name, url: r.url, image: r.image || null, price: r.price,
      how: r.how, otherColour: r.otherColour || false, diff: price ? r.price - price : 0,
      rating: page?.rating ?? r.rating ?? null, ratingCount: page?.ratingCount ?? null,
      stars: page?.stars || null, ratingCheck: ratingCheck(page?.stars), seller: page?.seller || null, fulfilled: page?.fulfilled || false,
      reviews, pageRead: Boolean(page),
    }
  }).sort((a, b) => (a.otherColour - b.otherColour) || a.price - b.price)

  const note = listings.length ? '' : platform === 'amazon'
    ? 'No other Amazon listing of this exact product (same storage, size and colour) was found.'
    : 'This exact product (same storage, size and colour) was not found on Amazon.'
  return { listings, checkedStores: ['amazon'], note }
}
