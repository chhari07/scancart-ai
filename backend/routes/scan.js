// backend/routes/scan.js
import { Router } from 'express'
import { z } from 'zod'
import { runAgenticScan } from '../services/orchestrator.js'
import { saveFirestoreScan, getUserPlan } from '../services/firebase.js'

export const scanRouter = Router()

// ── Input validation schema ──────────────────────────────────────
const ScanSchema = z.object({
  url: z.string().url('Invalid URL'),
  userId: z.string().optional(),
  // Use passthrough so scanner fields (productName, numRatings, numReviews, image, etc.)
  // are forwarded to agents instead of being stripped by Zod.
  productData: z.object({}).passthrough().optional(),
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

    // Run all 5 agents in parallel
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
        agentsRun: 5,
      },
    })
  } catch (err) {
    console.error('Scan route error:', err)
    res.status(500).json({
      error: 'Scan failed',
      message: err.message,
    })
  }
})

// ── GET /api/scan/health ─────────────────────────────────────────
scanRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', agents: 5, message: '5 AI agents ready' })
})
