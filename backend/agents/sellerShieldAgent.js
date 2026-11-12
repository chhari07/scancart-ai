// backend/agents/sellerShieldAgent.js
// ENGINE 2 — Seller Shield
// Fetches Amazon seller profile for address/feedback data,
// builds Google Maps + Google Search verification URLs,
// then uses Claude for legitimacy analysis.
import { isQuickScan } from '../services/scanContext.js'
import { claudeJsonWithTimeout } from '../services/claude.js'
import { validatePrice, detectCategory } from '../utils/priceValidator.js'

const TIMEOUT = parseInt(process.env.AGENT_TIMEOUT) || 10000

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'DNT': '1',
  'Connection': 'keep-alive',
}

// Platform-owned / platform-linked large sellers — always verified
const PLATFORM_TRUSTED = [
  'appario', 'cloudtail', 'clicktech', 'cocoblu', 'retailez', 'darshita',   // Amazon India's biggest sellers
  'amazon', 'flipkart', 'retailnet', 'omnitech', 'myntra', 'nykaa', 'snapdeal retail', 'tata cliq', 'ajio',
  // big Indian retailers selling their own stock on their own sites (the general reader uses the shop as seller)
  'croma', 'reliance digital', 'reliance retail', 'jiomart', 'vijay sales', 'tatacliq', 'bigbasket', 'decathlon',
  'ikea', 'lenskart', 'firstcry', 'purplle', 'pepperfry', 'sangeetha', 'poorvika', 'shoppers stop', 'lifestyle',
]

// Approximate authorized sellers for major brands
const AUTHORIZED_SELLERS = {
  apple:   ['apple india', 'icare', 'reliance digital', 'croma', 'unicorn infosolutions', 'appario'],
  samsung: ['samsung smart plaza', 'reliance digital', 'croma', 'samsung india', 'appario'],
  nike:    ['myntra', 'nike', 'footlocker', 'sport king'],
  lakme:   ['nykaa', 'lakme', 'reliance retail'],
  sony:    ['sony india', 'reliance digital', 'croma', 'appario'],
  boat:    ['imagine marketing', 'boat', 'appario'],
  noise:   ['noise', 'hpny international', 'appario'],
  titan:   ['titan', 'helios', 'world of titan', 'appario', 'titan company'],
}

