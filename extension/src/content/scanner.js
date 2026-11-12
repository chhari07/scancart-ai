// src/content/scanner.js
// ProductScanner extracts the 5 metadata fields from the product page DOM.
// Every method uses try-catch — never throws, never crashes.

import { detectPlatform, isProductPage, SELECTORS } from '../utils/selectors'
import { readPageJsonLd } from '../utils/jsonld'

export class ProductScanner {
  constructor() {
    this.platform = null
    this.data     = null
    this.observer = null
  }

  init() {
    this.platform = detectPlatform()
    if (!this.platform || !isProductPage()) return false
    this.scan()
    this.watchNavigation()
    return true
  }

  scan() {
    const data = this.extract()
    if (data) {
      this.data = data
      try {
        chrome.runtime.sendMessage({ type: 'PRODUCT_DETECTED', data })
      } catch {
        console.log('[ScanCart Scanner] Background not ready — scan data cached locally')
      }
    }
    return data
  }

  extract() {
    try {
      const sel = SELECTORS[this.platform]
      if (!sel) return null

      // schema.org JSON-LD first where it is reliable; CSS selectors fill the gaps.
      // Amazon rarely publishes an offer price in JSON-LD, and its price block is well tuned,
      // so there the page's own price element wins.
      const ld          = readPageJsonLd()
      const domPrice    = this.parsePrice(sel.price)
      const name        = this.text(sel.name) || ld?.name || ''
      const price       = this.platform === 'amazon' ? (domPrice || ld?.price || 0) : (ld?.price || domPrice)
      const image       = this.attr(sel.image, 'src') || ld?.image || ''
      const rating      = this.parseRating(sel.rating) || ld?.rating || 0
      const numRatings  = this.parseCount(sel.numRatings) || ld?.numRatings || 0
      const numReviews  = this.parseCount(sel.numReviews) || ld?.numReviews || 0
      const seller            = this.parseSeller(sel.seller)
      const sellerProfilePath = this.attr(sel.sellerLink, 'href')
      const domReviews        = this.extractReviews(sel.reviewTexts)
      const reviewTexts       = domReviews.length ? domReviews : (ld?.reviewTexts || [])
      // Keep repeats: several reviews on the same day is exactly what the burst check looks for
      const domDates          = this.extractDates(sel.reviewDates)
      const reviewDates       = (domDates.length ? domDates : (ld?.reviewDates || [])).slice(0, 40)
      const mrpPrice          = this.parseMrp(sel.mrp)
      const pageSignals       = this.scanPageSignals()

      console.log(`[ScanCart Scanner] Extracted from ${this.platform}: "${name}" Rs.${price} (${reviewTexts.length} review texts)`)

      return {
        productName:  name,
        price,
        image,
        rating,
        numRatings,
        numReviews,
        // Legacy field for backward compatibility
        reviewCount:  numRatings,
        seller,
        sellerProfilePath,
        reviewTexts,
        reviewDates,
        mrpPrice,
        brand:        ld?.brand || '',
        sources:      { jsonLd: Boolean(ld), jsonLdPrice: Boolean(ld?.price) },
        pageSignals,
        platform:     this.platform,
        url:          window.location.href,
        extractedAt:  new Date().toISOString(),
      }
    } catch (err) {
      console.log('[ScanCart Scanner] Extraction error:', err.message)
      return null
    }
  }

  // ── Field parsers ───────────────────────────────────────────────

  text(selector) {
    if (!selector) return ''
    try {
      // selector may be comma-separated — querySelector picks first match
      return document.querySelector(selector)?.textContent?.trim() || ''
    } catch { return '' }
  }

  attr(selector, attribute) {
    if (!selector) return ''
    try {
      return document.querySelector(selector)?.getAttribute(attribute) || ''
    } catch { return '' }
  }

