// src/popup/views/ResultsView.jsx — board frames 04–10
// Overview · Reviews · Seller · Price · Alts. Every number shown comes from the scan result;
// anything a check could not measure is shown as "n/a", never filled in.
import { useState } from 'react'
import {
  Check, X, AlertTriangle, Minus, ShieldCheck, ShieldAlert, ExternalLink, ArrowRight,
  Store, Info, TrendingDown, Lightbulb, Loader2, RotateCcw, MapPin, Search, Scale, MessageSquare,
} from 'lucide-react'
import { getTrustLevel, PLATFORM_NAMES } from '../../utils/constants'
import { fetchAlternatives } from '../../services/aiAnalysis'
import { rupees } from './ProductRow'

const TABS = [['overview', 'Overview'], ['reviews', 'Reviews'], ['seller', 'Seller'], ['price', 'Price'], ['alts', 'Alts']]
const plat = p => PLATFORM_NAMES[p] || PLATFORM_NAMES[String(p || '').toLowerCase()] || (p ? String(p).charAt(0).toUpperCase() + String(p).slice(1) : 'store')
const isNum = v => typeof v === 'number' && !Number.isNaN(v)
const open = url => url && url !== '#' && window.open(url, '_blank', 'noopener')

// Same thresholds as the backend's Overall Verdict (orchestrator.js)
function verdictOf(score) {
  if (score >= 70) return { tone: 'safe',    title: 'Safe to buy',      color: '#16A34A', pill: 'green', Icon: ShieldCheck }
  if (score >= 45) return { tone: 'caution', title: 'Buy with caution', color: '#F59E0B', pill: 'amber', Icon: ShieldAlert }
  return               { tone: 'avoid',   title: 'Do not buy',       color: '#DC2626', pill: 'red',   Icon: ShieldAlert }
}

export function ResultsView({ results, onReset, onDashboard }) {
  const [tab, setTab] = useState('overview')
  const r = results

  return (
    <div className="sc-body">
      {r.isDemo && <div className="sc-demo-banner">Demo mode: sample data, not a real scan of this page</div>}

      <div className="sc-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`sc-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview r={r} goTab={setTab} />}
      {tab === 'reviews'  && <Reviews r={r} />}
      {tab === 'seller'   && <Seller r={r} />}
      {tab === 'price'    && <Price r={r} />}
      {tab === 'alts'     && <LazyAlternatives results={r} />}

      <div className="sc-btns" style={{ marginTop: 2 }}>
        <button className="sc-btn ghost sm" onClick={onReset}><RotateCcw size={14} /> Scan another</button>
        <button className="sc-btn soft sm" onClick={onDashboard}><ExternalLink size={14} /> Full report</button>
      </div>
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────
function ScoreRing({ score, color, size = 92 }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (Math.max(0, Math.min(100, score)) / 100) * c} className="sc-ring-arc" />
      </svg>
      <div className="sc-ring-center">
        <span className="sc-score-num">{score}</span>
        <span style={{ fontSize: 9.5, color: '#64748B', marginTop: 2 }}>/100 trust</span>
      </div>
    </div>
  )
}

const ICONS = { ok: Check, warn: AlertTriangle, bad: X, na: Minus }
function CheckRow({ state, label, value }) {
  const Icon = ICONS[state] || Minus
  const color = { ok: '#16A34A', warn: '#B45309', bad: '#DC2626', na: '#94A3B8' }[state]
  return (
    <div className="sc-check">
      <span className={`sc-ico ${state}`}><Icon size={12} strokeWidth={3} /></span>
      {label}
      <span className="sc-check-val" style={{ color }}>{value}</span>
    </div>
  )
}

function Section({ title, right, children, style }) {
  return (
    <div className="sc-card sc-pad" style={style}>
      {(title || right) && (
        <div className="sc-between" style={{ marginBottom: 10 }}>
          <div className="sc-h3">{title}</div>{right}
        </div>
      )}
      {children}
    </div>
  )
}

function Unavailable({ what }) {
  return <div className="sc-note"><Info size={15} style={{ flexShrink: 0, marginTop: 1 }} /> The {what} check could not run for this scan, so it was left out of the Trust Score.</div>
}

const summary = (r, id) => (r.aiSummary || []).find(s => s.id === id)
const unavailable = (r, id) => summary(r, id)?.verdict === 'Check unavailable'

