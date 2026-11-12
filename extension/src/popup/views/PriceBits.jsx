// src/popup/views/PriceBits.jsx — v1.1: price history graph, "is the discount real?", watch price.
// Every point on the graph is a price ScanCart actually saw on this listing.
import { useEffect, useState } from 'react'
import { Bell, BellOff, Loader2, TrendingDown, AlertTriangle, Check, Info } from 'lucide-react'
import { addWatch, findWatch, removeWatch } from '../../services/priceWatch'
import { rupees } from './ProductRow'

const day = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export function PriceGraph({ points, current }) {
  const pts = (points || []).filter(p => p.price > 0)
  if (pts.length < 2) {
    return (
      <div className="sc-card sc-pad">
        <div className="sc-h3">Price history</div>
        <p className="sc-small sc-muted" style={{ marginTop: 6, lineHeight: 1.5 }}>
          {pts.length ? 'First price saved today.' : 'No prices saved yet.'} ScanCart saves the price each time this page is opened, so the graph fills in over the coming days.
        </p>
      </div>
    )
  }
  const W = 320, H = 96, pad = 6
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t
  const lo = Math.min(...pts.map(p => p.price)), hi = Math.max(...pts.map(p => p.price))
  const x = (t) => pad + (W - 2 * pad) * ((t - t0) / Math.max(1, t1 - t0))
  const y = (v) => hi === lo ? H / 2 : pad + (H - 2 * pad) * (1 - (v - lo) / (hi - lo))
  // step line: a price holds until the next one ScanCart saw
  const d = pts.map((p, i) => i ? `H${x(p.t).toFixed(1)} V${y(p.price).toFixed(1)}` : `M${x(p.t).toFixed(1)} ${y(p.price).toFixed(1)}`).join(' ') + ` H${W - pad}`
  const last = pts[pts.length - 1]
  return (
    <div className="sc-card sc-pad">
      <div className="sc-between" style={{ marginBottom: 8 }}>
        <div className="sc-h3">Price history</div>
        <span className="sc-small sc-muted">{pts.length} prices · {day(t0)} – {day(t1)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }} aria-label="Price history graph">
        <line x1="0" x2={W} y1={y(lo)} y2={y(lo)} stroke="#BBF7D0" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={x(last.t)} cy={y(last.price)} r="3.5" fill="#2563EB" />
      </svg>
      <div className="sc-between sc-small sc-muted" style={{ marginTop: 6 }}>
        <span>Low <b style={{ color: '#16A34A' }}>{rupees(lo)}</b></span>
        <span>Now <b style={{ color: '#0F172A' }}>{rupees(current || last.price)}</b></span>
        <span>High <b style={{ color: '#0F172A' }}>{rupees(hi)}</b></span>
      </div>
    </div>
  )
}

const DISCOUNT = {
  fake_sale:          { cls: 'red',   Icon: AlertTriangle, head: 'Sale looks fake' },
  new_low:            { cls: 'green', Icon: TrendingDown,  head: 'Real deal: lowest price seen' },
  usual:              { cls: 'blue',  Icon: Check,         head: 'Usual price' },
  above_usual:        { cls: 'amber', Icon: AlertTriangle, head: 'Higher than usual' },
  not_enough_history: { cls: 'blue',  Icon: Info,          head: 'Is the discount real? Not known yet' },
}
export function DiscountCard({ discount }) {
  if (!discount) return null
  const k = DISCOUNT[discount.status] || DISCOUNT.not_enough_history
  const color = { red: '#DC2626', green: '#16A34A', amber: '#B45309', blue: '#2563EB' }[k.cls]
  return (
    <div className={`sc-note ${k.cls === 'blue' ? 'blue' : ''}`} style={k.cls !== 'blue' ? { background: { red: '#FEF2F2', green: '#F0FDF4', amber: '#FFFBEB' }[k.cls], borderColor: 'transparent' } : undefined}>
      <k.Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
      <div><b style={{ color }}>{k.head}</b><div style={{ marginTop: 3 }}>{discount.message}</div></div>
    </div>
  )
}

export function WatchBox({ product }) {
  const [watch, setWatch] = useState(undefined)   // undefined = loading, null = not watching
  const [target, setTarget] = useState(product?.price ? Math.round(product.price * 0.9) : '')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (product?.url) findWatch(product.url).then(setWatch).catch(() => setWatch(null)) }, [product?.url])
  if (!product?.price || !product?.url) return null

  const add = async () => { setBusy(true); try { setWatch(await addWatch(product, Number(target) || 0)) } finally { setBusy(false) } }
  const stop = async () => { setBusy(true); try { await removeWatch(watch.id); setWatch(null) } finally { setBusy(false) } }

  return (
    <div className="sc-card sc-pad">
      <div className="sc-row" style={{ gap: 8, marginBottom: 8 }}><Bell size={16} color="#2563EB" /><div className="sc-h3">Watch this price</div></div>
      {watch === undefined ? <Loader2 size={16} className="sc-spin" /> : watch ? (
        <>
          <p className="sc-small" style={{ lineHeight: 1.5 }}>
            Watching{watch.targetPrice ? <> · alert at <b>{rupees(watch.targetPrice)}</b></> : ' · alert on any drop'}. Started at {rupees(watch.startPrice)}.
            {watch.synced === false && <span className="sc-muted"> (saved on this computer; will sync when the server is reachable)</span>}
          </p>
          <button className="sc-btn ghost sm block" style={{ marginTop: 8 }} disabled={busy} onClick={stop}><BellOff size={14} /> Stop watching</button>
        </>
      ) : (
        <>
          <div className="sc-row" style={{ gap: 8 }}>
            <input className="sc-input" type="number" min="1" inputMode="numeric" value={target} onChange={e => setTarget(e.target.value)} placeholder="Alert me at (optional)" aria-label="Target price" />
            <button className="sc-btn primary sm" disabled={busy} onClick={add}>{busy ? <Loader2 size={14} className="sc-spin" /> : 'Watch'}</button>
          </div>
          <p className="sc-small sc-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>Checks every 6 hours. You get a Chrome notification when the price drops or reaches your target.</p>
        </>
      )}
    </div>
  )
}
