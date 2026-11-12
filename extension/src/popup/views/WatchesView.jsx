// src/popup/views/WatchesView.jsx — v1.1: all price watches + settings
import { useEffect, useState } from 'react'
import { ArrowLeft, RefreshCw, Trash2, ExternalLink, Loader2, Bell, TrendingDown } from 'lucide-react'
import { listWatches, removeWatch } from '../../services/priceWatch'
import { rupees } from './ProductRow'

const ago = (t) => {
  if (!t) return 'never'
  const m = Math.round((Date.now() - t) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

export function WatchesView({ onBack }) {
  const [list, setList] = useState(null)
  const [checking, setChecking] = useState(false)
  const [msg, setMsg] = useState('')
  const [autoBadge, setAutoBadge] = useState(true)

  const load = () => listWatches().then(setList)
  useEffect(() => {
    load()
    chrome.storage.local.get('scancart_settings').then(s => setAutoBadge(s.scancart_settings?.autoBadge !== false))
  }, [])

  const checkNow = async () => {
    setChecking(true); setMsg('')
    const r = await chrome.runtime.sendMessage({ type: 'SCANCART_CHECK_WATCHES' }).catch(() => null)
    setChecking(false); load()
    setMsg(r?.ok ? `Checked ${r.checked}${r.failed ? ` · ${r.failed} could not be read` : ''} · ${r.alerts} alert${r.alerts === 1 ? '' : 's'}` : 'Could not check right now.')
  }
  const toggleBadge = async () => {
    const next = !autoBadge; setAutoBadge(next)
    const s = (await chrome.storage.local.get('scancart_settings')).scancart_settings || {}
    await chrome.storage.local.set({ scancart_settings: { ...s, autoBadge: next } })
  }

  return (
    <>
      <div className="sc-between">
        <button className="sc-btn ghost sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <button className="sc-btn soft sm" disabled={checking || !list?.length} onClick={checkNow}>
          {checking ? <Loader2 size={14} className="sc-spin" /> : <RefreshCw size={14} />} Check now
        </button>
      </div>
      <div className="sc-caps">Price watches</div>
      {msg && <div className="sc-note blue">{msg}</div>}

      {list === null ? <Loader2 size={20} className="sc-spin" /> : list.length === 0 ? (
        <div className="sc-card sc-pad sc-center">
          <Bell size={22} color="#2563EB" style={{ margin: '4px auto 8px', display: 'block' }} />
          <div className="sc-h3">No watches yet</div>
          <p className="sc-small sc-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>Open a product, scan it, and tap “Watch” on the Price tab.</p>
        </div>
      ) : (
        <div className="sc-card sc-list">
          {list.map(w => {
            const down = w.lastPrice < w.startPrice
            return (
              <div key={w.id} className="sc-list-item" style={{ alignItems: 'flex-start' }}>
                <div className="sc-grow" style={{ minWidth: 0 }}>
                  <div className="sc-list-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.productName}</div>
                  <div className="sc-list-sub">
                    <b style={{ color: down ? '#16A34A' : '#0F172A' }}>{rupees(w.lastPrice)}</b>
                    {down && <> <TrendingDown size={11} color="#16A34A" /> from {rupees(w.startPrice)}</>}
                    {w.targetPrice ? ` · target ${rupees(w.targetPrice)}` : ''}
                  </div>
                  <div className="sc-list-sub" style={{ color: w.lastStatus === 'ok' ? '#94A3B8' : '#B45309' }}>
                    {w.lastStatus === 'ok' ? `Checked ${ago(w.lastChecked)}` : w.lastStatus}
                  </div>
                </div>
                <button className="sc-icon-btn" title="Open" onClick={() => chrome.tabs.create({ url: w.url })}><ExternalLink size={14} /></button>
                <button className="sc-icon-btn" title="Stop watching" onClick={async () => { await removeWatch(w.id); load() }}><Trash2 size={14} /></button>
              </div>
            )
          })}
        </div>
      )}

      <div className="sc-caps" style={{ marginTop: 4 }}>Settings</div>
      <label className="sc-card sc-pad sc-between" style={{ cursor: 'pointer' }}>
        <div>
          <div className="sc-list-title">Quick score on product pages</div>
          <div className="sc-list-sub">Shows a quick Trust Score on the ScanCart button when a page opens (no AI, page data only)</div>
        </div>
        <input type="checkbox" checked={autoBadge} onChange={toggleBadge} style={{ width: 18, height: 18, accentColor: '#2563EB', flexShrink: 0 }} />
      </label>
    </>
  )
}
