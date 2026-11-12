// backend/utils/reviewSpike.js
// Review date-spike check: many reviews landing in a few days is a common sign of a paid
// review push. Works only on the review dates actually shown on the page, so the result
// always says how many dated reviews it was based on.
const DAY = 864e5
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 }

/** Parses review dates as stores print them: "Reviewed in India on 3 November 2026", "Nov, 2026", "12 days ago", ISO. */
export function parseReviewDate(s, now = Date.now()) {
  if (s == null) return null
  if (typeof s === 'number') return Number.isFinite(s) ? s : null
  const t = String(s).trim().toLowerCase()
  if (!t) return null
  // "3 months ago" / "2 weeks ago" are too rough for a 3-day window (they would all land
  // on the same made-up day and look like a burst), so only day-level dates are used.
  if (/(week|month|year)s?\s+ago/.test(t)) return null
  let m = t.match(/(\d+)\s+days?\s+ago/)
  if (m) return now - Number(m[1]) * DAY
  if (/\btoday\b/.test(t)) return now
  if (/\byesterday\b/.test(t)) return now - DAY
  m = t.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9}),?\s+(\d{4})/)              // 3 November 2026
  if (m) { const mo = MONTHS[m[2].slice(0, 3)] ?? MONTHS[m[2].slice(0, 4)]; if (mo != null) return Date.UTC(+m[3], mo, +m[1]) }
  m = t.match(/([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/)                                // November 3, 2026
  if (m) { const mo = MONTHS[m[1].slice(0, 3)]; if (mo != null) return Date.UTC(+m[3], mo, +m[2]) }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)                                            // 2026-11-03
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3])
  return null
}

/**
 * @param {Array<string|number>} dates  review dates from the page
 * @returns {{checked:boolean, datedReviews:number, spike:boolean, windowDays:number, peak?:{from:number,to:number,count:number}, sharePercent?:number, note:string}}
 */
export function reviewDateSpike(dates, { windowDays = 3, minReviews = 6, now = Date.now() } = {}) {
  const ts = (Array.isArray(dates) ? dates : []).map(d => parseReviewDate(d, now)).filter(t => t != null && t <= now + DAY).sort((a, b) => a - b)
  if (ts.length < minReviews) {
    return { checked: false, datedReviews: ts.length, spike: false, windowDays,
      note: ts.length ? `Only ${ts.length} dated reviews on the page — not enough to check for a review burst.` : 'No review dates on the page — burst check skipped.' }
  }
  // widest cluster inside any `windowDays` window
  let best = { count: 0, from: ts[0], to: ts[0] }
  for (let i = 0, j = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > windowDays * DAY) j++
    if (i - j + 1 > best.count) best = { count: i - j + 1, from: ts[j], to: ts[i] }
  }
  const spread = Math.max(1, (ts[ts.length - 1] - ts[0]) / DAY)
  const share = Math.round(best.count / ts.length * 100)
  // a burst only counts when the reviews are otherwise spread out (> 4x the window)
  const spike = share >= 50 && best.count >= 4 && spread > windowDays * 4
  const fmt = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  return {
    checked: true, datedReviews: ts.length, spike, windowDays, sharePercent: share,
    peak: { from: best.from, to: best.to, count: best.count },
    note: spike
      ? `${best.count} of the ${ts.length} reviews shown were posted within ${windowDays} days (${fmt(best.from)} – ${fmt(best.to)}). A burst like this often means a review push.`
      : `Review dates look spread out (${ts.length} dated reviews over ${Math.round(spread)} days).`,
  }
}
