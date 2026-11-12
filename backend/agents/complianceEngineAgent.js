// backend/agents/complianceEngineAgent.js
// ENGINE 7 — Compliance Engine
// Audits a scanned listing against India's Consumer Protection (E-Commerce) (Amendment)
// Rules, 2026-style mandatory disclosures. Runs AFTER Seller Shield + Price Piggy, since
// it needs their finished output (seller identity facts, prior-price verdict).
//
// IMPORTANT: this is a HEURISTIC audit — page-text keyword scanning and format-only checks,
// NOT a verified government GST/BIS/GS1/Legal-Metrology lookup (no such API access exists).
// Claude may only rewrite the narrative summary sentence; it can never alter a check's
// status/severity — those are deterministic facts, not something an LLM should be free to
// invent or dismiss for something this legal-sounding.
import { claudeJsonWithTimeout } from '../services/claude.js'
import { detectCategory } from '../utils/priceValidator.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

const SEVERITY_DEDUCTION = { critical: 25, high: 15, medium: 8, low: 3 }

// Illustrative citation labels modeled on the real 2020 Consumer Protection (E-Commerce)
// Rules' structure (seller identity, return/refund, country-of-origin) plus a generic
// 2026-amendment tag. NOT verified statute text — pending legal review.
const RULES = {
  SELLER_IDENTITY:  'CPA (E-Commerce) Rules — Seller identity & registered address disclosure',
  SELLER_GSTIN:     'CPA (E-Commerce) Rules — Seller GSTIN disclosure',
  COUNTRY_ORIGIN:   'CPA (E-Commerce) (Amendment) Rules 2026 — Country of origin disclosure',
  RETURN_REFUND:    'CPA (E-Commerce) Rules — Return/refund/exchange terms disclosure',
  WARRANTY:         'CPA (E-Commerce) (Amendment) Rules 2026 — Warranty details disclosure',
  DELIVERY:         'CPA (E-Commerce) (Amendment) Rules 2026 — Delivery details disclosure',
  PAYMENT:          'CPA (E-Commerce) (Amendment) Rules 2026 — Payment details disclosure',
  PRIOR_PRICE:      'CPA (E-Commerce) (Amendment) Rules 2026 — Prior price (30-day low) disclosure',
  BEST_BEFORE:      'CPA (E-Commerce) (Amendment) Rules 2026 — Best-before/expiry disclosure',
}

const DEFERRED_CHECKS = [
  { field: 'sponsoredAdLabel',         reason: 'Per-listing "Sponsored" badge detection needs per-platform DOM selectors — deferred this pass.' },
  { field: 'rankingParameters',        reason: 'Ranking-parameter disclosure is platform-level footer content — not applicable to a single-listing scan.' },
  { field: 'darkPatternCertificate',   reason: 'Dark-pattern detector is explicitly out of scope for this pass.' },
  { field: 'nationalConsumerHelpline', reason: 'NCH linkage is platform-level footer content — not applicable to a single-listing scan.' },
  { field: 'dataConsentNotice',        reason: 'Data-consent notice is governed by platform-level privacy policy — not applicable to a single-listing scan.' },
]

const WARRANTY_CATEGORIES = ['smartphone', 'smartwatch', 'laptop', 'earbuds', 'headphones', 'tablet', 'television', 'appliances']

export async function complianceEngineAgent({ url, productData, seller, price }) {
  console.log('[ScanCart ComplianceEngine] Starting compliance audit')

  const category = detectCategory(productData?.productName || productData?.name || '')
  const signals  = productData?.pageSignals || {}
  const checks   = runLocalChecks({ seller, price, category, signals })
  const { score, breaches, confidence } = summarise(checks)

  const local = {
    complianceScore: score,
    checks,
    breaches,
    checksSkipped: DEFERRED_CHECKS,
    complianceSummary: breaches.length
      ? `${breaches.length} potential compliance concern(s): ${breaches.map(b => b.field).join(', ')}.`
      : 'No compliance concerns detected in this heuristic audit.',
    confidence,
  }

  try {
    const prompt = `You are a COMPLIANCE AUDIT NARRATOR for Indian e-commerce.

The following checks were already computed deterministically — do NOT invent new facts, and do
NOT change any status or severity. Your only job is to write a 1-2 sentence natural-language
summary of these findings, in plain English, as if explaining to a shopper.

Checks:
${checks.map(c => `- [${c.status}] ${c.field}: ${c.message}`).join('\n')}

Return ONLY valid JSON:
{ "complianceSummary": "<1-2 sentence summary of the checks above, no new facts>" }`

    const enhanced = await claudeJsonWithTimeout(prompt, 300, TIMEOUT)
    return {
      agent: 'complianceEngine',
      ...local,
      complianceSummary: enhanced.complianceSummary || local.complianceSummary,
      disclaimer: DISCLAIMER,
      source: 'claude', success: true,
    }
  } catch (err) {
    console.warn('[ScanCart ComplianceEngine] Claude failed, using local summary:', err.message)
    return { agent: 'complianceEngine', ...local, disclaimer: DISCLAIMER, source: 'heuristic', success: true }
  }
}

const DISCLAIMER = 'Heuristic/estimated audit based on publicly visible page text and seller-profile scraping only. This is NOT a verified government GST/BIS/GS1/Legal-Metrology check and must not be treated as legal proof of compliance or non-compliance.'

// ── Deterministic local checks ──────────────────────────────────────────

