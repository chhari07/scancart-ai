// src/popup/Popup.jsx
// 5-state machine: loading → login → ready → scanning → results
import { useState, useEffect } from 'react'
import { useScan } from '../hooks/useScan'
import { LoginView    } from './views/LoginView'
import { ReadyView    } from './views/ReadyView'
import { ScanningView } from './views/ScanningView'
import { ResultsView  } from './views/ResultsView'
import logoUrl from '/scancart-logo.png'
import './Popup.css'

export default function Popup() {
  const [appState, setAppState] = useState('loading')   // loading | login | ready | scanning | results
  const [platform, setPlatform] = useState(null)
  const { scanning, results, stageIndex, error, scan, reset } = useScan()

  // ── Detect platform & auth on mount ───────────────────────────
  useEffect(() => {
    async function init() {
      try {
        // Check active tab for shopping platform
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const url   = tab?.url || ''
        const plat  = detectPlatformFromUrl(url)
        setPlatform(plat)

        // Check for stored user session
        const stored = await chrome.storage.local.get('scancart_user')
        if (stored.scancart_user) {
          setAppState('ready')
        } else {
          setAppState('login')
        }
      } catch {
        setAppState('ready')    // fallback: show ready state, skip auth gate
      }
    }
    init()
  }, [])

  // ── Mirror scanning hook into app states ──────────────────────
  useEffect(() => {
    if (scanning) setAppState('scanning')
    else if (results) setAppState('results')
    else if (appState === 'scanning') setAppState('ready')
  }, [scanning, results])

  function handleLogin() {
    const websiteUrl = import.meta.env.VITE_WEBSITE_URL || 'https://scancart.ai'
    chrome.tabs.create({ url: `${websiteUrl}/login` })
  }

  function handleReset() {
    reset()
    setAppState('ready')
  }

  function handleDashboard() {
    const websiteUrl = import.meta.env.VITE_WEBSITE_URL || 'https://scancart.ai'
    chrome.tabs.create({ url: `${websiteUrl}/dashboard` })
  }

  const showHeader = appState !== 'loading'

  return (
    <div className="sc-popup">
      {showHeader && (
        <div className="sc-header">
          <div className="sc-logo-row">
            <img src={logoUrl} alt="ScanCart" className="sc-logo-img" />
            <span className="sc-logo-text"><span>ScanCart</span>.ai</span>
          </div>
          <span className="sc-header-badge">AI-Powered</span>
        </div>
      )}

      {appState === 'loading' && (
        <div className="sc-loading-wrap">
          <div className="sc-loading-spin" />
        </div>
      )}

      {appState === 'login' && (
        <div className="sc-body">
          <LoginView onLogin={handleLogin} />
        </div>
      )}

      {appState === 'ready' && (
        <div className="sc-body">
          <ReadyView
            platform={platform}
            onScan={scan}
            error={error}
          />
        </div>
      )}

      {appState === 'scanning' && (
        <div className="sc-body">
          <ScanningView stageIndex={stageIndex} />
        </div>
      )}

      {appState === 'results' && results && (
        <ResultsView
          results={results}
          onReset={handleReset}
          onDashboard={handleDashboard}
        />
      )}
    </div>
  )
}

function detectPlatformFromUrl(url = '') {
  if (/amazon\.(in|com).*(\/dp\/|\/gp\/)/.test(url)) return 'amazon'
  if (/flipkart\.com.*\/p\//.test(url))               return 'flipkart'
  if (/myntra\.com.*\/buy/.test(url))                 return 'myntra'
  if (/nykaa\.com.*\/p\//.test(url))                  return 'nykaa'
  if (/meesho\.com.*\/p\//.test(url))                 return 'meesho'
  return null
}
