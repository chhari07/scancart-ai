// backend/services/priceStore.js
// ScanCart's own price history + price watches.
// Uses Firestore when the Firebase admin key is set; otherwise a local JSON file
// (backend/data/store.json) so everything can be tested on one machine.
// Every number here is a price ScanCart actually saw on a product page — nothing is estimated.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import admin from 'firebase-admin'
import { getDb } from './firebase.js'
import { priceVerdict } from '../utils/priceVerdict.js'

const DAY = 864e5
const DEDUPE_MS = 6 * 3600e3          // same price from the same listing within 6 h = one point
const MAX_POINTS = 400                // per product, oldest dropped first

// ── Product key: one key per listing, stable across tracking params ──────
export function canonicalUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]
    if (/amazon\./.test(host) && asin) return `${host}/dp/${asin.toUpperCase()}`
    // A search page is not a product address (the Android bubble sends one for products read in the
    // Amazon app, which hides the link) → key by store + exact title instead, never one shared "/s" key.
    if (/^\/(s|search)\/?$/i.test(u.pathname)) return null
    const pid = u.searchParams.get('pid')
    if (/flipkart\.com/.test(host) && pid) return `${host}/p/${pid}`
    return `${host}${u.pathname.replace(/\/+$/, '')}`
  } catch { return null }
}

export function productKeyFor({ url, platform, productName }) {
  const c = canonicalUrl(url)
  const base = c || `${platform || 'web'}:${String(productName || '').toLowerCase().trim()}`
  return crypto.createHash('sha1').update(base).digest('hex').slice(0, 24)
}

// ── Local file backend ───────────────────────────────────────────────────
const DATA_DIR = process.env.SCANCART_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data')
const FILE = path.join(DATA_DIR, 'store.json')
let mem = null
function load() {
  if (mem) return mem
  try { mem = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch { mem = {} }
  mem.products ||= {}; mem.watches ||= {}
  return mem
}
let saveTimer = null
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(mem))
      fs.renameSync(FILE + '.tmp', FILE)
    } catch (e) { console.warn('[priceStore] save failed:', e.message) }
  }, 200)
}
export function storeMode() { return getDb() ? 'firestore' : 'local-file' }
export function _resetLocalStore() { mem = { products: {}, watches: {} } }   // tests only

// ── Price history ────────────────────────────────────────────────────────
/** Saves one price seen on a product page. Returns true if a new point was stored. */
export async function recordPrice(key, { price, mrp, platform, productName, url, at = Date.now() }) {
  price = Number(price)
  if (!key || !Number.isFinite(price) || price <= 0) return false
  mrp = Number(mrp) > price ? Number(mrp) : null
  const db = getDb()
  if (db) {
    const ref = db.collection('priceHistory').doc(key)
    const last = await ref.collection('observations').orderBy('scannedAt', 'desc').limit(1).get()
    const prev = last.docs[0]?.data()
    if (prev && prev.price === price && at - prev.scannedAt.toMillis() < DEDUPE_MS) return false
    await ref.collection('observations').add({ price, mrp, scannedAt: admin.firestore.Timestamp.fromMillis(at) })
    await ref.set({ productName: productName || null, url: url || null, platform: platform || null,
      lastSeenPrice: price, lastSeenAt: admin.firestore.Timestamp.fromMillis(at) }, { merge: true })
    return true
  }
  const s = load()
  const p = s.products[key] ||= { points: [] }
  Object.assign(p, { productName: productName || p.productName || null, url: url || p.url || null, platform: platform || p.platform || null })
  const prev = p.points[p.points.length - 1]
  if (prev && prev.price === price && at - prev.t < DEDUPE_MS) return false
  p.points.push({ t: at, price, ...(mrp ? { mrp } : {}) })
  p.points.sort((a, b) => a.t - b.t)
  if (p.points.length > MAX_POINTS) p.points.splice(0, p.points.length - MAX_POINTS)
  save()
  return true
}

