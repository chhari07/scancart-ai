// src/popup/views/ScanningView.jsx — board frame 03
import { Search, CheckCircle2, Loader2 } from 'lucide-react'
import { SCAN_STAGES } from '../../utils/constants'
import { ProductRow } from './ProductRow'

const R = 54
const C = 2 * Math.PI * R

export function ScanningView({ stageIndex, product, platform }) {
  const pct = Math.round(((stageIndex + 1) / SCAN_STAGES.length) * 100)

  return (
    <>
      {product && <ProductRow name={product.productName} price={product.price} platform={platform} image={product.image} />}

      <div className="sc-ring-wrap">
        <svg width="128" height="128" viewBox="0 0 128 128">
          <defs>
            <linearGradient id="scg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2563EB" /><stop offset="1" stopColor="#06B6D4" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={R} fill="none" stroke="#E2E8F0" strokeWidth="9" />
          <circle className="sc-ring-arc" cx="64" cy="64" r={R} fill="none" stroke="url(#scg)" strokeWidth="9"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C} />
        </svg>
        <div className="sc-ring-center">
          <Search size={24} color="#2563EB" strokeWidth={2.5} />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>{pct}%</span>
        </div>
      </div>

      <div className="sc-center">
        <div className="sc-h2">Scanning this product…</div>
        <p className="sc-small sc-muted" style={{ marginTop: 3 }}>6 AI checks are running at the same time</p>
      </div>

      <div className="sc-card" style={{ padding: '6px 0' }}>
        {SCAN_STAGES.map((s, i) => {
          const state = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'idle'
          return (
            <div key={s.id} className={`sc-stage ${state}`}>
              {state === 'done'   && <CheckCircle2 size={16} color="#fff" fill="#16A34A" />}
              {state === 'active' && <Loader2 size={16} className="sc-spin" />}
              {state === 'idle'   && <span className="sc-dot-idle" />}
              {s.label}
            </div>
          )
        })}
      </div>
    </>
  )
}