// ── Overview (frames 04 / 05) ───────────────────────────────────────
function Overview({ r, goTab }) {
  const v = verdictOf(r.trustScore)
  const level = getTrustLevel(r.trustScore)
  const pd = r.scanInput?.productData

  const reasons = (summary(r, 'verdict')?.points || [])
    .filter(p => !/^Trust score \d+/.test(p))
    .slice(0, 3)
    .map(p => p.replace(/^([a-z]+[A-Z][A-Za-z]*):/, (_, f) => `${readable(f)}:`))

  const checks = []
  if (isNum(r.realReviewPercent)) {
    checks.push({ label: 'Real reviews (est.)', value: `${r.realReviewPercent}%`, state: r.realReviewPercent >= 70 ? 'ok' : r.realReviewPercent >= 45 ? 'warn' : 'bad' })
  } else checks.push({ label: 'Real reviews', value: 'n/a', state: 'na' })

  if (r.sellerVerified == null) checks.push({ label: 'Seller verified', value: 'n/a', state: 'na' })
  else checks.push({ label: r.sellerVerified ? 'Seller verified' : 'Seller not verified', value: r.sellerRating ? `${Number(r.sellerRating).toFixed(1)} ★` : (r.sellerVerified ? 'Yes' : 'No'), state: r.sellerVerified ? 'ok' : 'bad' })

  const hr = r.ratingHealthyRange || {}
  if (unavailable(r, 'rating') || hr.min == null) checks.push({ label: 'Rating in healthy range', value: 'n/a', state: 'na' })
  else if (r.ratingAboveHealthyRange) checks.push({ label: 'Rating above healthy range', value: 'Too high', state: 'bad' })
  else if (r.ratingBelowHealthyRange) checks.push({ label: 'Rating below healthy range', value: 'Low', state: 'warn' })
  else checks.push({ label: 'Rating in healthy range', value: `${hr.min}–${hr.max}`, state: 'ok' })

  const risk = r.counterfeitRisk
  checks.push(risk
    ? { label: 'Counterfeit risk', value: risk.charAt(0).toUpperCase() + risk.slice(1), state: risk === 'low' ? 'ok' : risk === 'medium' ? 'warn' : 'bad' }
    : { label: 'Counterfeit risk', value: 'n/a', state: 'na' })

  const ppv = r.priorPriceVerdict
  if (ppv && ppv.discountClaimHonest === false) checks.push({ label: 'Discount claim', value: 'Not real', state: 'bad' })
  else if (ppv && ppv.discountClaimHonest === true) checks.push({ label: 'Discount claim', value: 'Looks real', state: 'ok' })
  else if (r.mrp > 0 && r.productPrice > 0 && r.mrp > r.productPrice) checks.push({ label: 'Discount claim', value: 'No history yet', state: 'na' })

  if (Array.isArray(r.complianceChecks) && r.complianceChecks.length) {
    const n = (r.complianceBreaches || []).length
    checks.push({ label: 'Listing details (Indian rules)', value: n ? `${n} missing` : 'Complete', state: n ? 'warn' : 'ok' })
  }

  const save = r.savings > 0 && r.bestPrice?.price > 0

  return (
    <>
      <div className={`sc-card sc-verdict ${v.tone}`}>
        <ScoreRing score={r.trustScore} color={v.color} />
        <div className="sc-grow">
          <span className={`sc-pill ${v.pill}`} style={{ fontSize: 10 }}><v.Icon size={11} strokeWidth={2.6} /> {level.label}</span>
          <div className="sc-verdict-title">{v.title}</div>
          <div className="sc-small sc-muted sc-ellipsis">{r.productName}</div>
          <div className="sc-small sc-muted">
            {plat(r.platform)}{r.totalReviews ? ` · ${Number(r.totalReviews).toLocaleString('en-IN')} ratings` : ''}{r.productPrice > 0 ? ` · ${rupees(r.productPrice)}` : ''}
          </div>
        </div>
      </div>

      {reasons.length > 0 && (
        <Section title="Why">
          {reasons.map((t, i) => (
            <div key={i} className="sc-reason"><span className="sc-bullet" style={{ background: v.color }} />{t}</div>
          ))}
        </Section>
      )}

      <div className="sc-card sc-checks">
        {checks.map(c => <CheckRow key={c.label} {...c} />)}
      </div>

      {save && (
        <button className="sc-strip" style={{ cursor: 'pointer', textAlign: 'left', width: '100%' }} onClick={() => goTab('price')}>
          <TrendingDown size={18} color="#16A34A" />
          <div className="sc-grow">
            <div style={{ fontSize: 12.5, fontWeight: 700 }}>Cheaper on {plat(r.bestPrice.platform)}</div>
            <div className="sc-small sc-muted">{rupees(r.bestPrice.price)}</div>
          </div>
          <span style={{ color: '#16A34A', fontWeight: 800, fontSize: 13 }}>Save {rupees(r.savings)}</span>
        </button>
      )}

      {r.checksTotal > 0 && (
        <p className="sc-footnote">
          Based on {r.checksCompleted} of {r.checksTotal} checks
          {r.scanDurationMs ? ` · ${(r.scanDurationMs / 1000).toFixed(1)} s` : ''}
          {r.checksFromBackupRules > 0 ? ` · ${r.checksFromBackupRules} used backup rules (AI unavailable)` : ''}
        </p>
      )}
    </>
  )
}

