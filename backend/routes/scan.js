// backend/routes/scan.js
import { Router } from 'express'
import { z } from 'zod'
import { runAgenticScan, runAlternatives } from '../services/orchestrator.js'
import { saveFirestoreScan, getUserPlan } from '../services/firebase.js'
import { scanContext } from '../services/scanContext.js'
import { productKeyFor } from '../services/priceStore.js'
import { detectPlatform } from '../utils/platformDetector.js'

export const scanRouter = Router()

// ── Input validation schema ──────────────────────────────────────
const ScanSchema = z.object({
  url: z.string().url('Invalid URL'),
  userId: z.string().nullish().transform(v => v || undefined),
  // Use passthrough so scanner fields (productName, numRatings, numReviews, image, etc.)
  // are forwarded to agents instead of being stripped by Zod.
  productData: z.object({}).passthrough().nullish().transform(v => v || {}),
})

// ── POST /api/scan ───────────────────────────────────────────────
scanRouter.post('/', async (req, res) => {
  const start = Date.now()

  // Validate input
  const parsed = ScanSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request',
      issues: parsed.error.issues,
    })
  }

  const { url, userId, productData } = parsed.data

  try {
    // Check plan limits
    if (userId) {
      const plan = await getUserPlan(userId)
      console.log(`User ${userId} plan: ${plan}`)
      // (Free tier limit enforcement could go here)
    }

    // Run 5 agents in parallel, then the compliance engine (alternatives load on demand)
    const result = await runAgenticScan({ url, productData, userId })

    // Persist to Firestore (non-blocking)
    if (userId) {
      saveFirestoreScan(userId, result).catch(e =>
        console.warn('Firestore save failed:', e.message)
      )
    }

    res.json({
      success: true,
      result,
      meta: {
        durationMs: Date.now() - start,
        agentsRun: Object.keys(result.agentResults || {}).length,
      },
    })
  } catch (err) {
    if (err.message?.startsWith('No checks could run')) {
      // The page gave us nothing to check — say so instead of returning a 500.
      return res.status(422).json({ error: 'Not enough product data', message: err.message })
    }
    console.error('Scan route error:', err)
    res.status(500).json({
      error: 'Scan failed',
      message: err.message,
    })
  }
})

// ── POST /api/scan/quick ─────────────────────────────────────────
// The trust badge shown when a product page loads. Backup rules only — no AI calls,
// no web look-ups — so it is fast and free. The badge says "Quick check"; a full scan
// (with AI) runs when the user taps it. Cached per listing for 6 hours.
const quickCache = new Map()
const QUICK_TTL = 6 * 3600e3
scanRouter.post('/quick', async (req, res) => {
  const parsed = ScanSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues })
  const { url, productData } = parsed.data
  const key = productKeyFor({ url, platform: productData?.platform || detectPlatform(url), productName: productData?.productName })
  const hit = quickCache.get(key)
  if (hit && Date.now() - hit.at < QUICK_TTL && hit.price === productData?.price) return res.json({ success: true, cached: true, result: hit.result })
  try {
    const full = await scanContext.run({ quick: true }, () => runAgenticScan({ url, productData }))
    const verdict = full.aiSummary?.find(s => s.id === 'verdict')
    const result = {
      quick: true,
      trustScore: full.trustScore, trustLevel: full.trustLevel,
      verdict: verdict?.verdict || null,
      reasons: (verdict?.points || []).slice(1, 3),
      checksCompleted: full.checksCompleted, checksTotal: full.checksTotal,
      discount: full.priceHistory?.discount || null,
      reviewSpike: full.reviewSpike?.spike || false,
    }
    quickCache.set(key, { at: Date.now(), price: productData?.price, result })
    if (quickCache.size > 2000) quickCache.delete(quickCache.keys().next().value)
    res.json({ success: true, cached: false, result })
  } catch (err) {
    if (err.message?.startsWith('No checks could run')) return res.status(422).json({ error: 'Not enough product data', message: err.message })
    console.error('Quick scan error:', err.message)
    res.status(500).json({ error: 'Quick check failed', message: err.message })
  }
})

// ── POST /api/scan/alternatives ──────────────────────────────────
// Cheaper options, loaded only when the user taps "Find cheaper options".
// Kept out of the main scan so its slow live look-ups can never fail the scan.
const ALT_BUDGET_MS = parseInt(process.env.ALTERNATIVES_TIMEOUT) || 30000

scanRouter.post('/alternatives', async (req, res) => {
  const parsed = ScanSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues })
  }
  const { url, productData } = parsed.data
  let timer
  try {
    const result = await Promise.race([
      runAlternatives({ url, productData }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Alternatives took too long')), ALT_BUDGET_MS) }),
    ])
    res.json({ success: true, result })
  } catch (err) {
    console.error('Alternatives route error:', err.message)
    res.status(504).json({ error: 'Alternatives failed', message: err.message })
  } finally {
    clearTimeout(timer)
  }
})

// ── GET /api/scan/health ─────────────────────────────────────────
scanRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', agents: 7, message: '6 scan agents + on-demand alternatives ready' })
})
