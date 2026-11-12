// backend/utils/reviewClassifier.js
// Sorts the review texts shown on the product page into "looks real" and "looks fake".
// Rules only (no AI): every "fake" label carries the reason, so the user can judge it.
// It only sees the reviews the page shows (usually the top 8–10), and says so.

const GENERIC = /^(very\s+)?(good|nice|best|super|awesome|excellent|great|wow|amazing|perfect|ok(ay)?|fine|value for money|worth (it|buying)|love (it|this)|nice product|good product|best product|superb)[\s.!🙂👍❤️🔥⭐]*$/i
const HYPE    = /\b(best|awesome|amazing|excellent|superb|perfect|fantastic|outstanding|must buy|100%|wonderful|mind ?blowing)\b/gi
const PROMO   = /(https?:\/\/|www\.|whats ?app|telegram|call me|\b\d{10}\b|giveaway|free (gift|product) for (a|my) review|coupon code)/i
// Signs of real use: numbers, time spent with it, specifics, and honest downsides
const DETAIL  = /\b(\d+(\.\d+)?\s*(days?|weeks?|months?|years?|hours?|hrs?|mins?|gb|tb|mah|kg|inch(es)?|cm|mm|w|watts?|%|rs\.?|₹))\b|\b(after|since|used|using|bought|ordered|delivered|returned|replaced|battery|screen|display|sound|fit|size|quality|build|charging|camera|keyboard|warranty|packaging|smell|material|stitch)\b/i
const DOWNSIDE = /\b(but|however|only (issue|problem|con)|cons?\b|downside|wish|could be better|not (so|very|that)|slightly|a bit|minor)\b/i

const norm = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
const words = t => new Set(norm(t).split(' ').filter(w => w.length > 2))
function overlap(a, b) {
  if (!a.size || !b.size) return 0
  let same = 0
  for (const w of a) if (b.has(w)) same++
  return same / Math.min(a.size, b.size)
}

/**
 * @param {string[]} texts  review texts from the page
 * @returns {{ checked:number, real:{text:string, why:string}[], fake:{text:string, why:string}[], unclear:{text:string, why:string}[] }}
 */
export function classifyReviews(texts = []) {
  const list = (Array.isArray(texts) ? texts : [])
    .map(t => String(t || '').replace(/\s+/g, ' ').trim())
    .filter(t => t.length > 0)
    .slice(0, 30)
  const sets = list.map(words)
  const out = { checked: list.length, real: [], fake: [], unclear: [] }

  list.forEach((text, i) => {
    const fakeWhy = []
    const n = norm(text)
    const hype = (text.match(HYPE) || []).length
    const hasDetail = DETAIL.test(text)
    const hasDownside = DOWNSIDE.test(text)

    // near-copy of another review on the same page
    const twin = sets.findIndex((s, j) => j !== i && overlap(sets[i], s) >= 0.85 && Math.min(sets[i].size, s.size) >= 4)
    if (twin !== -1) fakeWhy.push('almost the same words as another review')
    if (PROMO.test(text)) fakeWhy.push('contains a link, number or promotion')
    const genericOnly = GENERIC.test(n) || (n.split(' ').length <= 3 && !hasDetail)
    if (hype >= 3 && !hasDetail && !hasDownside) fakeWhy.push('lots of hype words, no real details')
    const letters = text.replace(/[^A-Za-z]/g, '')
    if (letters.length > 25 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.6) fakeWhy.push('written mostly in capitals')
    if ((text.match(/!/g) || []).length >= 5) fakeWhy.push('too many exclamation marks')
    // Short praise alone is normal for real buyers too — only counts with another sign
    if (genericOnly && fakeWhy.length) fakeWhy.push('only generic praise')

    if (fakeWhy.length) {
      out.fake.push({ text, why: fakeWhy.join('; ') })
    } else if (hasDetail && (text.length >= 60 || hasDownside)) {
      const why = [hasDetail ? 'talks about real use' : null, hasDownside ? 'mentions a downside too' : null, text.length >= 200 ? 'detailed' : null].filter(Boolean).join(', ')
      out.real.push({ text, why })
    } else {
      out.unclear.push({ text, why: genericOnly ? 'too short to judge' : 'not enough detail to judge' })
    }
  })
  return out
}
