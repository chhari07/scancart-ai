// src/background/background.js
import './authListener'
import './messageHandler'
import { scheduleWatchChecks } from './watchChecker'
import { getOwnerId } from '../services/priceWatch'
import { WEBSITE_URL } from '../utils/constants'

chrome.runtime.onInstalled.addListener(d => {
  console.log('🛡️ ScanCart installed:', d.reason)
  getOwnerId()            // make the anonymous install id once
  scheduleWatchChecks()
  if (d.reason === 'install') {
    chrome.tabs.create({ url: `${WEBSITE_URL}/?installed=true` })
  }
})
chrome.runtime.onStartup.addListener(scheduleWatchChecks)

// Clear the toolbar score when the tab leaves a product page
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) chrome.action.setBadgeText({ text: '', tabId })
})
