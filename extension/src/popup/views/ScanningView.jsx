// src/popup/views/ScanningView.jsx
import { SCAN_STAGES } from '../../utils/constants'

const CIRCUMFERENCE = 2 * Math.PI * 44 // r=44 → ≈ 276.46
const R = 44

export function ScanningView({ stageIndex }) {
  const pct = Math.round(((stageIndex + 1) / SCAN_STAGES.length) * 100)
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE

  return (
    <div className="sc-scan-wrap">
      {/* Progress ring */}
      <div className="sc-scan-ring-outer">
        <svg width="112" height="112" viewBox="0 0 112 112">
          <circle className="sc-scan-ring-bg" cx="56" cy="56" r={R} strokeWidth="6" fill="none" />
          <circle
            className="sc-scan-ring-progress"
            cx="56" cy="56" r={R}
            strokeWidth="6" fill="none"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="sc-scan-ring-label">
          <span className="sc-scan-ring-pct">{pct}%</span>
          <span className="sc-scan-ring-txt">SCANNING</span>
        </div>
      </div>

      <h2 className="sc-scan-title">Analyzing Product</h2>
      <p className="sc-scan-sub">5 AI agents running in parallel</p>

      {/* Stage timeline */}
      <div className="sc-stage-list">
        {SCAN_STAGES.map((s, i) => {
          const state = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'idle'
          return (
            <div key={s.id} className="sc-stage-item">
              <div className="sc-stage-dot-col">
                <span className={`sc-stage-dot ${state}`} />
                {i < SCAN_STAGES.length - 1 && <span className="sc-stage-connector" />}
              </div>
              <span className={`sc-stage-label ${state}`}>{s.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
