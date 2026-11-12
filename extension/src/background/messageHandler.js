// src/background/messageHandler.js
import { BACKEND_URL, ALLOWED_PATHS, postToBackend } from '../services/backendClient'
import { checkWatchesNow } from './watchChecker'

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Backend calls from the in-page panel. Shopping pages can't call the backend
  // themselves (page CORS + Chrome's local-network checks), so the worker does it.
  if (msg.type === 'SCANCART_API') {
    const okPath = typeof msg.path === 'string' && ALLOWED_PATHS.some(p => msg.path === p || msg.path.startsWith(p + '/'))
    if (!okPath) {
      reply({ ok: false, error: 'Not allowed' })
      return false
    }
    postToBackend(msg.path, msg.body, msg.timeoutMs)
      .then(data => reply({ ok: true, data }))
      .catch(e => reply({ ok: false, status: e.status, error: e.message || `Could not reach ${BACKEND_URL}` }))
    return true   // reply comes later
  }

  if (msg.type === 'SCANCART_CHECK_WATCHES') {
    checkWatchesNow({ notify: true }).then(r => reply({ ok: true, ...r })).catch(e => reply({ ok: false, error: e.message }))
    return true
  }

  if (msg.type === 'OPEN_POPUP') {
    // Flash badge to tell user to click extension icon
    chrome.action.setBadgeText({ text: '!', tabId: sender.tab?.id })
    chrome.action.setBadgeBackgroundColor({ color: '#534AB7' })
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
  }

  if (msg.type === 'PRODUCT_DETECTED') {
    if (sender.tab?.id && msg.data) {
      chrome.storage.local.set({ [`scancart_product_${sender.tab.id}`]: msg.data })
    }
  }

  // Quick trust score from the page-load badge → show it on the toolbar icon too
  if (msg.type === 'SCANCART_QUICK_SCORE' && sender.tab?.id != null && typeof msg.score === 'number') {
    const color = msg.score >= 70 ? '#16A34A' : msg.score >= 45 ? '#F59E0B' : '#DC2626'
    chrome.action.setBadgeText({ text: String(msg.score), tabId: sender.tab.id })
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id })
  }

  reply({ received: true })
  return true
})
