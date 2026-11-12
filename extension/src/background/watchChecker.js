// src/background/watchChecker.js
// Re-checks watched products every 6 hours: fetches each product page in the browser
// (same as opening it), reads the price, saves it to ScanCart's price history and
// shows a Chrome notification when the price drops or reaches the user's target.
import { listWatches, updateWatch, getOwnerId } from '../services/priceWatch'
import { postToBackend } from '../services/backendClient'
import { priceFromHtml } from '../utils/jsonld'

export const WATCH_ALARM = 'scancart-watch-check'
const rupees = (n) => '₹' + Math.round(n).toLocaleString('en-IN')

export function scheduleWatchChecks() {
  chrome.alarms.get(WATCH_ALARM, (a) => {
    if (!a) chrome.alarms.create(WATCH_ALARM, { delayInMinutes: 1, periodInMinutes: 360 })
  })
}

async function fetchPrice(url) {
  const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000), headers: { 'Accept-Language': 'en-IN,en;q=0.9' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  if (/captcha|robot check/i.test(html.slice(0, 20000)) && html.length < 20000) throw new Error('Store asked for a captcha')
  return priceFromHtml(html)
}

/** Checks every watch once. Returns { checked, alerts, failed }. */
export async function checkWatchesNow({ notify = true } = {}) {
  const watches = await listWatches()
  const ownerId = await getOwnerId()
  const seen = []
  let failed = 0
  for (const w of watches) {
    try {
      const price = await fetchPrice(w.url)
      if (!price) throw new Error('No price found on the page')
      seen.push({ w, price })
    } catch (e) {
      failed++
      await updateWatch(w.id, { lastChecked: Date.now(), lastStatus: `Could not check: ${e.message}` })
    }
    await new Promise(r => setTimeout(r, 1500))   // be gentle with the stores
  }

  // Ask the backend (saves the prices to history); fall back to a local comparison when offline
  let remote = {}
  const syncable = seen.filter(s => !s.w.id.startsWith('local_'))
  if (syncable.length) {
    try {
      const r = await postToBackend('/api/watch/check', { ownerId, prices: syncable.map(s => ({ id: s.w.id, price: s.price })) }, 10000)
      for (const x of r.results || []) remote[x.watch.id] = x
    } catch { /* offline */ }
  }

  const alerts = []
  for (const { w, price } of seen) {
    const prev = w.lastPrice
    const hitTarget = remote[w.id]?.hitTarget ?? (w.targetPrice != null && price <= w.targetPrice && !(prev != null && prev <= w.targetPrice))
    const dropped = prev != null && price < prev
    await updateWatch(w.id, { lastPrice: price, lowestSeen: Math.min(w.lowestSeen ?? price, price), lastChecked: Date.now(), lastStatus: 'ok', previousPrice: prev })
    if (hitTarget || dropped) alerts.push({ w, price, prev, hitTarget })
  }

  if (notify) {
    for (const a of alerts) {
      chrome.notifications.create(`scancart-watch:${a.w.id}:${Date.now()}`, {
        type: 'basic', iconUrl: 'icons/icon128.png', priority: 2,
        title: a.hitTarget ? `Target price reached: ${rupees(a.price)}` : `Price dropped to ${rupees(a.price)}`,
        message: `${a.w.productName}${a.prev ? ` (was ${rupees(a.prev)})` : ''}`,
        contextMessage: 'ScanCart price watch',
      })
    }
  }
  return { checked: seen.length, alerts: alerts.length, failed }
}

chrome.alarms.onAlarm.addListener((a) => { if (a.name === WATCH_ALARM) checkWatchesNow({ notify: true }) })

chrome.notifications.onClicked.addListener(async (nid) => {
  if (!nid.startsWith('scancart-watch:')) return
  const id = nid.split(':')[1]
  const w = (await listWatches()).find(x => x.id === id)
  if (w) chrome.tabs.create({ url: w.url })
  chrome.notifications.clear(nid)
})
