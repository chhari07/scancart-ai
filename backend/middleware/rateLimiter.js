// backend/middleware/rateLimiter.js
import { rateLimit } from 'express-rate-limit'

export const apiRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900_000, // 15 min
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests — please try again later.' },
  skip: (req) => !req.path.startsWith('/api/'),
})
