// src/background/background.js
import './authListener'
import './messageHandler'

chrome.runtime.onInstalled.addListener(d => {
  console.log('🛡️ ScanCart installed:', d.reason)
  if (d.reason === 'install') {
    const url = 'http://localhost:5173'
    chrome.tabs.create({ url: `${url}/?installed=true` })
  }
})

// Badge: show ✓ when on product page
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url) return
  const patterns = [
    /amazon\.(in|com).*(\/dp\/|\/gp\/)/,
    /flipkart\.com.*\/p\//,
    /myntra\.com.*\/buy/,
    /nykaa\.com.*\/p\//,
    /meesho\.com.*\/p\//,
  ]
  if (patterns.some(p => p.test(tab.url))) {
    chrome.action.setBadgeText({ text: '✓', tabId })
    chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId })
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }), 2000)
  }
})