function pass(rule, field, message)             { return { rule, field, status: 'pass', severity: 'low', message } }
function breach(rule, field, severity, message)  { return { rule, field, status: 'breach', severity, message } }
function notApplicable(rule, field, message)     { return { rule, field, status: 'not_applicable', severity: 'low', message } }
function unknownCheck(rule, field, message)      { return { rule, field, status: 'unknown', severity: 'low', message } }

function runLocalChecks({ seller = {}, price = {}, category, signals = {} }) {
  const checks = []

  checks.push(seller.locationNote && /address found|business address:/i.test(seller.locationNote)
    ? pass(RULES.SELLER_IDENTITY, 'sellerAddress', 'Registered business address found on seller profile page.')
    : breach(RULES.SELLER_IDENTITY, 'sellerAddress', 'medium', 'No registered business address found on the seller\'s profile page.'))

  checks.push(seller.gstin
    ? pass(RULES.SELLER_GSTIN, 'sellerGstin', `GSTIN-format string found on seller profile (${seller.gstin}) — format check only, not verified against GSTN.`)
    : unknownCheck(RULES.SELLER_GSTIN, 'sellerGstin', 'No GSTIN-pattern text found on seller profile page (often only shown at checkout/invoice — inconclusive).'))

  checks.push(signals.hasCountryOfOriginText
    ? pass(RULES.COUNTRY_ORIGIN, 'countryOfOrigin', 'Country-of-origin text detected on the listing page.')
    : breach(RULES.COUNTRY_ORIGIN, 'countryOfOrigin', 'medium', 'No "Country of Origin" text detected anywhere on the listing page.'))

  checks.push(signals.hasReturnPolicyText
    ? pass(RULES.RETURN_REFUND, 'returnPolicy', 'Return/refund/exchange policy text detected on the page.')
    : breach(RULES.RETURN_REFUND, 'returnPolicy', 'high', 'No return/refund/exchange policy text detected on the listing page.'))

  const warrantyRelevant = WARRANTY_CATEGORIES.includes(category)
  checks.push(!warrantyRelevant
    ? notApplicable(RULES.WARRANTY, 'warranty', `Warranty disclosure not customary for category "${category}".`)
    : signals.hasWarrantyText
      ? pass(RULES.WARRANTY, 'warranty', 'Warranty/guarantee text detected on the page.')
      : breach(RULES.WARRANTY, 'warranty', 'medium', 'No warranty/guarantee text detected for a category where it is customary.'))

  checks.push(signals.hasDeliveryInfoText
    ? pass(RULES.DELIVERY, 'delivery', 'Delivery timeline/shipping information detected on the page.')
    : breach(RULES.DELIVERY, 'delivery', 'low', 'No delivery timeline/shipping-cost text detected on the listing page.'))

  checks.push(signals.hasPaymentInfoText
    ? pass(RULES.PAYMENT, 'payment', 'Payment-method/COD-availability text detected on the page.')
    : breach(RULES.PAYMENT, 'payment', 'low', 'No payment-method/COD-availability text detected on the listing page.'))

  checks.push(buildPriorPriceCheck(price))

  const perishable = category === 'cosmetics'
  checks.push(!perishable
    ? notApplicable(RULES.BEST_BEFORE, 'bestBefore', `Best-before/expiry disclosure not applicable to category "${category}".`)
    : signals.hasBestBeforeText
      ? pass(RULES.BEST_BEFORE, 'bestBefore', 'Best-before/expiry date text detected.')
      : breach(RULES.BEST_BEFORE, 'bestBefore', 'high', 'No best-before/expiry date text detected for a cosmetics-category product.'))

  return checks
}

function buildPriorPriceCheck(price = {}) {
  const v = price.priorPriceVerdict
  if (!v) {
    return price.mrp > 0
      ? unknownCheck(RULES.PRIOR_PRICE, 'priorPrice', 'MRP/strikethrough price captured but no prior-price history yet for this exact listing (first time scanned) — discount claim not yet verifiable.')
      : unknownCheck(RULES.PRIOR_PRICE, 'priorPrice', 'No MRP/strikethrough price detected on this listing — discount-claim honesty cannot be evaluated.')
  }
  if (v.discountClaimHonest === false) {
    // A small "permanent discount" is common marketing — flag it, but only a big fake sale is a high-severity breach
    return breach(RULES.PRIOR_PRICE, 'priorPrice', (v.claimedDiscountPercent || 0) >= 25 ? 'high' : 'medium',
      `Listing claims ${v.claimedDiscountPercent}% off, but ScanCart's own ${v.windowDays}-day tracked price for this exact listing ranged Rs.${v.priorLow}-Rs.${v.priorHigh} — today's price is not meaningfully below its recent normal price.`)
  }
  return pass(RULES.PRIOR_PRICE, 'priorPrice', v.isNewLow
    ? `This is the lowest price ScanCart has recorded for this listing in ${v.windowDays} days.`
    : 'Discount claim is consistent with ScanCart\'s tracked price history for this listing.')
}

function summarise(checks) {
  const breaches = checks.filter(c => c.status === 'breach')
  let score = 100
  for (const b of breaches) score -= SEVERITY_DEDUCTION[b.severity] ?? 5
  score = Math.max(0, Math.min(100, score))

  const evaluable = checks.filter(c => c.status !== 'not_applicable')
  const unknownCount = evaluable.filter(c => c.status === 'unknown').length
  const confidence = evaluable.length ? Math.round(100 * (1 - unknownCount / evaluable.length)) : 50

  return { score, breaches, confidence }
}
