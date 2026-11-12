// src/popup/views/LoginView.jsx — board frame 01
import { ShieldCheck, IndianRupee, Store, Scale, LogIn } from 'lucide-react'

const FEATURES = [
  { Icon: ShieldCheck, label: 'Fake reviews', color: '#16A34A' },
  { Icon: IndianRupee, label: 'Fake sales',   color: '#2563EB' },
  { Icon: Store,       label: 'Seller check', color: '#2563EB' },
  { Icon: Scale,       label: 'Listing rules', color: '#B45309' },
]

export function LoginView({ onLogin, onSignup }) {
  return (
    <>
      <div className="sc-hero-card">
        <h1 className="sc-headline">
          Shop Smarter.<br />
          <span className="g">Trust </span><span className="y">Every </span><span className="b">Purchase.</span>
        </h1>
        <p className="sc-small sc-muted" style={{ marginTop: 8, lineHeight: 1.5 }}>
          ScanCart checks reviews, seller, price and listing details before you click Buy.
        </p>
        <div className="sc-feature-grid">
          {FEATURES.map(({ Icon, label, color }) => (
            <div key={label} className="sc-feature">
              <Icon size={16} color={color} strokeWidth={2.2} />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="sc-center" style={{ marginTop: 6 }}>
        <div className="sc-h2">Sign in to start scanning</div>
        <p className="sc-small sc-muted" style={{ marginTop: 4 }}>Opens scancart.ai in a new tab.</p>
      </div>

      <button className="sc-btn primary block" onClick={onLogin}>
        <LogIn size={16} /> Sign in
      </button>
      <p className="sc-footnote">
        New here? <a href="#" onClick={e => { e.preventDefault(); onSignup() }} style={{ color: '#2563EB', fontWeight: 700 }}>Create a free account</a>
      </p>
    </>
  )
}
