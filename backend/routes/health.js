// backend/routes/health.js
import { Router } from 'express'
export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'ScanCart.ai Backend',
    version: '1.0.0',
    agents: ['reviewEngine', 'ratingEngine', 'sellerShield', 'pricePiggy', 'qualityStar', 'alternativeLightbulb', 'complianceEngine'],
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
})
