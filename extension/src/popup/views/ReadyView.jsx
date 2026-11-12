// src/popup/views/ReadyView.jsx — board frame 02 "Product found"
import { Check, Zap, MessageSquare, Star, Store, IndianRupee, BadgeCheck, Scale } from 'lucide-react'
import { ProductRow } from './ProductRow'

// The 6 checks that really run in a scan (orchestrator.js). Alternatives load on demand.
export const CHECKS = [
  { Icon: MessageSquare, title: 'Review Engine',     sub: 'Fake, bot and real reviews',          bg: '#F3E8FF', c: '#7C3AED' },
  { Icon: Star,              title: 'Rating Engine',     sub: 'Is the rating in a healthy range?',   bg: '#FEF9C3', c: '#CA8A04' },
  { Icon: Store,             title: 'Seller Shield',     sub: 'Seller history and trust tier',       bg: '#DBEAFE', c: '#2563EB' },
  { Icon: IndianRupee,       title: 'Price Piggy',       sub: 'Real discount? Price on other stores', bg: '#DCFCE7', c: '#16A34A' },
  { Icon: BadgeCheck,        title: 'Quality Star',      sub: 'Counterfeit risk and warranty',       bg: '#FFEDD5', c: '#EA580C' },
  { Icon: Scale,             title: 'Compliance Engine', sub: 'Listing vs Indian e-commerce rules',  bg: '#CFFAFE', c: '#0891B2' },
]

export function ReadyView({ platform, product, onScan, error }) {
  return (
    <>
      <span className="sc-pill green" style={{ alignSelf: 'flex-start' }}>
        <Check size={12} strokeWidth={3} /> Product page detected
      </span>

      <ProductRow
        name={product?.productName}
        price={product?.price}
        platform={platform}
        image={product?.image}
        sub={product?.rating ? `${product.rating} ★ · ${Number(product.numRatings || 0).toLocaleString('en-IN')} ratings` : null}
      />

      <div className="sc-caps" style={{ marginTop: 2 }}>What ScanCart checks</div>
      <div className="sc-card sc-list">
        {CHECKS.map(({ Icon, title, sub, bg, c }) => (
          <div key={title} className="sc-list-item">
            <div className="sc-tile" style={{ background: bg }}><Icon size={15} color={c} strokeWidth={2.2} /></div>
            <div>
              <div className="sc-list-title">{title}</div>
              <div className="sc-list-sub">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="sc-error">{error}</div>}

      <button className="sc-btn primary block" onClick={onScan}>
        <Zap size={16} fill="#fff" /> Scan this product
      </button>
      <p className="sc-footnote">Takes a few seconds · cheaper options are optional after the scan</p>
    </>
  )
}
