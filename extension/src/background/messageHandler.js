// src/background/messageHandler.js
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
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