  parsePrice(selector) {
    try {
      const selectors = Array.isArray(selector) ? selector : [selector]
      const isAmazon  = this.platform === 'amazon'

      // Containers whose child prices are NOT the selling price:
      // generic: strikethrough MRP elements
      // amazon-specific: EMI installment blocks, partner offers, alternate offer comparison,
      //   deal accordion rows, buy-box tabs that are not currently selected
      const BAD_GENERIC = '.a-text-price, .basisPrice, [data-a-color="secondary"], .a-price.a-text-price'
      const BAD_AMAZON  = [
        BAD_GENERIC,
        '#partnerOffers',
        '#dealsAccordionRows',
        '#mir-layout-DELIVERY_BLOCK',
        '#emi-installment-display',
        '#InstallmentCalculator_feature_div',
        '#HLCXComparisonWidget_feature_div',
        '#alternateOfferEligibilityMessaging_feature_div',
        '.reinventPriceBadge',
        '.buybox-tabpanel:not([aria-selected="true"])',
        '#mbc',
      ].join(', ')

      const badAncestors = isAmazon ? BAD_AMAZON : BAD_GENERIC

      for (const sel of selectors) {
        const el = document.querySelector(sel)
        if (!el) continue
        if (el.closest(badAncestors)) continue
        const digits = el.textContent.replace(/[^0-9]/g, '')
        const price  = parseInt(digits)
        if (price <= 0) continue

        // Amazon sanity guard: if a container-scoped selector already found a price,
        // reject any later generic result that is less than 60% of it (likely EMI/offer sub-price).
        if (isAmazon) {
          const sanity = this._amazonSanityPrice()
          if (sanity > 0 && price < sanity * 0.60) {
            console.log(`[ScanCart Scanner] Price ${price} rejected (<60% of sanity ${sanity}), trying next selector`)
            continue
          }
        }

        return price
      }
      return 0
    } catch { return 0 }
  }

  // Returns the most reliable Amazon selling price by checking only the most
  // specific container selectors — used as a cross-validation reference only.
  _amazonSanityPrice() {
    const trusted = [
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-price-whole',
      '#apex_offerDisplay_desktop .priceToPay .a-price-whole',
      '#corePrice_desktop .priceToPay .a-price-whole',
      '#price_inside_buybox',
      '#price',
    ]
    for (const sel of trusted) {
      try {
        const el = document.querySelector(sel)
        if (!el) continue
        if (el.closest('[data-a-color="secondary"], .a-text-price')) continue
        const price = parseInt(el.textContent.replace(/[^0-9]/g, ''))
        if (price > 0) return price
      } catch { /* continue */ }
    }
    return 0
  }

  // Best-effort strikethrough/MRP price capture — does NOT apply the parsePrice()
  // bad-ancestor exclusion, since here we WANT the struck-through element.
  parseMrp(selector) {
    if (!selector) return 0
    try {
      const el = document.querySelector(selector)
      if (!el) return 0
      // "₹4,490.00" → 4490 (keep the decimal point, or .00 turns it into 449000)
      const m = el.textContent.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
      return m ? Math.round(parseFloat(m[0])) : 0
    } catch { return 0 }
  }

  // Generic, platform-agnostic keyword scan for the compliance-relevant disclosures
  // (return policy, warranty, delivery, payment, country of origin, best-before).
  // This is presence-only text matching, not per-field DOM extraction — real signal,
  // but with known false-positive/negative risk, hence `scopeNote` documenting the caveat.
  scanPageSignals() {
    try {
      const clone = document.body.cloneNode(true)
      clone.querySelectorAll('nav, footer, header, script, style, noscript').forEach(el => el.remove())
      const text = clone.innerText.toLowerCase()
      return {
        hasReturnPolicyText:    /\breturn(s)?\s*(&|and)?\s*(refund|exchange)?\s*policy\b|\b(7|10|15|30)[\s-]day return\b/.test(text),
        hasWarrantyText:        /\bwarranty\b|\bguarantee\b/.test(text),
        hasDeliveryInfoText:    /\bdelivery\s*(by|in|charges|options|estimate)?\b|\bexpected delivery\b|\bfree delivery\b/.test(text),
        hasPaymentInfoText:     /\bcash on delivery\b|\bcod\b|\bemi\b|\bpayment options?\b|\bupi\b/.test(text),
        hasCountryOfOriginText: /\bcountry of origin\b|\bmade in india\b|\bmanufactured in\b/.test(text),
        hasBestBeforeText:      /\bbest before\b|\bexpiry date\b|\buse by\b|\bmfg date\b/.test(text),
        scopeNote: 'page-text keyword scan (nav/header/footer excluded) — presence only, not per-field extraction',
      }
    } catch { return null }
  }

