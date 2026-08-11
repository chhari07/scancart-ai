// src/popup/views/LoginView.jsx
import logoUrl from '/scancart-logo.png'

const FEATURES = [
  { color: '#00D4FF', text: 'Detect fake reviews instantly' },
  { color: '#00FF88', text: 'Verify seller authenticity' },
  { color: '#FFD600', text: 'Compare prices across platforms' },
  { color: '#FF8C00', text: 'Get smarter alternatives' },
]

export function LoginView({ onLogin }) {
  return (
    <div className="sc-login-wrap">
      <div className="sc-login-icon">
        <img src={logoUrl} alt="ScanCart" style={{ width: 38, height: 38, objectFit: 'contain', borderRadius: 8 }} />
      </div>
      <h2 className="sc-login-h">Welcome to ScanCart.ai</h2>
      <p className="sc-login-sub">
        Sign in to protect yourself from fake products and inflated prices on Indian e-commerce.
      </p>
      <ul className="sc-login-bullets">
        {FEATURES.map(f => (
          <li key={f.text}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, flexShrink: 0, display: 'inline-block' }} />
            {f.text}
          </li>
        ))}
      </ul>
      <button className="sc-login-btn" onClick={onLogin}>
        Sign In / Create Account
      </button>
    </div>
  )
}
