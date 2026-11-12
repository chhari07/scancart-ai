// src/background/messageHandler.js
import { BACKEND_URL, postToBackend } from '../services/backendClient'

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Backend calls from the in-page panel. Shopping pages can't call the backend
  // themselves (page CORS + Chrome's local-network checks), so the worker does it.
  if (msg.type === 'SCANCART_API') {
    if (typeof msg.path !== 'string' || !msg.path.startsWith('/api/scan')) {
      reply({ ok: false, error: 'Not allowed' })
      return false
    }
    postToBackend(msg.path, msg.body, msg.timeoutMs)
      .then(data => reply({ ok: true, data }))
      .catch(e => reply({ ok: false, error: e.message || `Could not reach ${BACKEND_URL}` }))
    return true   // reply comes later
  }

  if (msg.type === 'OPEN_POPUP') {
    // Flash badge to tell user to click extension icon
    chrome.action.setBadgeText({ text: '!', tabId: sender.tab?.id })
    chrome.action.setBadgeBackgroundColor({ color: '#534AB7' })
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
  }

  if (msg.type === 'PRODUCT_DETECTED') {
    console.log('Product detected:', msg.data?.name)
    if (sender.tab?.id && msg.data) {
      chrome.storage.local.set({ [`scancart_product_${sender.tab.id}`]: msg.data })
    }
  }

  reply({ received: true })
  return true
})
