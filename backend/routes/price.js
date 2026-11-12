// backend/routes/price.js
// Price history ScanCart builds itself: the extension sends the price on every product page view.
import { Router } from 'express'
import { z } from 'zod'
import { productKeyFor, recordPrice, getHistory, summarise, discountVerdict, storeMode } from '../services/priceStore.js'
import { detectPlatform } from '../utils/platformDetector.js'

export const priceRouter = Router()

const ObserveSchema = z.object({
  url: z.string().url(),
  productData: z.object({
    productName: z.string().max(400).optional(),
    price: z.coerce.number().positive().max(1e8),
    mrpPrice: z.coerce.number().nonnegative().max(1e8).optional(),
    platform: z.string().max(40).optional(),
  }).passthrough(),
})

// POST /api/price/observe — save today's price, return the history + discount verdict
priceRouter.post('/observe', async (req, res) => {
  const parsed = ObserveSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues })
  const { url, productData: d } = parsed.data
  const platform = d.platform || detectPlatform(url)
  const key = productKeyFor({ url, platform, productName: d.productName })
  try {
    const before = await getHistory(key, { days: 90 })
    const discount = discountVerdict(before, { price: d.price, mrp: d.mrpPrice || 0 })
    const saved = await recordPrice(key, { price: d.price, mrp: d.mrpPrice, platform, productName: d.productName, url })
    const points = await getHistory(key, { days: 90 })
    res.json({ success: true, key, saved, store: storeMode(), points: points.map(p => ({ t: p.t, price: p.price })), summary: summarise(points), discount })
  } catch (err) {
    console.error('price/observe failed:', err.message)
    res.status(500).json({ error: 'Could not save price', message: err.message })
  }
})

// GET /api/price/history?url=...&days=90
priceRouter.get('/history', async (req, res) => {
  const url = String(req.query.url || '')
  const days = Math.min(365, Math.max(1, parseInt(req.query.days) || 90))
  if (!z.string().url().safeParse(url).success) return res.status(400).json({ error: 'url is required' })
  const key = productKeyFor({ url, platform: detectPlatform(url), productName: req.query.name })
  const points = await getHistory(key, { days })
  res.json({ success: true, key, points: points.map(p => ({ t: p.t, price: p.price })), summary: summarise(points) })
})
