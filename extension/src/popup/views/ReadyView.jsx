// src/popup/views/ReadyView.jsx — "Product found"
// The on-page panel is the main ScanCart view. The popup shows what the page already
// knows (same score as the orange button + toolbar badge) and hands every check to the panel.
import { Check, ShieldCheck, Search, Store, IndianRupee, Lightbulb, ChevronRight, ExternalLink } from 'lucide-react'
import { ProductRow } from './ProductRow'

// The same 5 checks, same words, as the on-page panel (content/injectButton.js OPTS)
export const OPTIONS = [
  { key: 'summary',      Icon: ShieldCheck, title: 'Is it safe to buy?',    sub: 'Trust score + top reasons',              bg: '#DCFCE7', c: '#16A34A' },
  { key: 'reviews',      Icon: Search,      title: 'Fake reviews',          sub: 'Fake, bot and real reviews',             bg: '#F3E8FF', c: '#7C3AED' },
  { key: 'seller',       Icon: Store,       title: 'Seller trust',          sub: 'Seller history and trust tier',          bg: '#DBEAFE', c: '#2563EB' },
  { key: 'price',        Icon: IndianRupee, title: 'Real price & discount', sub: 'Fake sale check, price on other stores', bg: '#CFFAFE', c: '#0891B2' },
  { key: 'alternatives', Icon: Lightbulb,   title: 'Cheaper options',       sub: 'Optional · takes 10–30 s',               bg: '#FEF9C3', c: '#CA8A04' },
]

// Same thresholds and words as the orange button on the page
export const verdict = s => s >= 70 ? ['green', 'Safe to buy'] : s >= 45 ? ['amber', 'Buy with caution'] : ['red', 'Do not buy']

export const ratingLine = p => {
  const bits = []
  if (p?.rating) bits.push(`${Number(p.rating).toFixed(1)} ★`)
  const n = p?.numRatings || p?.reviewCount
  if (n) bits.push(`${Number(n).toLocaleString('en-IN')} ratings`)
  return bits.length ? bits.join(' · ') : null
}

function ScoreCard({ status, onOpen }) {
  const full = typeof status?.full === 'number'
  const score = full ? status.full : status?.quick?.trustScore
  if (typeof score !== 'number') return null
  const [tone, words] = verdict(score)
  const fakeSale = !full && status.quick?.discount === 'fake_sale'
  return (
    <div className={`sc-card sc-score ${tone}`}>
      <div className="sc-score-num">{score}</div>
      <div className="sc-grow">
        <div className="sc-score-words">{fakeSale ? 'Sale looks fake' : words}</div>
        <div className="sc-list-sub">{full ? 'Full scan on this page' : 'Quick check from page data · no AI yet'}</div>
      </div>
      <button className="sc-btn sm" onClick={() => onOpen('summary')}>
        {full ? 'See details' : 'Full check'} <ExternalLink size={13} />
      </button>
    </div>
  )
}

export function ReadyView({ platform, product, status, onOpen, error }) {
  const sub = [product?.seller ? `Sold by ${product.seller}` : null, ratingLine(product)].filter(Boolean).join(' · ') || null
  const hasScore = typeof status?.full === 'number' || typeof status?.quick?.trustScore === 'number'
  return (
    <>
      <span className="sc-pill green" style={{ alignSelf: 'flex-start' }}>
        <Check size={12} strokeWidth={3} /> Product page detected
      </span>

      <ProductRow name={product?.productName} price={product?.price} platform={platform} image={product?.image} sub={sub} />

      <ScoreCard status={status} onOpen={onOpen} />

      <div className="sc-caps" style={{ marginTop: 2 }}>What do you want to check?</div>
      <div className="sc-card sc-list">
        {OPTIONS.map(({ key, Icon, title, sub, bg, c }) => (
          <button key={key} className="sc-list-item sc-opt" onClick={() => onOpen(key)}>
            <div className="sc-tile" style={{ background: bg }}><Icon size={15} color={c} strokeWidth={2.2} /></div>
            <div className="sc-grow">
              <div className="sc-list-title">{title}</div>
              <div className="sc-list-sub">{sub}</div>
            </div>
            <ChevronRight size={16} color="#94A3B8" />
          </button>
        ))}
      </div>

      {error && <div className="sc-error">{error}</div>}

      {!hasScore && (
        <button className="sc-btn primary block" onClick={() => onOpen('summary')}>
          <ShieldCheck size={16} /> Check this product
        </button>
      )}
      <p className="sc-footnote">Results open in the ScanCart panel on the product page</p>
    </>
  )
}
