// src/hooks/useScan.js
import { useState, useCallback } from 'react'
import { analyzeProduct } from '../services/aiAnalysis'
import { SCAN_STAGES } from '../utils/constants'

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

      // Fetch structured product data from content script
      let productData = null
      try {
        productData = await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout')), 3000)
          chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT_DATA' }, (data) => {
            clearTimeout(timer)
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              resolve(data)
            }
          })
        })
      } catch {
        // Content script unavailable — backend will analyse URL only
      }

      const result = await analyzeProduct(url, productData)
      stopStages()
      // keep what was scanned so "Find cheaper options" can ask the backend later
      setResults({ ...result, scanInput: { url, productData } })
    } catch (e) {
      stopStages()
      setError(e.message || 'Scan failed. Please try again.')
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
