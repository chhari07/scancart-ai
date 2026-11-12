// src/utils/constants.js

// ── 5-level trust classification (matches backend spec) ─────────────
export const TRUST_LEVELS = {
  HIGHLY_AUTHENTIC: { min: 90, label: 'HIGHLY AUTHENTIC', color: '#1B8D3F', ring: '#1B8D3F' },
  AUTHENTIC:        { min: 70, label: 'AUTHENTIC',        color: '#1B8D3F', ring: '#1B8D3F' },
  CAUTION:          { min: 50, label: 'CAUTION',          color: '#F59E0B', ring: '#F59E0B' },
  SUSPICIOUS:       { min: 30, label: 'SUSPICIOUS',       color: '#F97316', ring: '#F97316' },
  AVOID:            { min: 0,  label: 'AVOID',            color: '#DC2626', ring: '#DC2626' },
}

export function getTrustLevel(score) {
  if (score >= 90) return TRUST_LEVELS.HIGHLY_AUTHENTIC
  if (score >= 70) return TRUST_LEVELS.AUTHENTIC
  if (score >= 50) return TRUST_LEVELS.CAUTION
  if (score >= 30) return TRUST_LEVELS.SUSPICIOUS
  return TRUST_LEVELS.AVOID
}

// ── Scan stage timeline — 6 stages, total ~4500ms ────────────────────
export const SCAN_STAGES = [
  { id: 1, label: 'Extracting product metadata',                  duration: 700 },
  { id: 2, label: 'Classifying fake, bot and real reviews',       duration: 900 },
  { id: 3, label: 'Analysing rating distribution range',          duration: 800 },
  { id: 4, label: 'Verifying seller credibility',                 duration: 700 },
  { id: 5, label: 'Comparing prices across platforms',            duration: 700 },
  { id: 6, label: 'Checking listing against Indian e-commerce rules', duration: 700 },
]

// ── Platform display ──────────────────────────────────────────────────
export const PLATFORM_NAMES = {
  amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra',
  nykaa: 'Nykaa', meesho: 'Meesho',
}

export const PLATFORM_COLORS = {
  amazon:   { bg: 'rgba(255,153,0,0.15)',  text: '#FF9900' },
  flipkart: { bg: 'rgba(40,116,240,0.15)', text: '#2874F0' },
  myntra:   { bg: 'rgba(255,63,108,0.15)', text: '#FF3F6C' },
  nykaa:    { bg: 'rgba(252,39,121,0.15)', text: '#FC2779' },
  meesho:   { bg: 'rgba(155,35,53,0.15)',  text: '#FF6B6B' },
}

// ── Chrome storage / messaging ────────────────────────────────────────
export const STORAGE_KEYS = { USER: 'scancart_user', SCANS: 'scancart_scans' }

// ── Website the extension signs in through ─────────────────────────────
// One setting: change VITE_WEBSITE_URL when the site moves to its own domain.
export const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL || 'https://scancartdemo.netlify.app'

// Pages allowed to hand their signed-in user to the extension
export const WEBSITE_ORIGINS = [
  new URL(WEBSITE_URL).origin,
  'https://scancartdemo.netlify.app',
  'https://scancart.ai',
  'http://localhost:5173',
]

export const MESSAGE_TYPES = {
  AUTH_SYNC:        'SCANCART_AUTH',
  AUTH_LOGOUT:      'SCANCART_LOGOUT',
  EXTENSION_READY:  'SCANCART_EXTENSION_READY',
  PING:             'SCANCART_PING',
  PONG:             'SCANCART_PONG',
  OPEN_POPUP:       'OPEN_POPUP',
  PRODUCT_DETECTED: 'PRODUCT_DETECTED',
  SCAN_COMPLETE:    'SCAN_COMPLETE',
  GET_PRODUCT_DATA: 'GET_PRODUCT_DATA',
}

export const FREE_TIER_LIMIT = 10
