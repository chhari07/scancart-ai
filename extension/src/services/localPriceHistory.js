// src/services/localPriceHistory.js
// Price history kept in this browser (chrome.storage.local): every price the extension sees on a
// product page, per listing, for 90 days. Works with no backend database. The backend's shared
// history is used instead whenever it has more prices (see pickHistory).

const KEY          = 'scPriceHist'
const DAY          = 86400e3
const KEEP_DAYS    = 90
const MAX_POINTS   = 200     // per product
const MAX_PRODUCTS = 300
const SAME_GAP     = 6 * 3600e3   // same price again within 6 hours = not a new point

const storage = () => globalThis.chrome?.storage?.local || null

/** One key per listing: Amazon ASIN, Flipkart pid / item id, otherwise the page path. */
export function listingKey(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
    const asin = (u.pathname.match(/\/(?:dp|gp\/product|product-reviews)\/([A-Z0-9]{10})/i) || [])[1]
    if (/amazon\./.test(host) && asin) return `${host}:${asin.toUpperCase()}`
    if (/flipkart\.com$/.test(host)) {
      const pid = u.searchParams.get('pid') || (u.pathname.match(/\/p\/(itm[a-z0-9]+)/i) || [])[1]
      if (pid) return `${host}:${pid}`
    }
    return `${host}:${u.pathname.replace(/\/+$/, '')}`
  } catch { return null }
}

async function readAll() {
  const s = storage(); if (!s) return {}
  try { return (await s.get(KEY))[KEY] || {} } catch { return {} }
}

/** Save today's price for this page. Returns the listing's points ({t, price, mrp}). */
export async function recordLocalPrice(url, { price, mrp, name } = {}) {
  const s = storage(); const key = listingKey(url)
  if (!s || !key || !(price > 0)) return []
  const all = await readAll()
  const now = Date.now()
  const rec = all[key] || { name: name || '', points: [] }
  rec.points = (rec.points || []).filter(p => p.t >= now - KEEP_DAYS * DAY)
  const last = rec.points[rec.points.length - 1]
  if (!last || last.price !== price || now - last.t > SAME_GAP) rec.points.push({ t: now, price, mrp: mrp > 0 ? mrp : undefined })
  rec.points = rec.points.slice(-MAX_POINTS)
  rec.name = name || rec.name
  rec.seen = now
  all[key] = rec
  // Forget the listings not opened for the longest time
  const keys = Object.keys(all)
  if (keys.length > MAX_PRODUCTS) keys.sort((a, b) => (all[a].seen || 0) - (all[b].seen || 0)).slice(0, keys.length - MAX_PRODUCTS).forEach(k => delete all[k])
  try { await s.set({ [KEY]: all }) } catch {}
  return rec.points
}

export async function getLocalPoints(url) {
  const key = listingKey(url); if (!key) return []
  const rec = (await readAll())[key]
  return (rec?.points || []).filter(p => p.t >= Date.now() - KEEP_DAYS * DAY)
}

// ── Same rules as the backend (backend/services/priceStore.js) ──
export function summarise(points) {
  const pts = (points || []).filter(p => p.price > 0)
  if (!pts.length) return null
  const prices = pts.map(p => p.price)
  return {
    low: Math.min(...prices), high: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    count: prices.length, firstSeen: pts[0].t, lastSeen: pts[pts.length - 1].t,
    daysTracked: Math.max(1, Math.round((pts[pts.length - 1].t - pts[0].t) / DAY)),
  }
}

export function discountVerdict(points, { price, mrp }) {
  const before = summarise((points || []).filter(p => p.price > 0 && p.t < Date.now() - 60e3))
  if (!before || before.count < 3 || before.daysTracked < 2) {
    return { status: 'not_enough_history', message: 'ScanCart has not seen this listing often enough yet to judge the discount.', history: before }
  }
  const rs = v => '₹' + v.toLocaleString('en-IN')
  const claimed = Number(mrp) > price ? Math.round((mrp - price) / mrp * 100) : null
  const vsAvg = Math.round((before.avg - price) / before.avg * 100)
  let status, message
  if (price < before.low) { status = 'new_low'; message = `Lowest price ScanCart has seen in ${before.daysTracked} days (earlier low ${rs(before.low)}).` }
  else if (claimed != null && claimed >= 20 && vsAvg < 5) { status = 'fake_sale'; message = `Shows ${claimed}% off, but this listing has sold near ${rs(before.avg)} for ${before.daysTracked} days — the sale price is not really lower.` }
  else if (price > before.avg * 1.05) { status = 'above_usual'; message = `Higher than usual: it averaged ${rs(before.avg)} over ${before.daysTracked} days.` }
  else { status = 'usual'; message = `About the usual price (${rs(before.low)}–${rs(before.high)} over ${before.daysTracked} days).` }
  return { status, message, claimedDiscountPercent: claimed, history: before }
}

/** Local history as the same shape the backend's /api/price/observe returns. */
export function localInfo(points, { price, mrp }) {
  const pts = (points || []).map(p => ({ t: p.t, price: p.price }))
  return { points: pts, summary: summarise(pts), discount: discountVerdict(pts, { price, mrp }), source: 'local' }
}

/** Backend (shared by all users) vs this browser: use whichever has seen more prices. */
export function pickHistory(backend, local) {
  const nb = backend?.points?.length || 0, nl = local?.points?.length || 0
  if (nb && nb >= nl) return { ...backend, source: 'shared' }
  return local && nl ? local : (backend || null)
}
