// src/popup/views/ResultsView.jsx
import { useState } from 'react'
import { getTrustLevel, PLATFORM_NAMES } from '../../utils/constants'

const CIRCUMFERENCE = 314.16 // 2π × 50
const R = 50

// ── Trust Ring ──────────────────────────────────────────────────────
function TrustRing({ score }) {
  const level  = getTrustLevel(score)
  const color  = level.color
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE
  return (
    <div className="sc-trust-wrap">
      <div className="sc-trust-ring-outer">
        <svg width="136" height="136" viewBox="0 0 136 136">
          <circle className="sc-trust-ring-bg" cx="68" cy="68" r={R} strokeWidth="8" fill="none" />
          <circle
            className="sc-trust-ring-arc" cx="68" cy="68" r={R}
            strokeWidth="8" fill="none" stroke={color}
            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={offset}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span className="sc-trust-score" style={{ color }}>{score}</span>
          <span className="sc-trust-of-100">/ 100</span>
        </div>
      </div>
      <span className="sc-trust-label" style={{ background: color + '1A', color, border: `1px solid ${color}40` }}>
        {level.label}
      </span>
    </div>
  )
}

// ── CHANGE A: Review Breakdown Card (fake + bot + real) ─────────────
function ReviewBreakdownCard({ fakePercent, botPercent, realPercent }) {
  const fp = fakePercent || 0
  const bp = botPercent  || 0
  const rp = realPercent ?? Math.max(0, 100 - fp - bp)
  const totalBadge = fp > 40 ? { color: '#FF4444', label: 'HIGH' } : fp > 20 ? { color: '#FFD600', label: 'MED' } : { color: '#00FF88', label: 'LOW' }

  return (
    <div className="sc-metric-card" style={{ gridColumn: '1 / -1' }}>
      <div className="sc-metric-top">
        <span className="sc-metric-label">Review Breakdown</span>
        <span className="sc-metric-badge" style={{ background: totalBadge.color + '1A', color: totalBadge.color }}>{totalBadge.label} RISK</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '8px 0 6px' }}>
        {[
          { color: '#FF4444', label: 'Fake',  value: fp },
          { color: '#FF8C00', label: 'Bot',   value: bp },
          { color: '#00FF88', label: 'Real',  value: rp },
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ color: '#94A3B8', width: 34 }}>{row.label}</span>
            <span style={{ color: row.color, fontWeight: 700, width: 38 }}>{row.value}%</span>
          </div>
        ))}
      </div>
      {/* Stacked colour bar */}
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: '#1F2937' }}>
        <div style={{ width: `${fp}%`, background: '#FF4444' }} />
        <div style={{ width: `${bp}%`, background: '#FF8C00' }} />
        <div style={{ width: `${rp}%`, background: '#00FF88' }} />
      </div>
    </div>
  )
}

// ── Standard metric card ─────────────────────────────────────────────
function MetricCard({ label, value, sub, badge, badgeColor }) {
  return (
    <div className="sc-metric-card">
      <div className="sc-metric-top">
        <span className="sc-metric-label">{label}</span>
        {badge && <span className="sc-metric-badge" style={{ background: badgeColor + '1A', color: badgeColor }}>{badge}</span>}
      </div>
      <div className="sc-metric-value" style={{ color: badgeColor || '#fff' }}>{value}</div>
      {sub && <div className="sc-metric-sub">{sub}</div>}
    </div>
  )
}

