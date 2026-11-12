// src/services/priceWatch.js
// Price watches. Kept in chrome.storage (works offline) and mirrored to the backend
// (/api/watch) so the website and the phone app can show them later.
import { STORAGE_KEYS } from '../utils/constants'
import { callBackend, getFromBackend, deleteFromBackend } from './backendClient'

const WATCHES = 'scancart_watches'
const INSTALL = 'scancart_install_id'

/** Signed-in user id, or a random id made once per install (no personal data). */
export async function getOwnerId() {
  const s = await chrome.storage.local.get([STORAGE_KEYS.USER, INSTALL])
  if (s[STORAGE_KEYS.USER]?.id) return String(s[STORAGE_KEYS.USER].id)
  if (s[INSTALL]) return s[INSTALL]
  const id = 'install_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  await chrome.storage.local.set({ [INSTALL]: id })
  return id
}

export async function listWatches() {
  return (await chrome.storage.local.get(WATCHES))[WATCHES] || []
}
async function saveWatches(list) { await chrome.storage.local.set({ [WATCHES]: list }) }

export async function findWatch(url) {
  const key = canonical(url)
  return (await listWatches()).find(w => canonical(w.url) === key) || null
}

/** product = { url, productName, platform, price, image } */
export async function addWatch(product, targetPrice) {
  const ownerId = await getOwnerId()
  const body = { ownerId, url: product.url, productName: product.productName || undefined, platform: product.platform || undefined,
    currentPrice: product.price, ...(targetPrice > 0 ? { targetPrice } : {}) }
  let remote = null
  try { remote = (await callBackend('/api/watch', body, 8000))?.watch } catch { /* offline: keep it local, sync later */ }
  const w = {
    id: remote?.id || 'local_' + canonical(product.url).replace(/\W/g, '').slice(-24),
    synced: Boolean(remote),
    url: product.url, productName: product.productName || 'Product', platform: product.platform || null, image: product.image || null,
    targetPrice: targetPrice > 0 ? targetPrice : null,
    startPrice: product.price, lastPrice: product.price, lowestSeen: product.price,
    createdAt: Date.now(), lastChecked: Date.now(), lastStatus: 'ok',
  }
  const list = (await listWatches()).filter(x => canonical(x.url) !== canonical(w.url))
  await saveWatches([w, ...list].slice(0, 50))
  return w
}

export async function removeWatch(id) {
  const list = await listWatches()
  await saveWatches(list.filter(w => w.id !== id))
  if (!id.startsWith('local_')) {
    try { await deleteFromBackend(`/api/watch/${id}?ownerId=${encodeURIComponent(await getOwnerId())}`) } catch { /* ignore */ }
  }
}

export async function updateWatch(id, patch) {
  const list = await listWatches()
  const i = list.findIndex(w => w.id === id)
  if (i < 0) return null
  list[i] = { ...list[i], ...patch }
  await saveWatches(list)
  return list[i]
}

export async function remoteWatches() {
  return (await getFromBackend(`/api/watch?ownerId=${encodeURIComponent(await getOwnerId())}`))?.watches || []
}

export function canonical(url) {
  try {
    const u = new URL(url)
    const asin = u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]
    if (asin) return `${u.hostname.replace(/^www\./, '')}/dp/${asin.toUpperCase()}`
    const pid = u.searchParams.get('pid')
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}${pid ? `?pid=${pid}` : ''}`
  } catch { return String(url || '') }
}
