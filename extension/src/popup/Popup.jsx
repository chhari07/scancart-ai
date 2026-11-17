// src/popup/Popup.jsx
// State machine: loading → login → ready | not-product → scanning → results
import { useState, useEffect } from 'react'
import { Loader2, Moon, Sun } from 'lucide-react'
import { useScan } from '../hooks/useScan'
import { LoginView      } from './views/LoginView'
import { PanelView      } from './views/PanelView'
import { useTheme       } from './useTheme'
import { useLang        } from './useLang'
import { NotProductView } from './views/NotProductView'
import { ScanningView   } from './views/ScanningView'
import { ResultsView    } from './views/ResultsView'
import { WatchesView    } from './views/WatchesView'
import { AccountChip    } from './components/AccountChip'
import { Bell } from 'lucide-react'
import { PLATFORM_NAMES, WEBSITE_URL } from '../utils/constants'
import logoUrl from '/scancart-logo.png'
import './Popup.css'

export default function Popup() {
  const [theme, toggleTheme] = useTheme()
  const [lang, chooseLang] = useLang()
  const [appState, setAppState] = useState('loading')   // loading | login | ready | scanning | results | watches
  const [prevState, setPrevState] = useState('ready')
  const [platform, setPlatform] = useState(null)
  const [product, setProduct]   = useState(null)        // what the content script read from the page
  const [user, setUser]         = useState(null)        // signed-in user synced from the website
  const [tabId, setTabId]       = useState(null)
  const [tabUrl, setTabUrl]     = useState('')
  const [productRead, setProductRead] = useState(false)
  const [status, setStatus]     = useState(null)        // score the page already has (quick / full)
  const { scanning, results, stageIndex, error, scan, reset } = useScan()

  useEffect(() => {
    async function init() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const plat  = detectPlatformFromUrl(tab?.url || '')
        const web   = /^https?:/.test(tab?.url || '')
        // Any online shop: big stores are known by their address; any other site is asked whether it shows a product
        setPlatform(plat || (web ? 'checking' : null))
        setTabId(tab?.id ?? null)
        setTabUrl(tab?.url || '')
        if (web && tab?.id != null) {
          readProduct(tab.id).then(p => {
            setProduct(p); setProductRead(true)
            setPlatform(plat || (p && p.productName ? p.platform : null))
          })
          askTab(tab.id, { type: 'SCANCART_GET_STATUS' }).then(st => st && setStatus(st))
        }

        const stored = await chrome.storage.local.get('scancart_user')
        setUser(stored.scancart_user || null)
        setAppState(stored.scancart_user ? 'ready' : 'login')
      } catch {
        setAppState('ready')    // fallback: show ready state, skip auth gate
      }
    }
    init()
  }, [])

  // Live login status: the website writes/removes scancart_user while the popup is open
  useEffect(() => {
    const onChange = (changes, area) => {
      if (area !== 'local' || !changes.scancart_user) return
      const u = changes.scancart_user.newValue || null
      setUser(u)
      setAppState(s => (u ? (s === 'login' ? 'ready' : s) : 'login'))
    }
    chrome.storage.onChanged.addListener(onChange)
    return () => chrome.storage.onChanged.removeListener(onChange)
  }, [])

  // The page sends its score when the quick check (or a full check) finishes
  useEffect(() => {
    const onMsg = (msg, sender) => {
      if (msg?.type === 'SCANCART_STATUS' && sender.tab?.id === tabId) setStatus(msg.status)
    }
    chrome.runtime.onMessage.addListener(onMsg)
    return () => chrome.runtime.onMessage.removeListener(onMsg)
  }, [tabId])

  const signOut = async () => {
    await chrome.storage.local.remove('scancart_user')
    setUser(null); reset(); setAppState('login')
  }

  useEffect(() => {
    if (scanning) setAppState('scanning')
    else if (results) setAppState('results')
    else if (appState === 'scanning') setAppState('ready')
  }, [scanning, results])

  const openSite = path => chrome.tabs.create({ url: `${WEBSITE_URL}${path}` })
  const handleReset = () => { reset(); setAppState('ready') }

  const platformName = PLATFORM_NAMES[platform] || (platform && platform !== 'checking' ? (product?.storeName || platform[0].toUpperCase() + platform.slice(1)) : null)

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
            <div className="sc-lang" role="group" aria-label="Language">
              {[['en', 'EN'], ['hi', 'हि'], ['hinglish', 'Hing']].map(([k, l]) => <button key={k} className={k === lang ? 'on' : ''} aria-pressed={k === lang} onClick={() => chooseLang(k)}>{l}</button>)}
            </div>
            <button className="sc-icon-btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Dark mode" aria-pressed={theme === 'dark'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={15} color="#FACC15" /> : <Moon size={15} />}</button>
            {appState !== 'watches' && appState !== 'scanning' && (
              <button className="sc-icon-btn" title="Price watches" aria-label="Price watches" onClick={() => { setPrevState(appState); setAppState('watches') }}><Bell size={15} /></button>
            )}
            <AccountChip user={user} onSignIn={() => openSite('/sign-in')} onDashboard={() => openSite('/dashboard')} onSignOut={signOut} />
          </div>
        </div>
      )}

      {appState === 'loading' && (
        <div className="sc-loading"><Loader2 size={26} color="#2563EB" className="sc-spin" /></div>
      )}

      {appState === 'login' && (
        <div className="sc-body"><LoginView onLogin={() => openSite('/sign-in')} onSignup={() => openSite('/sign-up')} /></div>
      )}

      {appState === 'ready' && (platform
        ? (productRead
            ? <PanelView product={product} url={tabUrl} tabId={tabId} status={status} />
            : <div className="sc-loading"><Loader2 size={26} color="#2563EB" className="sc-spin" /></div>)
        : <div className="sc-body"><NotProductView /></div>
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

// Send one message to the page script; resolves null if it is not there.
function askTab(tabId, msg, wait = 1500) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), wait)
    try {
      chrome.tabs.sendMessage(tabId, msg, data => {
        clearTimeout(timer)
        resolve(chrome.runtime.lastError ? null : data || null)
      })
    } catch { clearTimeout(timer); resolve(null) }
  })
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