// ── CHANGE B: Rating Distribution chart (pure CSS, no library) ───────
function RatingDistributionSection({ distribution, healthyRange, ratingAboveRange, ratingBelowRange, ratingSuspicionLevel, currentRating }) {
  if (!distribution?.length) return null

  const rangeColor = ratingAboveRange ? '#FF4444' : ratingBelowRange ? '#FFD600' : '#00FF88'
  const rangeMsg   = ratingAboveRange
    ? `Rating ${currentRating} is above healthy range — suspicious`
    : ratingBelowRange
    ? `Rating ${currentRating} is below healthy range — quality issue`
    : `Rating ${currentRating} is within healthy range`

  const barColors = { 5: '#00D4FF', 4: 'rgba(0,212,255,0.55)', 3: '#FFD600', 2: '#FF8C00', 1: '#FF4444' }

  return (
    <div style={{ margin: '0 12px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
        Rating Distribution
      </div>
      <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {distribution.map(row => (
          <div key={row.stars} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#94A3B8', width: 12, flexShrink: 0, textAlign: 'right' }}>{row.stars}</span>
            <span style={{ fontSize: 11, color: '#FFD600', flexShrink: 0 }}>&#9733;</span>
            <div style={{ flex: 1, height: 6, background: '#1F2937', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${row.percent}%`, height: '100%', background: barColors[row.stars] || '#00D4FF', borderRadius: 3, transition: 'width .6s ease' }} />
            </div>
            <span style={{ fontSize: 11, color: '#94A3B8', width: 30, textAlign: 'right', flexShrink: 0 }}>{row.percent}%</span>
          </div>
        ))}
        <div style={{ fontSize: 10, color: '#4B5563', marginTop: 4 }}>Distribution estimated from rating metadata</div>
        {healthyRange && (
          <div style={{ fontSize: 11, color: rangeColor, fontWeight: 600 }}>
            Healthy range: {healthyRange.min} – {healthyRange.max} · {rangeMsg}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI Summary — scannable bullet-point sections ─────────────────────
const LEVEL_COLORS = { safe: '#00FF88', warning: '#FFD600', danger: '#FF4444' }
const LEVEL_BG     = { safe: 'rgba(0,255,136,0.07)', warning: 'rgba(255,214,0,0.07)', danger: 'rgba(255,68,68,0.07)' }
const LEVEL_BORDER = { safe: 'rgba(0,255,136,0.2)',  warning: 'rgba(255,214,0,0.2)',  danger: 'rgba(255,68,68,0.2)' }

function AISummaryBlock({ summary }) {
  const [open, setOpen] = useState(false)
  if (!summary?.length) return null

  return (
    <div className="sc-analysis-block">
      <button className={`sc-analysis-toggle${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        AI Analysis Summary
        <svg className={`sc-chevron${open ? ' open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <div className={`sc-analysis-content${open ? ' open' : ''}`} style={{ padding: open ? '10px 12px 4px' : 0 }}>
        {summary.map(section => {
          const c  = LEVEL_COLORS[section.level] || '#94A3B8'
          const bg = LEVEL_BG[section.level]     || 'rgba(148,163,184,0.07)'
          const bd = LEVEL_BORDER[section.level] || 'rgba(148,163,184,0.2)'
          return (
            <div key={section.id} style={{
              background: bg, border: `1px solid ${bd}`,
              borderLeft: `3px solid ${c}`, borderRadius: 10,
              padding: '10px 12px', marginBottom: 8,
            }}>
              {/* Section header: title + verdict badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#F9FAFB' }}>{section.title}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: c,
                  background: c + '1A', border: `1px solid ${c}33`,
                  borderRadius: 20, padding: '2px 8px',
                }}>
                  {section.verdict}
                </span>
              </div>

              {/* Bullet points */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {section.points.map((pt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: c, flexShrink: 0, marginTop: 5,
                      display: 'inline-block',
                    }} />
                    <span style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 1.5 }}>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Seller verification block ────────────────────────────────────────
function SellerBlock({ sellerName, sellerRating, sellerVerified, sellerType, locationNote, sellerProfileUrl, googleMapsUrl, googleSearchUrl, counterfeitRisk }) {
  const verifiedColor  = sellerVerified ? '#00FF88' : '#FFD600'
  const riskColor      = counterfeitRisk === 'critical' ? '#FF4444' : counterfeitRisk === 'high' ? '#FF8C00' : counterfeitRisk === 'medium' ? '#FFD600' : '#00FF88'

  const TYPE_LABELS = {
    brand_official:      { label: 'Brand Official',       color: '#00FF88' },
    authorized_reseller: { label: 'Authorized Reseller',  color: '#00D4FF' },
    established_3p:      { label: 'Established Seller',   color: '#94A3B8' },
    new_3p:              { label: 'New Seller',            color: '#FFD600' },
    suspicious:          { label: 'Suspicious',            color: '#FF4444' },
    unknown:             { label: 'Unclassified',          color: '#4B5563' },
  }
  const typeInfo = TYPE_LABELS[sellerType] || TYPE_LABELS.unknown

  return (
    <div className="sc-metric-card" style={{ gridColumn: '1 / -1' }}>
      {/* Header */}
      <div className="sc-metric-top">
        <span className="sc-metric-label">Seller Verification</span>
        <span className="sc-metric-badge" style={{ background: verifiedColor + '1A', color: verifiedColor }}>
          {sellerVerified ? 'VERIFIED' : 'UNVERIFIED'}
        </span>
      </div>

      {/* Seller name + type row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '8px 0 4px' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#F9FAFB' }}>
            {sellerName || 'Unknown Seller'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: typeInfo.color, background: typeInfo.color + '1A', border: `1px solid ${typeInfo.color}33`, borderRadius: 20, padding: '2px 8px' }}>
              {typeInfo.label}
            </span>
            {sellerRating > 0 && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>⭐ {sellerRating?.toFixed(1)}/5</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#4B5563', marginBottom: 2 }}>Counterfeit Risk</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: riskColor }}>{(counterfeitRisk || 'low').toUpperCase()}</div>
        </div>
      </div>

      {/* Location note from Claude */}
      {locationNote && (
        <div style={{
          fontSize: 11, color: '#94A3B8',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: '7px 10px', marginTop: 6,
        }}>
          {locationNote}
        </div>
      )}

      {/* Verification action buttons */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, display: 'block', textAlign: 'center', padding: '7px 10px',
              background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.35)',
              borderRadius: 9, color: '#00D4FF', fontSize: 11, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Verify on Google Maps
          </a>
        )}
        {googleSearchUrl && (
          <a
            href={googleSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, display: 'block', textAlign: 'center', padding: '7px 10px',
              background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: 9, color: '#94A3B8', fontSize: 11, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Search Seller Reviews
          </a>
        )}
        {sellerProfileUrl && (
          <a
            href={sellerProfileUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, display: 'block', textAlign: 'center', padding: '7px 10px',
              background: 'rgba(255,214,0,0.06)', border: '1px solid rgba(255,214,0,0.25)',
              borderRadius: 9, color: '#FFD600', fontSize: 11, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Seller Profile
          </a>
        )}
      </div>
    </div>
  )
}

// ── Best price block ─────────────────────────────────────────────────
function BestPriceBlock({ bestPrice, savings, currentPrice, priceDiffReason, priceFactors, altPriceRange }) {
  if (!bestPrice?.price) return null
  const platform = PLATFORM_NAMES[bestPrice.platform] || bestPrice.platform
  const url      = bestPrice.url && bestPrice.url !== '#' ? bestPrice.url : null
  const hasDiff  = savings > 0

  return (
    <div className="sc-bestprice-block" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>

      {/* Header: best price + savings chip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="sc-bestprice-label">Best Price Found</div>
          <div className="sc-bestprice-val">Rs. {bestPrice.price.toLocaleString('en-IN')}</div>
          <div className="sc-bestprice-plat">on {platform}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          {hasDiff && <span className="sc-savings-chip">Save Rs. {savings.toLocaleString('en-IN')}</span>}
          {currentPrice > 0 && bestPrice.price > 0 && currentPrice !== bestPrice.price && (
            <span style={{ fontSize: 11, color: '#94A3B8' }}>
              Current: Rs. {currentPrice.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      </div>

      {/* Why the price is different */}
      {priceDiffReason && hasDiff && (
        <div style={{
          fontSize: 12, color: '#FFD600',
          background: 'rgba(255,214,0,0.07)',
          border: '1px solid rgba(255,214,0,0.2)',
          borderRadius: 8, padding: '7px 10px',
        }}>
          <span style={{ fontWeight: 700 }}>Why cheaper: </span>{priceDiffReason}
        </div>
      )}

      {/* Price factors list */}
      {priceFactors?.length > 0 && hasDiff && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {priceFactors.map((factor, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94A3B8' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00FF88', flexShrink: 0, display: 'inline-block' }} />
              {factor}
            </div>
          ))}
        </div>
      )}

      {/* Category price range */}
      {altPriceRange && (
        <div style={{ fontSize: 11, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 8 }}>
          <span style={{ color: '#94A3B8' }}>Category range: </span>
          <span style={{ color: '#F9FAFB' }}>
            Rs. {altPriceRange.minPrice?.toLocaleString('en-IN')} – Rs. {altPriceRange.maxPrice?.toLocaleString('en-IN')}
          </span>
          {altPriceRange.positionNote && (
            <span style={{ color: '#4B5563', display: 'block', marginTop: 2 }}>
              {altPriceRange.positionNote}
            </span>
          )}
        </div>
      )}

      {/* Clickable Go button */}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block', textAlign: 'center', padding: '8px 12px',
            background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.4)',
            borderRadius: 10, color: '#00FF88', fontSize: 12, fontWeight: 600,
            textDecoration: 'none', marginTop: 2,
          }}
        >
          Get Best Price on {platform}
        </a>
      )}
    </div>
  )
}

// ── CHANGE C: Alternative section — best card + compact list ─────────
function AlternativesSection({ allAlternatives, bestAlternative, totalAlternativesFound }) {
  const [expandedIdx, setExpandedIdx] = useState(null)

  // Use allAlternatives from orchestrator if available, fallback to bestAlternative
  const richAlts = allAlternatives?.length > 0 ? allAlternatives : null
  if (!richAlts && !bestAlternative) return null

  const best    = richAlts ? richAlts[0] : null
  const rest    = richAlts ? richAlts.slice(1, 5) : []
  const n       = totalAlternativesFound || richAlts?.length || 1

  const verdictColor = v => v === 'Highly Recommended' ? '#00FF88' : v === 'Recommended' ? '#00D4FF' : v === 'Consider with Caution' ? '#FFD600' : '#FF4444'
  const typeLabel    = t => t === 'budget' ? 'Budget Option' : t === 'premium' ? 'Premium Option' : 'Better Value'
  const platName     = p => PLATFORM_NAMES[p] || (p ? p.charAt(0).toUpperCase() + p.slice(1) : 'Store')
  const scoreColor   = s => s >= 70 ? '#00FF88' : s >= 50 ? '#FFD600' : '#FF4444'

  const BestCard = ({ alt }) => {
    if (!alt) return null
    const pa = alt.priceAnalysis || {}
    const ra = alt.ratingAnalysis || {}
    const rv = alt.reviewAnalysis || {}
    const url = alt.platformUrl || alt.url || '#'
    const vc  = verdictColor(alt.overallVerdict)

    return (
      <div style={{
        background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: '3px solid #FFD600', borderRadius: 14, padding: 14,
        position: 'relative', marginBottom: 8,
      }}>
        <span style={{ position: 'absolute', top: 10, right: 12, fontSize: 10, fontWeight: 700, color: '#FFD600', background: 'rgba(255,214,0,0.1)', border: '1px solid rgba(255,214,0,0.3)', borderRadius: 20, padding: '2px 8px' }}>BEST PICK</span>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 3, paddingRight: 60 }}>{alt.name}</div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8 }}>{alt.brand}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#00FF88' }}>Rs. {(alt.price || 0).toLocaleString('en-IN')}</span>
          {pa.savingsAmount > 0 && (
            <span style={{ fontSize: 11, color: '#00FF88', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 20, padding: '1px 8px' }}>
              Save Rs. {pa.savingsAmount.toLocaleString('en-IN')}
            </span>
          )}
          {pa.priceDifference > 0 && (
            <span style={{ fontSize: 11, color: '#FF8C00', border: '1px solid rgba(255,140,0,0.3)', borderRadius: 20, padding: '1px 8px' }}>
              Rs. {pa.priceDifference.toLocaleString('en-IN')} more
            </span>
          )}
        </div>

        <span style={{ fontSize: 10, fontWeight: 600, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', borderRadius: 20, padding: '2px 8px', marginBottom: 8, display: 'inline-block' }}>{platName(alt.platform)}</span>

        {alt.whyAlternative && (
          <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', marginBottom: 10 }}>{alt.whyAlternative}</div>
        )}

        {/* Mini scores */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          {[['Price', pa.priceScore], ['Rating', ra.ratingScore], ['Reviews', rv.reviewScore]].map(([lbl, val]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#94A3B8', marginBottom: 2 }}>{lbl}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: scoreColor(val || 50) }}>{val ?? 50}/100</div>
            </div>
          ))}
        </div>

        {alt.overallVerdict && (
          <span style={{ fontSize: 11, fontWeight: 700, color: vc, background: vc + '1A', border: `1px solid ${vc}33`, borderRadius: 20, padding: '3px 10px', display: 'inline-block', marginBottom: 10 }}>
            {alt.overallVerdict}
          </span>
        )}

        {url && url !== '#' && (
          <a href={url} target="_blank" rel="noopener noreferrer" style={{
            display: 'block', textAlign: 'center', padding: '8px 12px',
            border: '1px solid #00D4FF', borderRadius: 10, color: '#00D4FF',
            fontSize: 12, fontWeight: 600, textDecoration: 'none',
          }}>
            {alt.verifiedAlternative ? `View on ${platName(alt.platform)}` : `Search on ${platName(alt.platform)}`}
          </a>
        )}
      </div>
    )
  }

  const CompactRow = ({ alt, idx }) => {
    const expanded = expandedIdx === idx
    const pa = alt.priceAnalysis || {}
    const url = alt.platformUrl || alt.url || '#'

    if (expanded) return (
      <div style={{ marginBottom: 8 }}>
        <BestCard alt={alt} />
        <button onClick={() => setExpandedIdx(null)} style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#94A3B8', fontSize: 12, cursor: 'pointer' }}>Collapse</button>
      </div>
    )

    return (
      <div
        onClick={() => setExpandedIdx(idx)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', marginBottom: 6 }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alt.name}</div>
          <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{typeLabel(alt.alternativeType)}</div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#00FF88', flexShrink: 0 }}>Rs. {(alt.price || 0).toLocaleString('en-IN')}</div>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${scoreColor(alt.totalAlternativeScore || 50)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: scoreColor(alt.totalAlternativeScore || 50), flexShrink: 0 }}>
          {Math.round(alt.totalAlternativeScore || 50)}
        </div>
      </div>
    )
  }

  return (
    <div className="sc-alts-block">
      <div className="sc-alts-header">Smart Alternatives Found</div>
      <div style={{ fontSize: 11, color: '#4B5563', marginBottom: 10 }}>
        {n} alternative{n !== 1 ? 's' : ''} {richAlts?.every(a => !a.verifiedAlternative) ? '— click to search' : 'verified by AI'}
      </div>

      {best && <BestCard alt={best} />}

      {rest.length > 0 && (
        <div>
          {rest.map((alt, i) => <CompactRow key={i} alt={alt} idx={i} />)}
        </div>
      )}

      {/* Fallback: show basic alternatives if no rich data */}
      {!richAlts && bestAlternative && (
        <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{bestAlternative.name || bestAlternative.productName}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#00FF88', marginTop: 4 }}>Rs. {(bestAlternative.price || 0).toLocaleString('en-IN')}</div>
          {bestAlternative.reason && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{bestAlternative.reason}</div>}
        </div>
      )}
    </div>
  )
}

// ── Main ResultsView ─────────────────────────────────────────────────
export function ResultsView({ results, onReset, onDashboard }) {
  return (
    <>
      <div className="sc-body">
        <TrustRing score={results.trustScore} />

        {/* Product info */}
        <div className="sc-product-bar">
          <div className="sc-product-name">{results.productName}</div>
          {results.productPrice > 0 && <div className="sc-product-price">Rs. {results.productPrice.toLocaleString('en-IN')}</div>}
          {results.platform && <div className="sc-product-plat">{PLATFORM_NAMES[results.platform] || results.platform}</div>}
        </div>

        {/* Review breakdown card (spans full width) + Seller block (full width) */}
        <div className="sc-metrics">
          <ReviewBreakdownCard
            fakePercent={results.fakeReviewPercent}
            botPercent={results.botReviewPercent}
            realPercent={results.realReviewPercent}
          />
          <SellerBlock
            sellerName={results.sellerName}
            sellerRating={results.sellerRating}
            sellerVerified={results.sellerVerified}
            sellerType={results.sellerType}
            locationNote={results.locationNote}
            sellerProfileUrl={results.sellerProfileUrl}
            googleMapsUrl={results.googleMapsUrl}
            googleSearchUrl={results.googleSearchUrl}
            counterfeitRisk={results.counterfeitRisk}
          />
        </div>

        {/* CHANGE B: Rating distribution chart */}
        <RatingDistributionSection
          distribution={results.ratingDistribution}
          healthyRange={results.ratingHealthyRange}
          ratingAboveRange={results.ratingAboveHealthyRange}
          ratingBelowRange={results.ratingBelowHealthyRange}
          ratingSuspicionLevel={results.ratingSuspicionLevel}
          currentRating={results.productPrice ? undefined : results.sellerRating}
        />

        <BestPriceBlock
          bestPrice={results.bestPrice}
          savings={results.savings}
          currentPrice={results.productPrice}
          priceDiffReason={results.priceDiffReason}
          priceFactors={results.priceFactors}
          altPriceRange={results.altPriceRange}
        />

        {/* Bug #5 fix: AI Summary — bullet-point scannable sections */}
        <AISummaryBlock summary={results.aiSummary} />

        {/* CHANGE C: multi-alternative section */}
        <AlternativesSection
          allAlternatives={results.allAlternatives}
          bestAlternative={results.alternative}
          totalAlternativesFound={results.totalAlternativesFound}
        />
      </div>

      <div className="sc-actions">
        <button className="sc-btn-primary" onClick={onReset}>Scan Another Product</button>
        <button className="sc-btn-secondary" onClick={onDashboard}>View Full Dashboard</button>
      </div>
    </>
  )
}