export async function sellerShieldAgent({ productData }) {
  console.log('[ScanCart SellerShield] Starting seller analysis')

  const sellerName    = productData?.seller || 'Unknown'
  const profilePath   = productData?.sellerProfilePath || ''
  const platform      = productData?.platform || 'amazon'

  const local = localSellerAnalysis(productData)

  // ── Fetch seller profile + build verification URLs in parallel ──────
  const [profileResult] = await Promise.allSettled([
    fetchSellerProfile(profilePath, platform),
  ])

  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null

  const googleMapsUrl   = buildGoogleMapsUrl(sellerName, profile?.address)
  const googleSearchUrl = buildGoogleSearchUrl(sellerName)
  const sellerProfileUrl = profile?.url || null

  if (profile) {
    console.log(`[ScanCart SellerShield] Fetched seller profile: address="${profile.address || 'none'}", feedback=${profile.feedbackCount}, since=${profile.memberSince}`)
  }

  // ── Claude enhancement ──────────────────────────────────────────────
  try {
    const category     = detectCategory(productData?.productName || productData?.name || '')
    const profileInfo  = profile
      ? [
          profile.address     ? `Business Address: ${profile.address}`               : 'Business Address: Not found on profile page',
          profile.memberSince ? `Seller on Amazon since: ${profile.memberSince}`     : '',
          profile.feedbackCount != null ? `Total feedback count: ${profile.feedbackCount}` : '',
          profile.feedbackRating != null ? `Feedback rating: ${profile.feedbackRating}/5` : '',
        ].filter(Boolean).join('\n')
      : 'Amazon seller profile could not be fetched (may be blocked or unavailable)'

    const prompt = `You are a SELLER SHIELD AI for Indian e-commerce fraud detection.

Product: "${productData?.productName || productData?.name || 'Unknown'}"
Seller Name: "${sellerName}"
Price: ${productData?.price ? `Rs. ${productData.price}` : 'not found on page'}
Platform: ${platform}
Category: ${category}

Seller Profile Data (scraped from ${platform} seller page):
${profileInfo}

Trust signals shown on the store page (read by the extension):
${describeSignals(productData) || '  none found'}

Local analysis baseline:
  sellerTrustScore: ${local.sellerTrustScore}
  sellerVerified: ${local.sellerVerified}
  counterfeitRisk: ${local.counterfeitRisk}

Evaluate this seller for the Indian market. Consider:
1. Is the seller name generic/suspicious or does it sound like a real registered business?
2. Does the business address (if available) match a plausible Indian business location?
3. Is the seller a known authorized retailer for this brand/category?
4. Does the feedback count and rating suggest a legitimate established seller?
5. Are there any red flags (newly joined, no address, price too low, generic name pattern)?
IMPORTANT: a seller you do not recognise is NOT a red flag by itself. Products listed on a big Indian
store, fulfilled by the store, with good ratings and sales, are normal. Only lower trust for real warning signs.

Classify sellerType as one of:
  "brand_official"     — Brand's own store (e.g. "Titan Official Store")
  "authorized_reseller" — Known authorized retailer (Croma, Reliance Digital, Nykaa, etc.)
  "established_3p"     — Third-party with good history (high feedback count, real address)
  "new_3p"             — New or low-feedback third-party seller
  "suspicious"         — Generic name, no verifiable info, suspicious pricing

Return ONLY valid JSON:
{
  "sellerVerified": <boolean>,
  "sellerTrustScore": <0-100>,
  "counterfeitRisk": <"low"|"medium"|"high"|"critical">,
  "priceSuspicious": <boolean>,
  "sellerHistory": "<one sentence about seller track record>",
  "sellerType": "<brand_official|authorized_reseller|established_3p|new_3p|suspicious>",
  "locationNote": "<one sentence: whether the seller appears to be a real business at a verifiable location, or flag if address is missing/suspicious>",
  "confidence": <0-100>
}`

    const enhanced = await claudeJsonWithTimeout(prompt, 700, TIMEOUT)
    console.log('[ScanCart SellerShield] Claude enhanced result')

    return {
      agent:            'sellerShield',
      sellerName,
      sellerRating:     profile?.feedbackRating ?? null,  // scraped from the seller page only — never model-guessed
      sellerVerified:   enhanced.sellerVerified             ?? local.sellerVerified,
      sellerTrustScore: clamp(enhanced.sellerTrustScore    ?? local.sellerTrustScore, 0, 100),
      counterfeitRisk:  enhanced.counterfeitRisk            || local.counterfeitRisk,
      priceSuspicious:  enhanced.priceSuspicious            ?? local.priceSuspicious,
      sellerHistory:    enhanced.sellerHistory              || local.sellerHistory,
      sellerType:       enhanced.sellerType                 || local.sellerType,
      locationNote:     enhanced.locationNote               || buildLocationNote(profile, sellerName),
      sellerProfileUrl,
      googleMapsUrl,
      googleSearchUrl,
      gstin:            profile?.gstin || null,  // deterministic scraped fact — never Claude-derived
      confidence:       enhanced.confidence                 || local.confidence,
      trustSignals:     local.trustSignals,
      source: 'claude', success: true,
    }
  } catch (err) {
    console.warn('[ScanCart SellerShield] Claude failed, using local result:', err.message)
    return {
      agent: 'sellerShield',
      sellerName,
      ...local,
      sellerRating:     profile?.feedbackRating ?? null,
      locationNote:     buildLocationNote(profile, sellerName),
      sellerProfileUrl,
      googleMapsUrl,
      googleSearchUrl,
      gstin:            profile?.gstin || null,
      source: 'heuristic', success: true,
    }
  }
}

