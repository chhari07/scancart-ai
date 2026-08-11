import { getDemoResult } from '../utils/demoData'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000'

// ─────────────────────────────────────────────
//  Main entry — tries backend, then demo fallback
// ─────────────────────────────────────────────
export async function analyzeProduct(url, productData = null, userId = null) {
  await new Promise(r => setTimeout(r, 1500)) // stage animation warmup

  if (BACKEND_URL) {
    try {
      const result = await callBackendEngine(url, productData, userId)
      if (result) return result
    } catch (e) {
      console.warn('Backend engine failed, using demo:', e.message)
    }
  }

  if (import.meta.env.VITE_CLAUDE_API_KEY) {
    try {
      const result = await callClaudeDirectly(url, productData)
      if (result) return result
    } catch (e) {
      console.warn('Claude direct failed, using demo:', e.message)
    }
  }

  return getDemoResult(url)
}

// ─────────────────────────────────────────────
//  Backend agentic engine call
// ─────────────────────────────────────────────
async function callBackendEngine(url, productData, userId) {
  const response = await fetch(`${BACKEND_URL}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, productData, userId }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Backend ${response.status}`)
  const data = await response.json()
  return data.result || null
}

// ─────────────────────────────────────────────
//  Claude direct call (backup)
// ─────────────────────────────────────────────
async function callClaudeDirectly(url, productData) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: buildPrompt(url, productData) }],
    }),
  })
  if (!response.ok) throw new Error(`Claude ${response.status}`)
  const data = await response.json()
  const text  = data.content[0].text
  const match = text.match(/\{[\s\S]*\}/)
  return match ? JSON.parse(match[0]) : null
}

function buildPrompt(url, productData) {
  return `Analyse this Indian e-commerce product for authenticity. Return ONLY valid JSON.

URL: ${url}
${productData ? `Product data: ${JSON.stringify(productData)}` : ''}

Return JSON with EXACTLY these fields:
{
  "productName": "string",
  "productPrice": <integer>,
  "platform": "amazon|flipkart|myntra|nykaa|meesho",
  "trustScore": <0-100 integer>,
  "trustLevel": "HIGHLY AUTHENTIC|AUTHENTIC|CAUTION|SUSPICIOUS|AVOID",

  "fakeReviewPercent": <0-100 integer>,
  "botReviewPercent": <0-100 integer>,
  "realReviewPercent": <0-100 integer>,
  "reviewRatingRatio": <float>,
  "totalReviews": <integer>,

  "ratingDistribution": [
    {"stars": 5, "percent": <integer>, "label": "5 star"},
    {"stars": 4, "percent": <integer>, "label": "4 star"},
    {"stars": 3, "percent": <integer>, "label": "3 star"},
    {"stars": 2, "percent": <integer>, "label": "2 star"},
    {"stars": 1, "percent": <integer>, "label": "1 star"}
  ],
  "ratingCredibilityScore": <0-100 integer>,
  "ratingHealthyRange": {"min": <float>, "max": <float>},
  "ratingAboveHealthyRange": <boolean>,
  "ratingBelowHealthyRange": <boolean>,
  "ratingSuspicionLevel": "none|low|medium|high",

  "sellerRating": <0-5 float>,
  "sellerVerified": <boolean>,
  "counterfeitRisk": "low|medium|high|critical",

  "bestPrice": {"platform": "string", "price": <integer>, "url": "string", "savings": <integer>},
  "savings": <integer>,

  "alternative": {"name": "string", "price": <integer>, "reason": "string", "url": "string", "image": null, "platform": "string"},
  "allAlternatives": [
    {
      "name": "string", "brand": "string", "price": <integer>, "platform": "string",
      "platformUrl": "string", "indianBrand": <boolean>, "whyAlternative": "string",
      "alternativeType": "value|budget|premium",
      "totalAlternativeScore": <float>, "verifiedAlternative": <boolean>,
      "overallVerdict": "Highly Recommended|Recommended|Consider with Caution|Not Recommended"
    }
  ],
  "totalAlternativesFound": <integer>,
  "alternativeSummary": "string",

  "analysis": {
    "reviewPattern": "string",
    "ratingAnalysis": "string",
    "sellerHistory": "string",
    "priceFair": "string",
    "authenticity": "string"
  }
}

Rules:
- All 5 ratingDistribution percents MUST sum to exactly 100.
- realReviewPercent = 100 - fakeReviewPercent - botReviewPercent.
- ratingHealthyRange must reflect the product category.
- allAlternatives should contain 2-5 real products available in India.
- Use Rs. prefix in text fields, not the rupee symbol.`
}
