// backend/server.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { scanRouter } from './routes/scan.js'
import { healthRouter } from './routes/health.js'
import { initFirebase } from './services/firebase.js'
import { hasClaudeKey, CLAUDE_MODEL } from './services/claude.js'
import { rateLimit } from 'express-rate-limit'

const app = express()
const PORT = process.env.PORT || 4000

// ── Middleware ─────────────────────────────────────────────────────
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json({ limit: '1mb' }))

// CORS — allowed origin patterns
// Chrome MV3 content scripts may send either chrome-extension:// or the page's origin
const ALLOWED_ORIGINS = [
  /^chrome-extension:\/\//,                          // Chrome extension (popup, background, content scripts)
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,   // Local development
  /^https:\/\/(www\.)?scancart\.ai$/,                // Production website
  /^https:\/\/scancartdemo\.netlify\.app$/,         // Live website (Netlify)
  /^https:\/\/[a-z0-9.-]*\.amazon\.(in|com)/,        // Amazon (content script page origin)
  /^https:\/\/[a-z0-9.-]*\.flipkart\.com/,           // Flipkart
  /^https:\/\/[a-z0-9.-]*\.myntra\.com/,             // Myntra
  /^https:\/\/[a-z0-9.-]*\.nykaa\.com/,              // Nykaa
  /^https:\/\/[a-z0-9.-]*\.meesho\.com/,             // Meesho
]

// Also honour any explicitly configured URL from env
const EXTRA_URL = process.env.FRONTEND_URL
if (EXTRA_URL && !ALLOWED_ORIGINS.some(p => p.test(EXTRA_URL))) {
  ALLOWED_ORIGINS.push(new RegExp(`^${EXTRA_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
}

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no Origin header (server-to-server, curl, Postman)
    if (!origin) return cb(null, true)

    const allowed = ALLOWED_ORIGINS.some(pattern => pattern.test(origin))

    // Use cb(null, false) for rejected origins — never throw an Error here.
    // Throwing causes Express to emit a 500; returning false just omits CORS headers
    // and lets the browser's own CORS enforcement handle the rejection cleanly.
    cb(null, allowed)
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

// Rate limit
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900_000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests. Try again later.' },
}))

// ── Routes ─────────────────────────────────────────────────────────
app.use('/api/scan', scanRouter)
app.use('/health', healthRouter)

// ── Global error handler ───────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error', message: err.message })
})

// ── Start ──────────────────────────────────────────────────────────
async function start() {
  const firebaseOk = await initFirebase()
  const claudeOk = hasClaudeKey()
  app.listen(PORT, () => {
    console.log(`\n🛡️  ScanCart.ai Backend`)
    console.log(`✅  Running on http://localhost:${PORT}`)
    console.log(claudeOk
      ? `🤖  6 scan checks + on-demand alternatives (Claude: ${CLAUDE_MODEL})`
      : `⚠️  ANTHROPIC_API_KEY not set — checks run on backup rules only`)
    console.log(firebaseOk
      ? `🔥  Firebase connected\n`
      : `⚠️  Firebase not connected — scans and price history are not saved\n`)
  })
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
