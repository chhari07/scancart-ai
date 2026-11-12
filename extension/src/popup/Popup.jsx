// src/popup/Popup.jsx
// State machine: loading → login → ready | not-product → scanning → results
import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useScan } from '../hooks/useScan'
import { LoginView      } from './views/LoginView'
import { ReadyView      } from './views/ReadyView'
import { NotProductView } from './views/NotProductView'
import { ScanningView   } from './views/ScanningView'
import { ResultsView    } from './views/ResultsView'
import { WatchesView    } from './views/WatchesView'
import { Bell } from 'lucide-react'
import { PLATFORM_NAMES, WEBSITE_URL } from '../utils/constants'
import logoUrl from '/scancart-logo.png'
import './Popup.css'

export default function Popup() {
  const [appState, setAppState] = useState('loading')   // loading | login | ready | scanning | results | watches
  const [prevState, setPrevState] = useState('ready')
  const [platform, setPlatform] = useState(null)
  const [product, setProduct]   = useState(null)        // what the content script read from the page
  const { scanning, results, stageIndex, error, scan, reset } = useScan()

  useEffect(() => {
    async function init() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const plat  = detectPlatformFromUrl(tab?.url || '')
        setPlatform(plat)
        if (plat && tab?.id != null) readProduct(tab.id).then(setProduct)

        const stored = await chrome.storage.local.get('scancart_user')
        setAppState(stored.scancart_user ? 'ready' : 'login')
      } catch {
        setAppState('ready')    // fallback: show ready state, skip auth gate
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (scanning) setAppState('scanning')
    else if (results) setAppState('results')
    else if (appState === 'scanning') setAppState('ready')
  }, [scanning, results])

  const openSite = path => chrome.tabs.create({ url: `${WEBSITE_URL}${path}` })
  const handleReset = () => { reset(); setAppState('ready') }

  const platformName = PLATFORM_NAMES[platform] || null

  return (
    <div className="sc-popup">
      {appState !== 'loading' && (
        <div className="sc-header">
          <div className="sc-logo">
            <img src={logoUrl} alt="ScanCart.ai" />
          </div>
          <div className="sc-row" style={{ gap: 6 }}>
            {platformName && appState !== 'login' && (
              <span className="sc-pill blue">{platformName}</span>
            )}
            {appState !== 'watches' && appState !== 'scanning' && (
              <button className="sc-icon-btn" title="Price watches" aria-label="Price watches" onClick={() => { setPrevState(appState); setAppState('watches') }}><Bell size={15} /></button>
            )}
          </div>
        </div>
      )}

      {appState === 'loading' && (
        <div className="sc-loading"><Loader2 size={26} color="#2563EB" className="sc-spin" /></div>
      )}

      {appState === 'login' && (
        <div className="sc-body"><LoginView onLogin={() => openSite('/sign-in')} onSignup={() => openSite('/sign-up')} /></div>
      )}

      {appState === 'ready' && (
        <div className="sc-body">
          {platform
            ? <ReadyView platform={platform} product={product} onScan={scan} error={error} />
            : <NotProductView />}
        </div>
      )}

      {appState === 'scanning' && (
        <div className="sc-body"><ScanningView stageIndex={stageIndex} product={product} platform={platform} /></div>
      )}

      {appState === 'watches' && (
        <div className="sc-body"><WatchesView onBack={() => setAppState(prevState === 'results' && !results ? 'ready' : prevState)} /></div>
      )}

      {appState === 'results' && results && (
        <ResultsView results={results} onReset={handleReset} onDashboard={() => openSite('/dashboard')} />
      )}
    </div>
  )
}

// Ask the content script for the product it read; resolves null if it is not there.
function readProduct(tabId) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 1500)
    try {
      chrome.tabs.sendMessage(tabId, { type: 'GET_PRODUCT_DATA' }, data => {
        clearTimeout(timer)
        resolve(chrome.runtime.lastError ? null : data || null)
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
}

function detectPlatformFromUrl(url = '') {
  if (/amazon\.(in|com).*(\/dp\/|\/gp\/)/.test(url)) return 'amazon'
  if (/flipkart\.com.*\/p\//.test(url))               return 'flipkart'
  if (/myntra\.com.*\/buy/.test(url))                 return 'myntra'
  if (/nykaa\.com.*\/p\//.test(url))                  return 'nykaa'
  if (/meesho\.com.*\/p\//.test(url))                 return 'meesho'
  return null
}
