// backend/routes/watch.js
// Price watches. ownerId = signed-in user id, or the extension's anonymous install id.
// The extension re-checks watched pages itself and reports prices here via /check.
import { Router } from 'express'
import { z } from 'zod'
import { addWatch, listWatches, removeWatch, updateWatchPrice, recordPrice } from '../services/priceStore.js'

export const watchRouter = Router()
const Owner = z.string().min(6).max(128).regex(/^[\w:.-]+$/)

watchRouter.get('/', async (req, res) => {
  const o = Owner.safeParse(req.query.ownerId)
  if (!o.success) return res.status(400).json({ error: 'ownerId is required' })
  res.json({ success: true, watches: await listWatches(o.data) })
})

const AddSchema = z.object({
  ownerId: Owner, url: z.string().url(),
  productName: z.string().max(400).optional(), platform: z.string().max(40).optional(),
  currentPrice: z.coerce.number().positive().max(1e8),
  targetPrice: z.coerce.number().positive().max(1e8).optional(),
})
watchRouter.post('/', async (req, res) => {
  const p = AddSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Invalid request', issues: p.error.issues })
  res.json({ success: true, watch: await addWatch(p.data) })
})

watchRouter.delete('/:id', async (req, res) => {
  const o = Owner.safeParse(req.query.ownerId)
  if (!o.success) return res.status(400).json({ error: 'ownerId is required' })
  const ok = await removeWatch(o.data, req.params.id)
  res.status(ok ? 200 : 404).json({ success: ok })
})

// POST /api/watch/check — { ownerId, prices: [{ id, price }] } → which watches dropped or hit target
const CheckSchema = z.object({ ownerId: Owner, prices: z.array(z.object({ id: z.string().max(40), price: z.coerce.number().positive().max(1e8) })).max(50) })
watchRouter.post('/check', async (req, res) => {
  const p = CheckSchema.safeParse(req.body)
  if (!p.success) return res.status(400).json({ error: 'Invalid request', issues: p.error.issues })
  const results = []
  for (const { id, price } of p.data.prices) {
    const r = await updateWatchPrice(p.data.ownerId, id, price)
    if (!r) continue
    await recordPrice(r.watch.key, { price, platform: r.watch.platform, productName: r.watch.productName, url: r.watch.url }).catch(() => {})
    results.push(r)
  }
  res.json({ success: true, results })
})
