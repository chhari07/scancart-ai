// src/hooks/useScan.js
import { useState, useCallback } from 'react'
import { analyzeProduct } from '../services/aiAnalysis'
import { SCAN_STAGES } from '../utils/constants'

// Ask the page's ScanCart script for the product it read.
function askPage(tabId, ms = 2500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    try {
      chrome.tabs.sendMessage(tabId, { type: 'GET_PRODUCT_DATA' }, (data) => {
        clearTimeout(timer)
        resolve(chrome.runtime.lastError ? null : data || null)
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
}

// Tabs opened before the extension was installed or reloaded have no ScanCart script.
// Put it in now instead of making the user refresh.
async function injectPageScript(tabId) {
  try {
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js || []
    if (!files.length) return false
    await chrome.scripting.executeScript({ target: { tabId }, files })
    await new Promise(r => setTimeout(r, 1200))
    return true
  } catch { return false }
}

function friendly(e) {
  if (e?.status === 422) return "This page didn't show enough product details (price, rating, reviews or seller) to check."
  if (e?.status === 400) return 'The scan request was not accepted. Refresh the product page and try again.'
  if (e?.status === 429) return 'Too many scans in a short time. Wait a few minutes and try again.'
  if (e?.status >= 500) return 'The scan service had a problem. Try again in a moment.'
  if (e?.name === 'TimeoutError' || /timed? ?out/i.test(e?.message || '')) return 'The scan took too long. Try again.'
  if (/fetch|network|Failed to/i.test(e?.message || '')) return "Can't reach the ScanCart server. Is the backend running?"
  return e?.message || 'Scan failed. Please try again.'
}

export function useScan() {
  const [scanning, setScanning] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [stageIndex, setStageIndex] = useState(0)
  const [stage, setStage] = useState(SCAN_STAGES[0].label)

  const scan = useCallback(async () => {
    setScanning(true)
    setResults(null)
    setError(null)
    setStageIndex(0)
    setStage(SCAN_STAGES[0].label)

    const stopStages = startStageAnimation(setStageIndex, setStage)

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const url = tab?.url
      if (!url) throw new Error('Could not get page URL. Please try again.')

      let productData = await askPage(tab.id)
      if (!productData && await injectPageScript(tab.id)) productData = await askPage(tab.id)
      if (!productData) throw new Error('ScanCart could not read this page. Refresh the product page and scan again.')

      const result = await analyzeProduct(url, productData)
      stopStages()
      // keep what was scanned so "Find cheaper options" can ask the backend later
      setResults({ ...result, scanInput: { url, productData } })
    } catch (e) {
      stopStages()
      setError(friendly(e))
    } finally {
      setScanning(false)
    }
  }, [])

  const reset = useCallback(() => {
    setResults(null)
    setError(null)
    setScanning(false)
    setStageIndex(0)
    setStage(SCAN_STAGES[0].label)
  }, [])

  return { scanning, results, stage, stageIndex, error, scan, reset }
}

function startStageAnimation(setStageIndex, setStage) {
  const timeouts = []
  let cumulative = 0
  SCAN_STAGES.forEach((s, i) => {
    const t = setTimeout(() => {
      setStageIndex(i)
      setStage(s.label)
    }, cumulative)
    timeouts.push(t)
    cumulative += s.duration
  })
  return () => timeouts.forEach(clearTimeout)
}