/** Points seen in the last `days` days, oldest first: [{ t, price, mrp? }] */
export async function getHistory(key, { days = 90 } = {}) {
  if (!key) return []
  const since = Date.now() - days * DAY
  const db = getDb()
  if (db) {
    const snap = await db.collection('priceHistory').doc(key).collection('observations')
      .where('scannedAt', '>=', admin.firestore.Timestamp.fromMillis(since)).orderBy('scannedAt', 'asc').limit(MAX_POINTS).get()
    return snap.docs.map(d => { const x = d.data(); return { t: x.scannedAt.toMillis(), price: x.price, ...(x.mrp ? { mrp: x.mrp } : {}) } })
  }
  return (load().products[key]?.points || []).filter(p => p.t >= since)
}

/** Low / high / average over the window, or null when there is no history yet. */
export function summarise(points, { excludeLatest = false } = {}) {
  const pts = excludeLatest ? points.slice(0, -1) : points
  const prices = pts.map(p => p.price).filter(p => p > 0)
  if (!prices.length) return null
  return {
    low: Math.min(...prices), high: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    count: prices.length,
    firstSeen: pts[0].t, lastSeen: pts[pts.length - 1].t,
    daysTracked: Math.max(1, Math.round((pts[pts.length - 1].t - pts[0].t) / DAY)),
  }
}

/** Is today's price good? Same rules as the extension: see utils/priceVerdict.js */
export function discountVerdict(points, { price, mrp }) {
  return priceVerdict(points, { price, mrp })
}

// ── Price watches ────────────────────────────────────────────────────────
const cleanWatch = (w) => ({ id: w.id, ownerId: w.ownerId, key: w.key, url: w.url, productName: w.productName, platform: w.platform,
  targetPrice: w.targetPrice, startPrice: w.startPrice, lastPrice: w.lastPrice ?? w.startPrice, createdAt: w.createdAt, updatedAt: w.updatedAt })

export async function addWatch({ ownerId, url, productName, platform, targetPrice, currentPrice }) {
  const key = productKeyFor({ url, platform, productName })
  const now = Date.now()
  const id = crypto.createHash('sha1').update(`${ownerId}:${key}`).digest('hex').slice(0, 20)   // one watch per owner + product
  const w = { id, ownerId, key, url, productName: productName || null, platform: platform || null,
    targetPrice: Number(targetPrice) || null, startPrice: Number(currentPrice) || null, lastPrice: Number(currentPrice) || null, createdAt: now, updatedAt: now }
  const db = getDb()
  if (db) { await db.collection('priceWatches').doc(id).set(w, { merge: true }); return cleanWatch(w) }
  const s = load(); s.watches[id] = { ...s.watches[id], ...w, createdAt: s.watches[id]?.createdAt || now }; save()
  return cleanWatch(s.watches[id])
}

export async function listWatches(ownerId) {
  const db = getDb()
  if (db) { const snap = await db.collection('priceWatches').where('ownerId', '==', ownerId).get(); return snap.docs.map(d => cleanWatch(d.data())) }
  return Object.values(load().watches).filter(w => w.ownerId === ownerId).sort((a, b) => b.createdAt - a.createdAt).map(cleanWatch)
}

export async function removeWatch(ownerId, id) {
  const db = getDb()
  if (db) {
    const ref = db.collection('priceWatches').doc(id); const d = await ref.get()
    if (!d.exists || d.data().ownerId !== ownerId) return false
    await ref.delete(); return true
  }
  const s = load(); if (s.watches[id]?.ownerId !== ownerId) return false
  delete s.watches[id]; save(); return true
}

/** Updates a watch's last seen price. Returns the watch and whether it just hit the target. */
export async function updateWatchPrice(ownerId, id, price) {
  price = Number(price)
  const db = getDb()
  let w
  if (db) { const d = await db.collection('priceWatches').doc(id).get(); w = d.exists ? d.data() : null }
  else w = load().watches[id]
  if (!w || w.ownerId !== ownerId || !(price > 0)) return null
  const prev = w.lastPrice
  const hit = w.targetPrice != null && price <= w.targetPrice && !(prev != null && prev <= w.targetPrice)
  const dropped = prev != null && price < prev
  const next = { ...w, lastPrice: price, updatedAt: Date.now() }
  if (db) await db.collection('priceWatches').doc(id).set(next, { merge: true })
  else { load().watches[id] = next; save() }
  return { watch: cleanWatch(next), hitTarget: hit, dropped, previousPrice: prev }
}