// ── Fetch Amazon seller profile page for address/feedback data ────────
async function fetchSellerProfile(profilePath, platform) {
  if (!profilePath || isQuickScan()) return null

  const base = platform === 'flipkart' ? 'https://www.flipkart.com' : 'https://www.amazon.in'
  const url  = profilePath.startsWith('http') ? profilePath : `${base}${profilePath}`

  const controller = new AbortController()
  const timer      = setTimeout(() => controller.abort(), 3000)

  try {
    const resp = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal })
    clearTimeout(timer)
    if (!resp.ok) return null

    const html = await resp.text()

    // Business address near the "Business Address" heading
    const addressMatch = html.match(/(?:Business Address|business.address)[\s\S]{0,600}?<[^>]+>([A-Z][^<]{20,250}?(?:India|Pradesh|Maharashtra|Karnataka|Tamil Nadu|Delhi|Gujarat|Rajasthan|West Bengal)[^<]*)</i)
    const address = addressMatch ? addressMatch[1].replace(/\s+/g, ' ').trim().slice(0, 250) : null

    // Feedback count
    const feedbackMatch = html.match(/([0-9][0-9,]*)\s*(?:lifetime\s*)?(?:customer\s*)?feedback/i)
    const feedbackCount = feedbackMatch ? parseInt(feedbackMatch[1].replace(/,/g, '')) : null

    // Feedback rating
    const ratingMatch = html.match(/([0-9]+\.?[0-9]*)\s*out of\s*5\s*stars/i)
    const feedbackRating = ratingMatch ? parseFloat(ratingMatch[1]) : null

    // Member since
    const memberMatch = html.match(/(?:Member since|Just launched|Seller since)[:\s]*([A-Za-z]+ \d{4}|\d{4})/i)
    const memberSince = memberMatch ? memberMatch[1] : null

    // GSTIN — format-only match (15-char pattern), not verified against GSTN
    const gstinMatch = html.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z0-9]\b/)
    const gstin = gstinMatch ? gstinMatch[0] : null

    return { address, feedbackCount, feedbackRating, memberSince, gstin, url }
  } catch {
    clearTimeout(timer)
    return null
  }
}

// ── Build Google Maps URL ─────────────────────────────────────────────
function buildGoogleMapsUrl(sellerName, address) {
  const query = address
    ? encodeURIComponent(address)
    : encodeURIComponent(`${sellerName} india`)
  return `https://www.google.com/maps/search/?api=1&query=${query}`
}

// ── Build Google Search URL for seller reviews ────────────────────────
function buildGoogleSearchUrl(sellerName) {
  const q = encodeURIComponent(`"${sellerName}" amazon seller reviews india complaints`)
  return `https://www.google.com/search?q=${q}`
}

// ── Location note when Claude unavailable ────────────────────────────
function buildLocationNote(profile, sellerName) {
  if (!profile) return `Could not fetch seller profile for "${sellerName}" — use the Google Maps link to verify manually`
  if (profile.address) return `Business address found: ${profile.address.slice(0, 120)} — verify on Google Maps`
  if (profile.memberSince) return `No business address on profile, seller joined ${profile.memberSince} — verify location manually`
  return `No address or profile info available for "${sellerName}" — use Google Maps to check legitimacy`
}

// ── Store trust signals read from the page (extension pageSignals) ────
function signalsOf(d = {}) {
  const ps = d.pageSignals || {}
  const brandWord = (d.brand || (d.productName || d.name || '').split(/\s+/)[0] || '').toLowerCase()
  const store = (ps.brandStore || '').toLowerCase()
  return {
    fulfilled:    Boolean(ps.fulfilledByPlatform),
    brandStore:   Boolean(store && brandWord && store.includes(brandWord)),
    choice:       Boolean(ps.platformChoice),
    bought:       Number(ps.boughtLastMonth) || 0,
    goodRatings:  parseFloat(d.rating || 0) >= 4 && Number(d.numRatings || d.reviewCount || 0) >= 50,
  }
}
function describeSignals(d) {
  const s = signalsOf(d), out = []
  if (s.fulfilled)  out.push('  - Fulfilled / shipped by the store itself')
  if (s.brandStore) out.push(`  - Listed under the brand's official store page ("${d.pageSignals.brandStore}")`)
  if (s.choice)     out.push("  - Store badge (Amazon's Choice / Flipkart Assured)")
  if (s.bought)     out.push(`  - ${s.bought}+ bought in the past month`)
  if (s.goodRatings) out.push(`  - ${d.rating}★ from ${d.numRatings || d.reviewCount} ratings`)
  return out.join('\n')
}

