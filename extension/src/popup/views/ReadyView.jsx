// src/popup/views/ReadyView.jsx
import { PLATFORM_NAMES } from '../../utils/constants'

const BULLETS = [
  { color: '#00D4FF', text: 'Review authenticity check' },
  { color: '#00FF88', text: 'Seller verification' },
  { color: '#FFD600', text: 'Price comparison' },
  { color: '#FF8C00', text: 'Smart alternatives' },
]

export function ReadyView({ platform, onScan, error, scansRemaining }) {
  const platformName = PLATFORM_NAMES[platform] || (platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : null)

  return (
    <div className="sc-ready-wrap">
      {platformName && (
        <div className="sc-platform-badge">
          <span className="sc-platform-dot" />
          {platformName} Product Detected
        </div>
      )}

      <div className="sc-hero">
        <h2>Scan Before You Buy</h2>
        <p>5 AI agents analyse this product in under 6 seconds</p>
      </div>

      <ul className="sc-bullet-list">
        {BULLETS.map(b => (
          <li key={b.text}>
            <span className="sc-bullet-dot" style={{ background: b.color }} />
            {b.text}
          </li>
        ))}
      </ul>

      {error && <div className="sc-error">{error}</div>}

      <button className="sc-scan-btn" onClick={onScan}>
        Scan This Product
      </button>
      <p className="sc-meta">Results in ~6 seconds</p>
      {typeof scansRemaining === 'number' && (
        <p className="sc-scans-left">{scansRemaining} free scans remaining today</p>
      )}
    </div>
  )
}
