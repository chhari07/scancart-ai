// src/popup/views/NotProductView.jsx — board frame 11 "Not a product"
import { ShoppingCart, Search, Lightbulb } from 'lucide-react'

const STORES = [
  ['Amazon', '#F59E0B'], ['Flipkart', '#2563EB'], ['Myntra', '#EC4899'],
  ['Nykaa', '#DB2777'], ['Meesho', '#9333EA'],
]

export function NotProductView() {
  return (
    <>
      <div className="sc-empty-art">
        <ShoppingCart size={42} color="#2563EB" strokeWidth={2} />
        <span style={{ position: 'absolute', top: 14, right: 14, width: 26, height: 26, borderRadius: '50%', background: '#EAB308', display: 'grid', placeItems: 'center' }}>
          <Search size={13} color="#fff" strokeWidth={3} />
        </span>
      </div>
      <div className="sc-center">
        <div className="sc-h2">Open a product to scan it</div>
        <p className="sc-small sc-muted" style={{ marginTop: 6 }}>ScanCart works on product pages of these stores:</p>
      </div>
      <div className="sc-store-pills">
        {STORES.map(([name, c]) => (
          <span key={name} className="sc-pill line">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} /> {name}
          </span>
        ))}
      </div>
      <div className="sc-note yellow" style={{ marginTop: 8 }}>
        <Lightbulb size={16} color="#CA8A04" style={{ flexShrink: 0, marginTop: 1 }} />
        <div><b>Tip</b><br />On a product page, look for the blue ScanCart button to scan in one tap.</div>
      </div>
    </>
  )
}