// ── Local heuristic analysis (no API) ─────────────────────────────────
// Trust-first: a seller we do not recognise is "not in our list", not "bad".
// Only real warning signs (fake-looking name, price far below normal) lower trust.
function localSellerAnalysis(d = {}) {
  const seller = (d.seller || '').toLowerCase()
  const price  = d.price || 0
  const name   = (d.productName || d.name || '').toLowerCase()
  const sig    = signalsOf(d)

  let sellerVerified = false
  let sellerType     = seller ? 'not_listed' : 'unknown'

  if (PLATFORM_TRUSTED.some(s => seller.includes(s))) {
    sellerVerified = true
    sellerType     = 'authorized_reseller'
  }
  for (const [brand, sellers] of Object.entries(AUTHORIZED_SELLERS)) {
    if (name.includes(brand) && sellers.some(s => seller.includes(s))) {
      sellerVerified = true
      sellerType     = 'authorized_reseller'
      break
    }
  }
  const brand = name.split(' ')[0]
  if (brand && seller.includes(brand.toLowerCase()) && (seller.includes('official') || seller.includes('store') || seller.includes('india'))) {
    sellerVerified = true
    sellerType     = 'brand_official'
  }
  // Not on our list, but the store itself vouches for the listing → established seller
  if (!sellerVerified && (sig.fulfilled || sig.brandStore) && (sig.goodRatings || sig.bought >= 50 || sig.choice)) {
    sellerType = 'established_3p'
  }

  const genericPatterns = /^[a-z]+\d{3,}$|shop\d+|seller\d+|store\d+|techzone|deals\d|offers\d/i
  const suspiciousName  = genericPatterns.test(seller) && seller.length < 20
  if (suspiciousName) { sellerVerified = false; sellerType = 'suspicious' }

  // No price on the page → no price signal (a price of 0 used to read as "critical").
  const priceValidation = price > 0 ? validatePrice(price, name, d.mrpPrice || d.mrp || 0) : { risk: 'unknown' }
  const priceSuspicious = priceValidation.risk === 'critical' || priceValidation.risk === 'high'

  let sellerTrustScore =
    sellerType === 'brand_official'      ? 88
    : sellerVerified                     ? 82
    : sellerType === 'established_3p'    ? 76
    : sellerType === 'suspicious'        ? 35
    : 66                                  // not in our list, no warning signs → neutral
  if (!suspiciousName) {
    if (sig.fulfilled)   sellerTrustScore += 6
    if (sig.brandStore)  sellerTrustScore += 4
    if (sig.choice)      sellerTrustScore += 3
    if (sig.bought >= 100) sellerTrustScore += 3
    if (sig.goodRatings) sellerTrustScore += 3
  }
  if (priceSuspicious) sellerTrustScore -= 25
  if (priceValidation.risk === 'medium') sellerTrustScore -= 8
  sellerTrustScore = clamp(sellerTrustScore, 10, 95)

  const counterfeitRisk =
    priceValidation.risk === 'critical' ? 'critical'
    : priceValidation.risk === 'high'   ? 'high'
    : suspiciousName                    ? 'medium'
    : priceValidation.risk === 'medium' && !sellerVerified && sellerType !== 'established_3p' ? 'medium'
    : 'low'

  const who = d.seller || 'This seller'
  const sellerHistory =
    sellerType === 'brand_official'      ? `${who} is the brand's own store`
    : sellerVerified                     ? `${who} is a known large seller on ${d.platform || 'this store'}`
    : sellerType === 'established_3p'    ? `${who} isn't in ScanCart's seller list yet, but the store fulfils this listing and it has good ratings — no warning signs`
    : sellerType === 'suspicious'        ? `${who} has a generic, throw-away style name — check the seller before buying`
    : seller                             ? `${who} isn't in ScanCart's seller list yet — no warning signs found`
    : 'The seller name was not shown on the page'

  return {
    sellerRating:     null,   // not on the product page; never invent one
    sellerVerified,
    sellerTrustScore,
    sellerType,
    counterfeitRisk,
    priceSuspicious,
    trustSignals: sig,
    sellerHistory,
    confidence: seller ? 55 : 25,
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v || 0)) }