  parseRating(selector) {
    try {
      const text = this.text(selector)
      // Extract first float: "4.5 out of 5 stars" → 4.5
      const match = text.match(/([0-9]+\.?[0-9]*)/)
      return parseFloat(match?.[1]) || 0
    } catch { return 0 }
  }

  parseCount(selector) {
    try {
      const text = this.text(selector)
      // Remove commas and non-digit chars: "12,847 ratings" → 12847
      const digits = text.replace(/,/g, '').match(/[0-9]+/)
      return parseInt(digits?.[0]) || 0
    } catch { return 0 }
  }

  parseSeller(selector) {
    try {
      // Try each selector in order (not document order) and skip link captions that are not a name
      const JUNK = /learn more|see (all|more|details)|details|visit the|other sellers|^sold by:?$|^ships from/i
      for (const one of String(selector || '').split(',').map(x => x.trim()).filter(Boolean)) {
        for (const el of document.querySelectorAll(one)) {
          const t = (el.textContent || '').replace(/^\s*sold by:?\s*/i, '').replace(/\s+/g, ' ').trim()
          if (t && t.length <= 60 && !JUNK.test(t)) return t
        }
      }
      // Fallback to platform name
      const fallbacks = { amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', nykaa: 'Nykaa', meesho: 'Meesho' }
      return fallbacks[this.platform] || this.platform
    } catch { return this.platform || 'Unknown' }
  }

  // Extracts actual user review texts from the product page DOM
  extractReviews(selector) {
    if (!selector) return []
    try {
      const nodes = document.querySelectorAll(selector)
      const seen  = new Set()
      const texts = []
      nodes.forEach(node => {
        const text = node.textContent?.trim()
        // Keep only meaningful, non-duplicate review bodies (20–400 chars)
        if (text && text.length >= 20 && text.length <= 400 && !seen.has(text)) {
          seen.add(text)
          texts.push(text)
        }
      })
      // Return at most 8 reviews to keep the payload small
      return texts.slice(0, 8)
    } catch { return [] }
  }

  // Review dates shown on the page ("Reviewed in India on 3 November 2026")
  extractDates(selector) {
    if (!selector) return []
    try {
      return [...document.querySelectorAll(selector)].map(n => n.textContent?.trim()).filter(t => t && t.length < 120).slice(0, 40)
    } catch { return [] }
  }

  // ── Navigation watcher ─────────────────────────────────────────

  watchNavigation() {
    let oldUrl = location.href
    this.observer = new MutationObserver(() => {
      if (location.href !== oldUrl) {
        oldUrl = location.href
        this.platform = detectPlatform()
        setTimeout(() => this.scan(), 1200)
      }
    })
    this.observer.observe(document.body, { childList: true, subtree: true })
  }

  getData() { return this.data }

  destroy() {
    this.observer?.disconnect()
    this.data     = null
    this.platform = null
  }
}

// ── Singleton ──────────────────────────────────────────────────────

let _scanner = null

export function getScanner() {
  if (!_scanner) _scanner = new ProductScanner()
  return _scanner
}

export { isProductPage }

export function quickExtract() {
  const s = getScanner()
  s.platform = detectPlatform()
  return s.extract()
}