// ── Reviews (frame 07) ──────────────────────────────────────────────
function Reviews({ r }) {
  if (!isNum(r.fakeReviewPercent) && unavailable(r, 'reviews')) return <Unavailable what="review" />
  const fp = r.fakeReviewPercent || 0, bp = r.botReviewPercent || 0
  const rp = r.realReviewPercent ?? Math.max(0, 100 - fp - bp)
  const dist = r.ratingDistribution || []
  const hr = r.ratingHealthyRange || {}
  const cred = r.ratingCredibilityScore
  const found = [...(summary(r, 'reviews')?.points || []).slice(1), ...(summary(r, 'rating')?.points || []).slice(2)].slice(0, 4)

  return (
    <>
      <Section title="Who wrote the reviews?" right={<span className="sc-small sc-muted">{r.reviewTextsAnalysed ? `${r.reviewTextsAnalysed} review texts read` : 'from rating counts'}</span>}>
        <div className="sc-bar">
          <div style={{ width: `${fp}%`, background: '#DC2626' }} />
          <div style={{ width: `${bp}%`, background: '#F97316' }} />
          <div style={{ width: `${rp}%`, background: '#16A34A' }} />
        </div>
        <div className="sc-stat-grid" style={{ marginTop: 10 }}>
          {[['Fake', fp, '#DC2626'], ['Bot', bp, '#F97316'], ['Real', rp, '#16A34A']].map(([l, n, c]) => (
            <div key={l} className="sc-stat">
              <div className="sc-row sc-small sc-muted" style={{ gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}</div>
              <div className="sc-stat-num">{n}%</div>
            </div>
          ))}
        </div>
        <p className="sc-small sc-muted" style={{ marginTop: 8 }}>Estimates — signs of fake reviews, not proof.</p>
      </Section>

      {dist.length > 0 && (
        <Section title="Star rating spread" right={isNum(cred) && <span className={`sc-pill ${cred >= 70 ? 'green' : cred >= 45 ? 'amber' : 'red'}`}>Credible {cred}/100</span>}>
          {dist.map(row => (
            <div key={row.stars} className="sc-star-row">
              <span style={{ width: 22, fontWeight: 700 }}>{row.stars}<span style={{ color: '#EAB308' }}>★</span></span>
              <div className="sc-track"><div style={{ width: `${row.percent}%`, background: row.stars >= 4 ? '#2563EB' : row.stars === 3 ? '#94A3B8' : '#F97316' }} /></div>
              <span className="sc-muted" style={{ width: 30, textAlign: 'right' }}>{row.percent}%</span>
            </div>
          ))}
          <p className="sc-small sc-muted" style={{ marginTop: 8 }}>
            Spread estimated from rating data{hr.min != null ? ` · healthy range ${hr.min}–${hr.max}` : ''}
          </p>
        </Section>
      )}

      {found.length > 0 && (
        <div className="sc-note blue">
          <MessageSquare size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: 1 }} />
          <div><b>What the AI found</b>{found.map((t, i) => <div key={i} style={{ marginTop: 3 }}>{t}</div>)}</div>
        </div>
      )}
    </>
  )
}

// ── Seller (frame 08) + listing check ──────────────────────────────
const TIERS = [
  ['brand_official', 'Brand official', '#16A34A'],
  ['authorized_reseller', 'Authorized reseller', '#2563EB'],
  ['established_3p', 'Established seller', '#64748B'],
  ['new_3p', 'New seller', '#F59E0B'],
  ['suspicious', 'Suspicious', '#DC2626'],
]
const readable = f => String(f || '').replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())

