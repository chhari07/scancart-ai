// priceVerdict.js — "Is this a good price?" from the prices ScanCart has seen on this listing.
// The SAME file lives in backend/utils/ and extension/src/utils/ (a test checks they match),
// so the shared history (backend) and this-browser history (extension) always give the same answer.
//
// verdict (what the user sees)          status (older field, kept for the Android bubble + old builds)
//   good_deal      ≤ 90-day lowest + 3%          new_low (below every earlier price) or usual
//   fair           none of the others             usual
//   wait           ≥ 30-day lowest + 5%           above_usual (> average + 5%) or usual
//   fake_discount  "≥20% off" but the real saving is tiny, or the price / MRP was raised
//                  in the 14 days before the sale and the real saving is under half the claim   fake_sale
//   not_enough_history  fewer than 3 earlier prices, or under 2 days of them

const DAY = 864e5
const rs = (v) => '₹' + Math.round(v).toLocaleString('en-IN')
const avg = (a) => Math.round(a.reduce((s, v) => s + v, 0) / a.length)

export function summarise(points) {
  const pts = (points || []).filter(p => p.price > 0)
  if (!pts.length) return null
  const prices = pts.map(p => p.price)
  return {
    low: Math.min(...prices), high: Math.max(...prices), avg: avg(prices),
    count: prices.length, firstSeen: pts[0].t, lastSeen: pts[pts.length - 1].t,
    daysTracked: Math.max(1, Math.round((pts[pts.length - 1].t - pts[0].t) / DAY)),
  }
}

const daysAgo = (n) => n <= 0 ? 'earlier today' : n === 1 ? 'yesterday' : `${n} days ago`

/**
 * @param points  earlier prices on this listing: [{ t, price, mrp? }]
 * @param price   today's price on the page
 * @param mrp     the "was" price shown on the page (0 if none)
 */
export function priceVerdict(points, { price, mrp = 0, now = Date.now() } = {}) {
  price = Number(price) || 0; mrp = Number(mrp) || 0
  const before = (points || []).filter(p => p.price > 0 && p.t < now - 60e3).sort((a, b) => a.t - b.t)
  const sum = summarise(before)
  if (!sum || sum.count < 3 || sum.daysTracked < 2 || !(price > 0)) {
    return { status: 'not_enough_history', verdict: 'not_enough_history', title: 'Price history is just starting',
      message: 'ScanCart has not seen this listing often enough yet to judge the price. It saves the price on every visit, so this fills in over the coming days.',
      readings: sum?.count || 0, history: sum }
  }

  const claimed = mrp > price ? Math.round((mrp - price) / mrp * 100) : null
  // Usual price BEFORE any pre-sale raise: prices older than 14 days when there are enough of them
  const older = before.filter(p => p.t < now - 14 * DAY), recent = before.filter(p => p.t >= now - 14 * DAY)
  const baseline = older.length >= 2 ? avg(older.map(p => p.price)) : sum.avg
  const realSavingAmount = Math.max(0, baseline - price)
  const realSavingPercent = Math.round(realSavingAmount / baseline * 100)
  const priceRaised = older.length >= 2 && recent.length > 0 && Math.max(...recent.map(p => p.price)) >= baseline * 1.10
  const mrps = before.filter(p => p.mrp > 0)
  const mrpRaisedFrom = mrps.length && mrp >= mrps[0].mrp * 1.10 ? mrps[0].mrp : null
  const raisedAt = mrpRaisedFrom ? (mrps.find(p => p.mrp >= mrpRaisedFrom * 1.10)?.t ?? now) : null
  const mrpRaised = mrpRaisedFrom != null && now - raisedAt <= 14 * DAY

  const base = { claimedDiscountPercent: claimed, realSavingPercent, realSavingAmount, usualPrice: baseline,
    vsLowPercent: Math.round((sum.low - price) / sum.low * 100), vsAvgPercent: Math.round((sum.avg - price) / sum.avg * 100),
    readings: sum.count, history: sum }

  // 1 · fake discount
  if (claimed != null && claimed >= 20 && (realSavingPercent < 5 || ((priceRaised || mrpRaised) && realSavingPercent < claimed / 2))) {
    const why = mrpRaised ? `The MRP was raised from ${rs(mrpRaisedFrom)} to ${rs(mrp)} just before this sale.`
      : priceRaised ? `The price went up in the 2 weeks before this sale.`
      : `This listing has sold near ${rs(baseline)} for ${sum.daysTracked} days.`
    return { ...base, status: 'fake_sale', verdict: 'fake_discount', title: `"${claimed}% off" is not real`, mrpRaisedFrom: mrpRaised ? mrpRaisedFrom : null,
      message: `${why} Against the usual price you save ${realSavingAmount ? `only ${realSavingPercent}% (${rs(realSavingAmount)})` : 'nothing'}.` }
  }
  // 2 · good deal
  if (price <= sum.low * 1.03) {
    const lowest = price <= sum.low
    return { ...base, status: price < sum.low ? 'new_low' : 'usual', verdict: 'good_deal',
      title: lowest ? `Lowest price in ${sum.daysTracked} days` : 'Close to the lowest price',
      message: lowest ? `${rs(price)} is the lowest ScanCart has seen on this listing in ${sum.daysTracked} days.`
        : `Only ${rs(price - sum.low)} above the lowest ScanCart has seen (${rs(sum.low)}) in ${sum.daysTracked} days.` }
  }
  // 3 · wait
  const last30 = before.filter(p => p.t >= now - 30 * DAY)
  const low30 = last30.length ? last30.reduce((a, b) => b.price <= a.price ? b : a) : null
  if (low30 && price >= low30.price * 1.05) {
    const n = Math.round((now - low30.t) / DAY)
    const drops = before.filter((p, i) => i && p.price < before[i - 1].price).length
    return { ...base, status: price > sum.avg * 1.05 ? 'above_usual' : 'usual', verdict: 'wait',
      wasPrice: low30.price, wasDaysAgo: n, drops,
      title: `It was ${rs(low30.price)} ${daysAgo(n)}`,
      message: `Today's price is ${rs(price - low30.price)} higher.${drops ? ` It has dropped ${drops} time${drops > 1 ? 's' : ''} since ScanCart started tracking it.` : ''} Set an alert and buy when it comes back down.` }
  }
  // 4 · fair
  return { ...base, status: 'usual', verdict: 'fair', title: 'Normal price for this product',
    message: `${rs(price)} is close to its usual price (${rs(sum.low)}–${rs(sum.high)} over ${sum.daysTracked} days).` }
}