function Seller({ r }) {
  const sellerDown = unavailable(r, 'seller')
  const breaches = r.complianceBreaches || []

  return (
    <>
      {sellerDown ? <Unavailable what="seller" /> : (
        <div className="sc-card sc-pad">
          <div className="sc-row">
            <div className="sc-tile" style={{ width: 40, height: 40, background: '#DBEAFE', borderRadius: 12 }}><Store size={20} color="#2563EB" /></div>
            <div className="sc-grow">
              <div className="sc-h3 sc-ellipsis">{r.sellerName && r.sellerName !== 'Unknown' ? r.sellerName : 'Unknown seller'}</div>
              <span className={`sc-pill ${r.sellerVerified ? 'green' : 'amber'}`} style={{ marginTop: 4, fontSize: 10 }}>
                {r.sellerVerified ? <><Check size={11} strokeWidth={3} /> Verified seller</> : <><AlertTriangle size={11} /> Not verified</>}
              </span>
            </div>
          </div>
          <div className="sc-stat-grid" style={{ marginTop: 12 }}>
            <div><div className="sc-stat-num" style={{ fontSize: 16 }}>{r.sellerRating ? `${Number(r.sellerRating).toFixed(1)} ★` : 'n/a'}</div><div className="sc-small sc-muted">seller rating</div></div>
            <div><div className="sc-stat-num" style={{ fontSize: 16, textTransform: 'capitalize' }}>{r.counterfeitRisk || 'n/a'}</div><div className="sc-small sc-muted">counterfeit risk</div></div>
            <div><div className="sc-stat-num" style={{ fontSize: 16 }}>{plat(r.platform)}</div><div className="sc-small sc-muted">sold on</div></div>
          </div>
          {r.locationNote && <div className="sc-note" style={{ marginTop: 10 }}><MapPin size={14} style={{ flexShrink: 0, marginTop: 1 }} />{r.locationNote}</div>}
          {(r.googleMapsUrl || r.googleSearchUrl || r.sellerProfileUrl) && (
            <div className="sc-btns" style={{ marginTop: 10 }}>
              {r.sellerProfileUrl && <button className="sc-btn ghost sm" onClick={() => open(r.sellerProfileUrl)}>Profile</button>}
              {r.googleSearchUrl && <button className="sc-btn ghost sm" onClick={() => open(r.googleSearchUrl)}><Search size={13} /> Reviews</button>}
              {r.googleMapsUrl && <button className="sc-btn ghost sm" onClick={() => open(r.googleMapsUrl)}><MapPin size={13} /> Maps</button>}
            </div>
          )}
        </div>
      )}

      {!sellerDown && (
        <Section title="Seller trust tier">
          {TIERS.map(([id, label, c]) => (
            <div key={id} className={`sc-tier${r.sellerType === id ? ' on' : ''}`}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
              {label}
              {r.sellerType === id && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#2563EB' }}>This seller</span>}
            </div>
          ))}
        </Section>
      )}

      {Array.isArray(r.complianceChecks) && r.complianceChecks.length > 0 && (
        <Section title="Listing check" right={<span className={`sc-pill ${breaches.length ? 'amber' : 'green'}`}><Scale size={11} /> {breaches.length ? `${breaches.length} missing` : 'All shown'}</span>}>
          {breaches.length === 0
            ? <div className="sc-reason"><span className="sc-bullet" style={{ background: '#16A34A' }} />The page shows the details Indian e-commerce rules ask for.</div>
            : breaches.slice(0, 5).map((b, i) => (
                <div key={i} className="sc-reason">
                  <span className="sc-bullet" style={{ background: b.severity === 'critical' || b.severity === 'high' ? '#DC2626' : '#F59E0B' }} />
                  <span><b>{readable(b.field)}:</b> {b.message}</span>
                </div>
              ))}
          <p className="sc-small sc-muted" style={{ marginTop: 10, lineHeight: 1.45 }}>
            Checks what the listing page shows. Not a government BIS / GST lookup.
          </p>
        </Section>
      )}
    </>
  )
}

// ── Price (frame 09) + fake-sale check ─────────────────────────────
function Price({ r }) {
  if (unavailable(r, 'price')) return <Unavailable what="price" />
  const bp = r.bestPrice || {}
  const cur = r.productPrice || 0
  const save = r.savings > 0 && bp.price > 0
  const ppv = r.priorPriceVerdict
  const range = r.altPriceRange
  const knob = range?.minPrice != null && range?.maxPrice > range.minPrice && cur > 0
    ? Math.max(0, Math.min(100, ((cur - range.minPrice) / (range.maxPrice - range.minPrice)) * 100))
    : null
  const priceSum = summary(r, 'price')

  return (
    <>
      {save ? (
        <div className="sc-save-card">
          <div style={{ fontSize: 12, opacity: .85 }}>You can save</div>
          <div className="sc-save-num">{rupees(r.savings)}</div>
          <div style={{ fontSize: 12, opacity: .9, marginTop: 4 }}>{r.priceDiffReason || `Lower price found on ${plat(bp.platform)}`}</div>
        </div>
      ) : (
        <div className="sc-strip blue">
          <Info size={18} color="#2563EB" />
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>{priceSum?.verdict || 'Price check done'}</div>
        </div>
      )}

      {(bp.price > 0 || cur > 0) && (
        <Section title="Price on other stores">
          {bp.price > 0 && bp.price !== cur && (
            <div className="sc-store best" onClick={() => open(bp.url)} style={{ cursor: bp.url ? 'pointer' : 'default' }}>
              <div className="sc-grow"><div style={{ fontWeight: 700 }}>{plat(bp.platform)}</div><div className="sc-small" style={{ color: '#16A34A', fontWeight: 600 }}>Best price</div></div>
              <div className="sc-price">{rupees(bp.price)}</div>
            </div>
          )}
          {cur > 0 && (
            <div className="sc-store">
              <div className="sc-grow"><div style={{ fontWeight: 700 }}>{plat(r.platform)}</div><div className="sc-small sc-muted">This page</div></div>
              <div className="sc-price">{rupees(cur)}</div>
            </div>
          )}
        </Section>
      )}

      {r.mrp > cur && cur > 0 && (
        <Section title="Is the discount real?">
          <div className="sc-small" style={{ lineHeight: 1.5 }}>
            Page says <b>{Math.round((r.mrp - cur) / r.mrp * 100)}% off</b> (MRP {rupees(r.mrp)}).
          </div>
          {ppv ? (
            <div className="sc-reason" style={{ marginTop: 8 }}>
              <span className="sc-bullet" style={{ background: ppv.discountClaimHonest === false ? '#DC2626' : '#16A34A' }} />
              <span>
                ScanCart saw this listing at {rupees(ppv.priorLow)}–{rupees(ppv.priorHigh)} over the last {ppv.windowDays} days
                ({ppv.sampleCount} checks). {ppv.discountClaimHonest === false ? 'The discount looks bigger than it really is.' : 'The discount looks real.'}
              </span>
            </div>
          ) : (
            <p className="sc-small sc-muted" style={{ marginTop: 8 }}>No price history for this listing yet, so ScanCart can't tell if the MRP was raised before the sale.</p>
          )}
        </Section>
      )}

      {knob != null && (
        <Section title="Is the price fair?">
          <div className="sc-fair"><div className="sc-fair-knob" style={{ left: `${knob}%` }} /></div>
          <div className="sc-between sc-small sc-muted"><span>{rupees(range.minPrice)}</span><span>{rupees(range.maxPrice)}</span></div>
          {range.positionNote && <p className="sc-small sc-muted" style={{ marginTop: 6 }}>{range.positionNote}</p>}
        </Section>
      )}

      {save && bp.url && bp.url !== '#' && (
        <button className="sc-btn primary block" onClick={() => open(bp.url)}><ExternalLink size={15} /> Open on {plat(bp.platform)}</button>
      )}
    </>
  )
}

// ── Alts (frame 10): nothing runs until the user taps the button ─────
// Price text never shows a guess as a fact:
//   live product page → "₹1,299" · Claude's guess → "~₹1,299 est." · search link → "Check price"
function altPriceText(alt) {
  if (alt?.price == null || alt.price <= 0) return 'Check price'
  return alt.priceIsEstimate ? `~${rupees(alt.price)} est.` : rupees(alt.price)
}

function LazyAlternatives({ results }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [data, setData]   = useState(null)
  const [err, setErr]     = useState('')

  // Demo data / older backends ship alternatives inside the scan result
  if (!results.alternativesOnDemand) return <AltList alts={results.allAlternatives} productPrice={results.productPrice} />

  const load = async () => {
    setState('loading'); setErr('')
    try {
      const r = await fetchAlternatives(results.scanInput?.url || results.url, results.scanInput?.productData || null)
      setData(r); setState('done')
    } catch (e) {
      setErr(e?.name === 'TimeoutError' ? 'This is taking too long. Try again.' : 'Could not load cheaper options. Try again.')
      setState('error')
    }
  }

  if (state === 'done') return <AltList alts={data?.allAlternatives} productPrice={results.productPrice} />

  return (
    <div className="sc-card sc-pad sc-center">
      <div className="sc-tile" style={{ width: 44, height: 44, borderRadius: 14, background: '#FEF9C3', margin: '4px auto 10px' }}><Lightbulb size={22} color="#CA8A04" /></div>
      <div className="sc-h3">Cheaper options</div>
      <p className="sc-small sc-muted" style={{ margin: '4px 0 12px', lineHeight: 1.5 }}>Looks up similar products on Amazon and Flipkart. Takes 10–30 seconds.</p>
      {state === 'error' && <div className="sc-error" style={{ marginBottom: 10 }}>{err}</div>}
      <button className="sc-btn primary block" disabled={state === 'loading'} onClick={load}>
        {state === 'loading' ? <><Loader2 size={15} className="sc-spin" /> Finding cheaper options…</> : state === 'error' ? 'Try again' : <>Find cheaper options <ArrowRight size={15} /></>}
      </button>
    </div>
  )
}

const TYPE = { budget: ['Budget', 'blue'], premium: ['Premium', 'slate'], value: ['Better value', 'blue'] }

function AltList({ alts, productPrice }) {
  const list = (alts || []).slice(0, 5)
  if (!list.length) return <div className="sc-note"><Info size={15} style={{ flexShrink: 0 }} />No cheaper options found for this product.</div>
  const checked = list.filter(a => a.verifiedAlternative).length
  const scoreColor = s => s >= 70 ? '#16A34A' : s >= 50 ? '#F59E0B' : '#DC2626'

  return (
    <>
      <div className="sc-between">
        <div className="sc-h3">{list.length} option{list.length > 1 ? 's' : ''}</div>
        <span className="sc-small sc-muted">{checked} checked on a live page</span>
      </div>
      <div>
        {list.map((a, i) => {
          const url = a.platformUrl || a.url
          const save = a.priceAnalysis?.savingsAmount || 0
          const [tl, tc] = TYPE[a.alternativeType] || TYPE.value
          const s = a.totalAlternativeScore
          return (
            <div key={i} className="sc-card sc-alt">
              <div className="sc-row" style={{ alignItems: 'flex-start' }}>
                <div className="sc-product-thumb" style={{ width: 36, height: 36 }}>
                  {a.image ? <img src={a.image} alt="" /> : <Lightbulb size={16} color="#64748B" />}
                </div>
                <div className="sc-grow">
                  <div className="sc-product-name" style={{ fontSize: 12.5 }}>{a.name}</div>
                  <div className="sc-row" style={{ gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                    {a.price > 0 && <span className={`sc-pill ${tc}`} style={{ fontSize: 10, padding: '2px 8px' }}>{tl}</span>}
                    <span className="sc-pill amber" style={{ fontSize: 10, padding: '2px 8px' }}>{plat(a.platform)}</span>
                    {a.indianBrand && <span className="sc-pill green" style={{ fontSize: 10, padding: '2px 8px' }}>Indian brand</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="sc-price" style={{ fontSize: 13.5, color: a.priceIsEstimate || !a.price ? '#64748B' : '#0F172A' }}>{altPriceText(a)}</div>
                  {save > 0 && !a.priceIsEstimate && <div className="sc-small" style={{ color: '#16A34A', fontWeight: 700 }}>Save {rupees(save)}</div>}
                </div>
              </div>
              {a.whyAlternative && <p className="sc-small sc-muted" style={{ margin: '8px 0 0', lineHeight: 1.45 }}>{a.whyAlternative}</p>}
              <div className="sc-between" style={{ marginTop: 10 }}>
                {a.verifiedAlternative && isNum(s)
                  ? <span className="sc-row" style={{ gap: 6 }}><span className="sc-score-chip" style={{ borderColor: scoreColor(s), color: scoreColor(s) }}>{Math.round(s)}</span><span className="sc-small" style={{ fontWeight: 700, color: scoreColor(s) }}>{a.overallVerdict}</span></span>
                  : <span className="sc-small sc-muted">Not checked yet — compare on the store</span>}
                {url && url !== '#' && (
                  <button className="sc-btn primary sm" style={{ height: 30 }} onClick={() => open(url)}>
                    {a.verifiedAlternative ? 'View' : 'Search'} <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {list.some(a => a.priceIsEstimate) && <p className="sc-footnote">"est." = estimated price, check it on the store</p>}
    </>
  )
}
