// src/content/injectButton.js
// Shadow DOM isolation — all styles scoped inside shadow root.
// Electric Blue (#2563EB) button, dark panel.
import { analyzeProduct, fetchAlternatives } from '../services/aiAnalysis'

const HOST_ID = 'scancart-host'

let _productData = null
let _shadowRoot  = null

// Extension files (logo, font) as URLs the page can load
function _asset(path) {
  try { return chrome.runtime.getURL(path) } catch { return '' }
}

// @font-face does not work inside a shadow root, so Inter is registered on the page
// under its own family name (won't clash with the store's fonts).
function _loadFont() {
  if (document.getElementById('scancart-font')) return
  const st = document.createElement('style')
  st.id = 'scancart-font'
  st.textContent = `@font-face { font-family: 'ScanCart Inter'; src: url('${_asset('fonts/Inter.ttf')}') format('truetype'); font-weight: 100 900; font-display: swap; }`
  document.head.appendChild(st)
}

/* ── Inline SVG helpers ── */
function _ic(path, size = 18, color = 'currentColor', fill = 'none', sw = 2) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
}
const P = {
  cart:    `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 001.95 1.58h9.78a2 2 0 001.95-1.67l1.65-9.09H5.12"/>`,
  search:  `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
  rupee:   `<path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 000-8"/>`,
  shield:  `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>`,
  shieldS: `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
  bulb:    `<path d="M15 14c.2-1 .7-1.7 1.5-2.5C17.9 10 19 8 19 6a7 7 0 00-14 0c0 2 1.1 4 2.5 5.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>`,
  robot:   `<rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" x2="8" y1="16" y2="16"/><line x1="16" x2="16" y1="16" y2="16"/>`,
  verify:  `<path d="M3.85 8.62a4 4 0 014.78-4.77 4 4 0 016.74 0 4 4 0 014.78 4.78 4 4 0 010 6.74 4 4 0 01-4.77 4.78 4 4 0 01-6.75 0 4 4 0 01-4.78-4.77 4 4 0 010-6.76Z"/><path d="m9 12 2 2 4-4"/>`,
  extlink: `<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>`,
  x:       `<path d="M18 6L6 18M6 6l12 12"/>`,
  star:    `<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`,
  chevron: `<path d="m9 18 6-6-6-6"/>`,
  store:   `<path d="m2 7 4.41-4.41A2 2 0 017.83 2h8.34a2 2 0 011.42.59L22 7"/><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><path d="M15 22v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4"/><path d="M2 7h20"/>`,
  zap:     `<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>`,
}

/* ═══════════════════════════════════════════════
   PUBLIC API
═══════════════════════════════════════════════ */
export function injectScanButton(productData = null) {
  _productData = productData

  // Already injected — just refresh product section
  if (document.getElementById(HOST_ID)) {
    const el = _shadowRoot?.getElementById('sc-product-section')
    if (el) el.innerHTML = _productHTML(productData)
    return
  }

  _loadFont()

  // Create host element
  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText = 'all: initial; position: fixed; z-index: 2147483647;'
  document.body.appendChild(host)

  // Attach shadow
  _shadowRoot = host.attachShadow({ mode: 'open' })
  _shadowRoot.innerHTML = `<style>${_CSS}</style>${_buildHTML(productData)}`

  _shadowRoot.getElementById('sc-fab').addEventListener('click', _togglePanel)
  _shadowRoot.getElementById('sc-close').addEventListener('click', _hidePanel)
  _shadowRoot.getElementById('sc-backdrop').addEventListener('click', _hidePanel)
  _setupOptions()
  setTimeout(_showPanel, 2200)
}

export function removeScanButton() {
  document.getElementById(HOST_ID)?.remove()
  _shadowRoot = null
}

export function setFabResult(score) {
  const fab = _shadowRoot?.getElementById('sc-fab')
  if (!fab) return
  fab.classList.remove('fab-green', 'fab-yellow', 'fab-red')
  // same thresholds as the popup verdict
  const [cls, words] = score >= 70 ? ['fab-green', 'Safe to buy'] : score >= 45 ? ['fab-yellow', 'Buy with caution'] : ['fab-red', 'Do not buy']
  fab.classList.add(cls)
  const label = _shadowRoot.getElementById('sc-fab-label')
  if (label) label.textContent = `ScanCart ${score} · ${words}`
}

/* ═══════════════════════════════════════════════
   SHADOW CSS
═══════════════════════════════════════════════ */
const _CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:host { all: initial; }
/* 2026 redesign — same tokens as the popup and scancart.ai (slate + blue-600, Inter) */
#sc-panel, #sc-fab { font-family: 'ScanCart Inter', 'Inter', -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }

/* ── Floating scan button (board frame 13 · 1) ── */
#sc-fab {
  position: fixed; bottom: 24px; right: 24px; height: 48px; padding: 0 18px 0 8px;
  border-radius: 999px; border: 0; cursor: pointer; z-index: 2147483647;
  display: flex; align-items: center; gap: 10px;
  background: linear-gradient(90deg, #2563EB, #3B82F6); color: #fff;
  font-size: 14px; font-weight: 700; letter-spacing: -.01em;
  box-shadow: 0 10px 28px rgba(37,99,235,.35); transition: transform .18s, box-shadow .18s;
}
#sc-fab:hover { transform: translateY(-2px); box-shadow: 0 14px 32px rgba(37,99,235,.42); }
.fab-ic { width: 34px; height: 34px; border-radius: 50%; background: rgba(255,255,255,.18); display: flex; align-items: center; justify-content: center; }
#sc-fab.fab-green  { background: linear-gradient(90deg, #15803D, #16A34A); box-shadow: 0 10px 28px rgba(22,163,74,.35); }
#sc-fab.fab-yellow { background: linear-gradient(90deg, #D97706, #F59E0B); box-shadow: 0 10px 28px rgba(245,158,11,.35); }
#sc-fab.fab-red    { background: linear-gradient(90deg, #B91C1C, #DC2626); box-shadow: 0 10px 28px rgba(220,38,38,.35); }

/* ── Backdrop ── */
#sc-backdrop { display: none; position: fixed; inset: 0; background: rgba(15,23,42,.25); z-index: 2147483640; }
#sc-backdrop.on { display: block; }

/* ── Slide-in panel (board frame 13 · 3) ── */
#sc-panel {
  display: none; position: fixed; top: 16px; right: 16px; bottom: 84px;
  width: 380px; background: #F8FAFC; color: #0F172A;
  border: 1px solid #E2E8F0; border-radius: 22px;
  box-shadow: 0 24px 64px rgba(15,23,42,.22);
  z-index: 2147483645; overflow: hidden; flex-direction: column;
  animation: sc-in .28s cubic-bezier(.4,0,.2,1);
}
@keyframes sc-in { from { transform: translateX(24px); opacity: 0 } to { transform: none; opacity: 1 } }
#sc-panel.open { display: flex; }

.sc-ph { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; background: #fff; border-bottom: 1px solid #E2E8F0; flex-shrink: 0; }
.sc-ph-logo img { height: 22px; width: auto; display: block; }
.sc-ph-badge { margin-left: auto; font-size: 11px; font-weight: 700; color: #2563EB; background: #EFF6FF; border-radius: 999px; padding: 3px 10px; }
.sc-close { width: 30px; height: 30px; border-radius: 50%; border: 1px solid #E2E8F0; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.sc-close:hover { background: #F1F5F9; }

.sc-pb { flex: 1; overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(15,23,42,.15) transparent; }

/* cards */
.sc-prod, .sc-opt-btn, .sc-r-head, .sc-trust-bar, .sc-stat, .sc-price-vs, .sc-alt-item {
  background: #fff; border: 1px solid #E2E8F0; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05);
}
.sc-prod { margin: 14px; border-radius: 18px; padding: 12px 14px; display: flex; gap: 12px; align-items: center; }
.sc-prod-img-box { width: 52px; height: 52px; flex-shrink: 0; border-radius: 12px; border: 1px solid #E2E8F0; background: #fff; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.sc-prod-img { width: 100%; height: 100%; object-fit: contain; }
.sc-prod-info { flex: 1; min-width: 0; }
.sc-prod-name { font-size: 13px; font-weight: 700; color: #0F172A; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px; }
.sc-prod-price { font-size: 16px; font-weight: 800; color: #0F172A; letter-spacing: -.01em; }
.sc-prod-meta { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 11px; color: #64748B; }

.sc-opt-section { padding: 2px 14px 14px; }
.sc-opt-head { font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 10px; }
.sc-opt-list { display: flex; flex-direction: column; gap: 8px; }
.sc-opt-btn { display: flex; align-items: center; gap: 12px; border-radius: 16px; padding: 11px 12px; cursor: pointer; width: 100%; text-align: left; font-family: inherit; transition: border-color .15s, background .15s; }
.sc-opt-btn:hover { border-color: #2563EB; background: #F8FBFF; }
.sc-opt-icon { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-opt-mid { flex: 1; min-width: 0; }
.sc-opt-title { font-size: 13px; font-weight: 700; color: #0F172A; margin-bottom: 1px; }
.sc-opt-desc  { font-size: 11.5px; color: #64748B; }
.sc-opt-arrow { flex-shrink: 0; }

.sc-scanning { padding: 30px 16px; text-align: center; }
.sc-scan-ring { position: relative; width: 80px; height: 80px; margin: 0 auto 16px; }
.sc-spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.sc-scan-title { font-size: 16px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 6px; }
.sc-scan-step  { font-size: 12px; color: #2563EB; font-weight: 600; margin-bottom: 14px; }
.sc-scan-dots  { display: flex; justify-content: center; gap: 6px; margin-bottom: 10px; }
.sc-dot { width: 7px; height: 7px; border-radius: 50%; background: #E2E8F0; transition: background .3s; }
.sc-dot.on { background: #2563EB; }
.sc-scan-note { font-size: 11px; color: #94A3B8; }

.sc-result { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.sc-r-head { display: flex; align-items: center; gap: 12px; border-radius: 18px; padding: 14px; }
.sc-r-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-r-head-text { flex: 1; min-width: 0; }
.sc-r-title { font-size: 14px; font-weight: 800; color: #0F172A; display: block; letter-spacing: -.01em; }
.sc-r-sub   { font-size: 11.5px; color: #64748B; }
.sc-r-chip  { font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 999px; flex-shrink: 0; }

.sc-trust-bar { border-radius: 14px; padding: 12px; }
.sc-trust-labels { display: flex; justify-content: space-between; font-size: 11px; color: #64748B; margin-bottom: 8px; }
.sc-trust-track { height: 8px; background: #F1F5F9; border-radius: 999px; overflow: hidden; }
.sc-trust-fill  { height: 100%; border-radius: 999px; transition: width .6s ease; }

.sc-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
.sc-stat { border-radius: 12px; padding: 10px; text-align: center; }
.sc-stat-v { font-size: 17px; font-weight: 900; color: #0F172A; display: block; letter-spacing: -.02em; }
.sc-stat-k { font-size: 10.5px; color: #64748B; display: block; margin-top: 2px; }

.sc-ai-box { background: #EFF6FF; border: 0; border-radius: 14px; padding: 12px; }
.sc-ai-box-title { font-size: 11.5px; font-weight: 800; color: #1E3A8A; margin-bottom: 6px; display: flex; align-items: center; gap: 5px; }
.sc-ai-box-txt { font-size: 12px; color: #334155; line-height: 1.55; }

.sc-verdict { border-radius: 12px; padding: 10px 14px; font-size: 12.5px; font-weight: 700; }
.sc-verdict-green  { background: #F0FDF4; border: 1px solid #BBF7D0; color: #15803D; }
.sc-verdict-yellow { background: #FFFBEB; border: 1px solid #FDE68A; color: #B45309; }
.sc-verdict-red    { background: #FEF2F2; border: 1px solid #FECACA; color: #DC2626; }

.sc-price-vs { display: flex; align-items: center; gap: 10px; border-radius: 16px; padding: 14px; }
.sc-pv-side { flex: 1; }
.sc-pv-label { font-size: 10px; color: #64748B; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
.sc-pv-val   { font-size: 18px; font-weight: 900; color: #0F172A; letter-spacing: -.02em; }
.sc-pv-val.best { color: #16A34A; }
.sc-pv-plat  { font-size: 11px; color: #64748B; }
.sc-pv-arrow { font-size: 20px; color: #2563EB; font-weight: 700; }
.sc-savings-banner { background: linear-gradient(120deg, #1E3A8A, #2563EB 55%, #06B6D4 120%); border-radius: 14px; padding: 12px 14px; font-size: 12.5px; color: #fff; }
.sc-savings-banner strong { font-weight: 900; }

.sc-alt-grid { display: flex; flex-direction: column; gap: 8px; }
.sc-alt-item { display: flex; align-items: flex-start; gap: 10px; border-radius: 16px; padding: 12px; cursor: pointer; transition: border-color .15s; }
.sc-alt-item:hover { border-color: #2563EB; }
.sc-alt-thumb { width: 46px; height: 46px; border-radius: 10px; border: 1px solid #E2E8F0; background: #fff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; overflow: hidden; }
.sc-alt-thumb img { width: 100%; height: 100%; object-fit: contain; }
.sc-alt-info { flex: 1; min-width: 0; }
.sc-alt-name { font-size: 12.5px; font-weight: 700; color: #0F172A; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-alt-price-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.sc-alt-price-val { font-size: 14px; font-weight: 800; color: #0F172A; }
.sc-alt-save { font-size: 10.5px; color: #16A34A; background: #F0FDF4; border-radius: 999px; padding: 1px 8px; font-weight: 700; }
.sc-alt-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; align-items: center; }
.sc-alt-plat-tag { font-size: 10px; padding: 2px 8px; border-radius: 999px; font-weight: 700; }
.sc-alt-type-tag { font-size: 9.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; }
.sc-alt-india-tag { font-size: 9.5px; padding: 2px 8px; border-radius: 999px; font-weight: 700; background: #F0FDF4; color: #16A34A; }
.sc-alt-reason { font-size: 11px; color: #64748B; margin-top: 5px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sc-alt-arrow { flex-shrink: 0; padding-top: 2px; }

.sc-sum-badges { display: flex; flex-wrap: wrap; gap: 7px; }
.sc-sum-badge { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 999px; display: flex; align-items: center; gap: 4px; }

.sc-back-btn { width: 100%; height: 42px; background: #fff; border: 1px solid #E2E8F0; border-radius: 999px; color: #0F172A; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.sc-back-btn:hover { background: #F1F5F9; }

.sc-err { text-align: center; padding: 28px; }
.sc-err-msg { font-size: 13px; color: #64748B; margin: 12px 0; }
.sc-section-lbl { font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: .12em; }
`

/* ═══════════════════════════════════════════════
   HTML SHELL
═══════════════════════════════════════════════ */
function _buildHTML(productData) {
  return `
    <div id="sc-backdrop"></div>

    <div id="sc-panel">
      <div class="sc-ph">
        <div class="sc-ph-logo"><img src="${_asset('scancart-logo.png')}" alt="ScanCart.ai"></div>
        <span class="sc-ph-badge">${(_productData?.platform || 'store').replace(/^./, c => c.toUpperCase())}</span>
        <button class="sc-close" id="sc-close">${_ic(P.x, 14, '#94A3B8')}</button>
      </div>

      <div class="sc-pb">
        <div id="sc-product-section">${_productHTML(productData)}</div>
        <div id="sc-content">${_optionsHTML()}</div>
      </div>
    </div>

    <button id="sc-fab" aria-label="Scan with ScanCart">
      <span class="fab-ic">${_ic(P.zap, 17, '#fff', '#fff', 0)}</span>
      <span id="sc-fab-label">Scan with ScanCart</span>
    </button>
  `
}

/* ═══════════════════════════════════════════════
   PRODUCT CARD
═══════════════════════════════════════════════ */
function _productHTML(d) {
  if (!d) {
    return `<div style="padding:14px 16px;font-size:12px;color:#94A3B8;">Product data will appear after scanning.</div>`
  }
  const price = d.price ? `Rs. ${Number(d.price).toLocaleString('en-IN')}` : null
  const rating = d.rating ? Number(d.rating).toFixed(1) : null
  const numRatings = d.numRatings || d.reviewCount
  const platName = (d.platform || 'store').charAt(0).toUpperCase() + (d.platform || 'store').slice(1)

  return `
    <div class="sc-prod">
      <div class="sc-prod-img-box">
        ${d.image
          ? `<img src="${d.image}" alt="" class="sc-prod-img" onerror="this.style.display='none'">`
          : _ic(P.cart, 36, '#2563EB')}
      </div>
      <div class="sc-prod-info">
        <p class="sc-prod-name">${d.productName || d.name || 'Unknown Product'}</p>
        ${price ? `<p class="sc-prod-price">${price}</p>` : ''}
        <div class="sc-prod-meta">
          ${_ic(P.store, 13, '#94A3B8')}
          <span>${d.seller || platName}</span>
          ${rating ? `<span>· ${rating}/5</span>` : ''}
          ${numRatings ? `<span>(${Number(numRatings).toLocaleString('en-IN')})</span>` : ''}
        </div>
      </div>
    </div>
  `
}

/* ═══════════════════════════════════════════════
   OPTIONS
═══════════════════════════════════════════════ */
const OPTS = [
  { key: 'summary',      icon: P.shield,  color: '#16A34A', bg: '#DCFCE7', label: 'Is it safe to buy?',     desc: 'Trust score + top reasons'           },
  { key: 'reviews',      icon: P.search,  color: '#7C3AED', bg: '#F3E8FF', label: 'Fake reviews',           desc: 'Fake, bot and real reviews'          },
  { key: 'seller',       icon: P.store,   color: '#2563EB', bg: '#DBEAFE', label: 'Seller trust',           desc: 'Seller history and trust tier'       },
  { key: 'price',        icon: P.rupee,   color: '#0891B2', bg: '#CFFAFE', label: 'Real price & discount',  desc: 'Fake sale check, price on other stores' },
  { key: 'alternatives', icon: P.bulb,    color: '#CA8A04', bg: '#FEF9C3', label: 'Cheaper options',        desc: 'Optional · takes 10–30 s'            },
]

function _optionsHTML() {
  return `
    <div class="sc-opt-section">
      <p class="sc-opt-head">What do you want to check?</p>
      <div class="sc-opt-list">
        ${OPTS.map(o => `
          <button class="sc-opt-btn" data-option="${o.key}">
            <div class="sc-opt-icon" style="background:${o.bg}">${_ic(o.icon, 22, o.color)}</div>
            <div class="sc-opt-mid">
              <div class="sc-opt-title">${o.label}</div>
              <div class="sc-opt-desc">${o.desc}</div>
            </div>
            <span class="sc-opt-arrow">${_ic(P.chevron, 18, '#94A3B8')}</span>
          </button>`).join('')}
      </div>
    </div>
  `
}

function _setupOptions() {
  _shadowRoot.querySelectorAll('.sc-opt-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); _handleOption(btn.dataset.option) })
  })
}

/* ═══════════════════════════════════════════════
   SCAN + RESULT
═══════════════════════════════════════════════ */
const _STEPS = {
  reviews:      ['Reading review texts…', 'Checking rating vs review counts…', 'Looking for copy-paste reviews…', 'Scoring authenticity…'],
  price:        ['Reading this price and MRP…', 'Checking ScanCart price history…', 'Searching similar products…', 'Finding best deal…'],
  seller:       ['Reading seller details…', 'Checking seller profile…', 'Checking listing details…', 'Computing trust…'],
  alternatives: ['Mapping category…', 'Searching Amazon.in…', 'Searching Flipkart…', 'Ranking by value…'],
  summary:      ['Running 6 checks…', 'Aggregating findings…', 'Computing trust score…', 'Writing recommendation…'],
}

async function _handleOption(option) {
  const cnt = _shadowRoot.getElementById('sc-content')
  if (!cnt) return

  const steps = _STEPS[option] || ['Analyzing…']
  let si = 0

  cnt.innerHTML = `
    <div class="sc-scanning">
      <div class="sc-scan-ring">
        <svg width="80" height="80" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(15,23,42,0.06)" stroke-width="5"/>
          <circle class="sc-spin" cx="40" cy="40" r="32" fill="none" stroke="#2563EB" stroke-width="5" stroke-dasharray="200 201" stroke-linecap="round" transform-origin="40 40"/>
        </svg>
      </div>
      <p class="sc-scan-title">Analyzing…</p>
      <p class="sc-scan-step" id="sc-step-txt">${steps[0]}</p>
      <div class="sc-scan-dots">${steps.map((_, i) => `<div class="sc-dot${i===0?' on':''}"></div>`).join('')}</div>
      <p class="sc-scan-note">${option === 'alternatives' ? 'Looking up live listings (10–30 s)' : '6 AI checks running in parallel'}</p>
    </div>
  `

  const iv = setInterval(() => {
    si = (si + 1) % steps.length
    const el = _shadowRoot.getElementById('sc-step-txt')
    if (el) el.textContent = steps[si]
    _shadowRoot.querySelectorAll('.sc-dot').forEach((d, i) => d.classList.toggle('on', i <= si))
  }, 1400)

  try {
    // Alternatives have their own on-demand endpoint so they never slow down or fail a scan
    const result = option === 'alternatives'
      ? { ...(await fetchAlternatives(window.location.href, _productData) || {}), productPrice: _productData?.price || 0 }
      : await analyzeProduct(window.location.href, _productData)
    clearInterval(iv)
    cnt.innerHTML = _resultHTML(option, result)
    _shadowRoot.querySelector('.sc-back-btn')?.addEventListener('click', e => {
      e.stopPropagation()
      cnt.innerHTML = _optionsHTML()
      _setupOptions()
    })
    if (option === 'alternatives') _setupAltCards()
    // Wire up data-href clicks (price best-found card, etc.) via event delegation
    cnt.querySelectorAll('[data-href]').forEach(el => {
      el.addEventListener('click', () => {
        const url = el.dataset.href
        if (url) window.open(url, '_blank', 'noopener')
      })
    })
    if (result.trustScore !== undefined) setFabResult(result.trustScore)
  } catch (err) {
    clearInterval(iv)
    cnt.innerHTML = `
      <div class="sc-result">
        <div class="sc-err" style="padding:24px 16px;text-align:center">
          ${_ic(P.x, 36, '#DC2626')}
          <p class="sc-err-msg">Analysis failed. Check your connection.</p>
        </div>
        <button class="sc-back-btn">Back</button>
      </div>`
    _shadowRoot.querySelector('.sc-back-btn')?.addEventListener('click', e => {
      e.stopPropagation()
      cnt.innerHTML = _optionsHTML()
      _setupOptions()
    })
  }
}

function _resultHTML(opt, r) {
  const body = {
    reviews:      _reviewResult(r),
    price:        _priceResult(r),
    seller:       _sellerResult(r),
    alternatives: _altResult(r),
    summary:      _summaryResult(r),
  }[opt] || '<p class="sc-err-msg">Unknown option.</p>'
  return `<div class="sc-result">${body}<button class="sc-back-btn">Analyze Something Else</button></div>`
}

/* shared helpers */
function _rHead(icon, color, bg, title, sub, chip, cc) {
  return `<div class="sc-r-head"><div class="sc-r-icon" style="background:${bg}">${_ic(icon,24,color)}</div><div class="sc-r-head-text"><span class="sc-r-title">${title}</span><br><span class="sc-r-sub">${sub}</span></div><span class="sc-r-chip" style="color:${cc};background:${cc}22">${chip}</span></div>`
}
function _trustBar(score) {
  const s = Math.min(100,Math.max(0,score||0))
  const c = s>=70?'#16A34A':s>=40?'#CA8A04':'#DC2626'
  const l = s>=70?'AUTHENTIC':s>=40?'CAUTION':'HIGH RISK'
  return `<div class="sc-trust-bar"><div class="sc-trust-labels"><span style="color:#94A3B8;font-size:11px">Trust Score</span><span style="color:${c};font-size:11px;font-weight:700">${s}/100 — ${l}</span></div><div class="sc-trust-track"><div class="sc-trust-fill" style="width:${s}%;background:${c}"></div></div></div>`
}
function _stats(...items) {
  return `<div class="sc-stats">${items.map(([v,k,c])=>`<div class="sc-stat"><span class="sc-stat-v"${c?` style="color:${c}"`:''}>${v}</span><span class="sc-stat-k">${k}</span></div>`).join('')}</div>`
}
function _aiBox(txt) {
  return `<div class="sc-ai-box"><div class="sc-ai-box-title">${_ic(P.zap,13,'#2563EB')} What the AI found</div><p class="sc-ai-box-txt">${txt}</p></div>`
}
function _verdict(txt, level) {
  const cls = level==='green'?'sc-verdict-green':level==='red'?'sc-verdict-red':'sc-verdict-yellow'
  return `<div class="sc-verdict ${cls}">${txt}</div>`
}

/* ── Review ── */
function _reviewResult(r) {
  if (r.fakeReviewPercent == null) {
    return `
    ${_rHead(P.search,'#7C3AED','rgba(124,58,237,0.15)','Fake Review Analysis','AI authenticity detection','N/A','#9CA3AF')}
    ${_aiBox('The review check could not run for this scan, so it was left out of the Trust Score.')}`
  }
  const fake  = r.fakeReviewPercent||0
  const total = r.totalReviews||0
  const c     = fake<20?'#16A34A':fake<50?'#CA8A04':'#DC2626'
  const risk  = fake<20?'LOW RISK':fake<50?'MEDIUM':'HIGH RISK'
  const insight = fake<20
    ? `Our AI scanned all ${total.toLocaleString('en-IN')} ratings. Only ${fake}% appear suspicious — the star rating is reliable.`
    : fake<50
    ? `${fake}% of ${total.toLocaleString('en-IN')} reviews look manipulated. Filter by "Verified Purchase" before deciding.`
    : `ALERT: ${fake}% of reviews are likely fake. The star rating is heavily inflated — do not trust it.`
  return `
    ${_rHead(P.search,'#7C3AED','rgba(124,58,237,0.15)','Fake Review Analysis','AI authenticity detection',risk,c)}
    ${_trustBar(r.trustScore)}
    ${_stats([total.toLocaleString('en-IN'),'Total',null],[`${fake}%`,'Suspicious',c],[`${100-fake}%`,'Genuine','#16A34A'])}
    ${_aiBox(insight)}
    ${_verdict(fake<20?'Reviews authentic — rating trustworthy':fake<50?'Partially inflated — read carefully':'Reviews unreliable — do not trust rating',fake<20?'green':fake<50?'yellow':'red')}
  `
}

/* ── Price ── */
function _priceResult(r) {
  const cur     = _productData?.price || r.productPrice || 0
  const rawBest = r.bestPrice?.price || 0
  const plat    = r.bestPrice?.platform || '—'
  const platUrl = r.bestPrice?.url || null

  // Only show "Best Found" when it is strictly cheaper than the current price.
  // Never surface a higher price as a "best" recommendation.
  const hasCheaper = cur > 0 && rawBest > 0 && rawBest < cur
  const best        = hasCheaper ? rawBest : 0
  const save        = hasCheaper ? (cur - best) : 0

  const insight = hasCheaper
    ? `Same product available on ${plat} for Rs. ${best.toLocaleString('en-IN')}, saving you Rs. ${save.toLocaleString('en-IN')}.`
    : `No lower price found in ScanCart's search — Rs. ${cur.toLocaleString('en-IN')} looks like a fair price.`

  const bestLabel = hasCheaper ? `Rs. ${best.toLocaleString('en-IN')}` : 'Best Price'
  const bestSub   = hasCheaper ? `${plat}${platUrl ? ' ↗' : ''}` : 'Already lowest'

  return `
    ${_rHead(P.rupee,'#16A34A','rgba(22,163,74,0.1)','Price check','This price vs similar products',hasCheaper?`SAVE Rs.${save.toLocaleString('en-IN')}`:'BEST PRICE','#16A34A')}
    <div class="sc-price-vs">
      <div class="sc-pv-side">
        <div class="sc-pv-label">Current</div>
        <div class="sc-pv-val">Rs. ${cur.toLocaleString('en-IN')}</div>
        <div class="sc-pv-plat">${r.platform || 'This site'}</div>
      </div>
      <div class="sc-pv-arrow">${hasCheaper ? '→' : '✓'}</div>
      <div class="sc-pv-side"${hasCheaper && platUrl ? ` data-href="${platUrl}" style="cursor:pointer"` : ''}>
        <div class="sc-pv-label">Best Found</div>
        <div class="sc-pv-val best">${bestLabel}</div>
        <div class="sc-pv-plat">${bestSub}</div>
      </div>
    </div>
    ${hasCheaper ? `<div class="sc-savings-banner">Save <strong>Rs. ${save.toLocaleString('en-IN')}</strong> on ${plat}</div>` : ''}
    ${_aiBox(insight)}
    ${_verdict(
      hasCheaper
        ? `Better price on ${plat} — save Rs. ${save.toLocaleString('en-IN')}`
        : 'This is the best price available now',
      hasCheaper ? 'yellow' : 'green'
    )}
  `
}

/* ── Seller ── */
function _sellerResult(r) {
  const rat   = r.sellerRating || 0
  const ver   = r.sellerVerified
  const risk  = r.counterfeitRisk || 'medium'
  const type  = r.sellerType || ''
  const c     = rat >= 4 ? '#16A34A' : rat >= 3 ? '#CA8A04' : '#DC2626'
  const trusted = ver && rat >= 4 && risk === 'low'

  // Build insight ONLY from structured boolean/enum fields — never from backend narrative text
  // (r.analysis.sellerHistory can contradict sellerVerified when Claude and local logic diverge)
  const TYPE_LABEL = {
    brand_official:      "Brand's official store",
    authorized_reseller: 'Authorized reseller',
    established_3p:      'Established third-party seller',
    new_3p:              'New or low-history seller',
    suspicious:          'Suspicious seller pattern',
  }
  let insight
  if (trusted) {
    insight = `${TYPE_LABEL[type] || 'Verified seller'} with a ${rat}/5 rating — safe to purchase from this seller.`
  } else if (!ver && (risk === 'high' || risk === 'critical')) {
    insight = `Seller "${r.sellerName || 'Unknown'}" is unverified with ${risk} counterfeit risk. ${rat > 0 ? `Seller rating: ${rat}/5.` : ''} Verify independently before buying.`
  } else if (!ver) {
    insight = `Seller "${r.sellerName || 'Unknown'}" could not be confirmed as an authorized retailer. Exercise caution and check seller reviews.`
  } else {
    insight = `${TYPE_LABEL[type] || 'Verified seller'} — confirmed but rating (${rat}/5) is below ideal. Check recent buyer reviews before purchasing.`
  }

  const chip     = trusted ? 'TRUSTED' : !ver ? 'UNVERIFIED' : 'CAUTION'
  const chipClr  = trusted ? '#16A34A' : !ver ? '#DC2626'    : '#CA8A04'
  const verdict  = trusted
    ? 'Trusted verified seller — safe to buy'
    : !ver ? 'Unverified seller — exercise caution'
    : 'Verified but mixed — check reviews'
  const vLevel   = trusted ? 'green' : !ver ? 'red' : 'yellow'

  return `
    ${_rHead(P.shield,'#2563EB','rgba(37,99,235,0.1)','Seller Trust','History, verification & credibility',chip,chipClr)}
    ${_trustBar(r.trustScore)}
    ${_stats([`${rat}/5`,'Rating',c],[ver?'Yes':'No','Verified',ver?'#16A34A':'#DC2626'],[risk.toUpperCase(),'Risk',risk==='low'?'#16A34A':risk==='medium'?'#CA8A04':'#DC2626'])}
    ${_aiBox(insight)}
    ${_verdict(verdict,vLevel)}
  `
}

/* ── Alternatives ── */
function _altResult(r) {
  const cur = _productData?.price || r.productPrice || 0

  // Prefer rich allAlternatives (has type/indianBrand/reason); fallback to simple alternatives
  let alts = []
  if (r.allAlternatives && r.allAlternatives.length > 0) {
    alts = r.allAlternatives.map(a => ({
      name:        a.name || 'Unknown Product',
      brand:       a.brand || '',
      price:       a.price || 0,
      platform:    a.platform || 'amazon',
      url:         a.url || a.platformUrl || '',
      image:       a.image || null,
      reason:      a.reason || a.whyAlternative || '',
      type:        a.type || a.alternativeType || 'value',
      indianBrand: a.indianBrand || false,
      savings:     a.savings || a.priceAnalysis?.savingsAmount || 0,
      rating:      a.ratingIsReal ? a.estimatedRating : 0,
      priceIsEstimate: a.priceIsEstimate === true,
    }))
  } else if (r.alternatives && r.alternatives.length > 0) {
    alts = r.alternatives.map(a => ({
      name:        a.name || 'Unknown Product',
      brand:       a.brand || '',
      price:       a.price || 0,
      platform:    a.platform || 'amazon',
      url:         a.url || '',
      image:       a.image || null,
      reason:      a.reason || '',
      type:        a.type || 'value',
      indianBrand: a.indianBrand || false,
      savings:     a.savings || 0,
      rating:      0,
      priceIsEstimate: a.priceIsEstimate === true,
    }))
  }

  const realAlts = alts.filter(a => a.price > 0)
  const hasReal  = realAlts.length > 0
  const bestSave = cur > 0
    ? Math.max(0, ...alts.map(a => (a.price > 0 && !a.priceIsEstimate && a.price < cur) ? cur - a.price : 0))
    : 0

  const insight = hasReal
    ? `Found ${realAlts.length} alternative${realAlts.length > 1 ? 's' : ''} on Indian e-commerce${bestSave > 0 ? ` — best saves Rs. ${bestSave.toLocaleString('en-IN')}` : ''}. Click any card to view.`
    : alts.length > 0
    ? 'AI found search links to help explore alternatives on Amazon and Flipkart.'
    : 'No alternatives found for this product. Try searching manually on Amazon or Flipkart.'

  const PLAT_CLR = { amazon:'#FF9900', flipkart:'#2874F0', myntra:'#FF3F6C', nykaa:'#FC2779', meesho:'#B000D8' }
  const TYPE_CLR = { budget:'#16A34A', value:'#2563EB', premium:'#B47FFF' }
  const TYPE_LBL = { budget:'Budget', value:'Value', premium:'Premium' }

  const cardsHTML = alts.length > 0
    ? alts.map(a => {
        const pc      = PLAT_CLR[a.platform] || '#2563EB'
        const platLbl = (a.platform || 'store').charAt(0).toUpperCase() + (a.platform || 'store').slice(1)
        const tc      = TYPE_CLR[a.type] || '#2563EB'
        const tl      = TYPE_LBL[a.type] || 'Value'
        const href    = a.url && a.url !== '#' ? a.url : ''
        const save    = a.savings > 0 ? a.savings : (cur > 0 && a.price > 0 && a.price < cur ? cur - a.price : 0)

        return `
          <div class="sc-alt-item"${href ? ` data-href="${href}"` : ''}>
            <div class="sc-alt-thumb">
              ${a.image
                ? `<img src="${a.image}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : _ic(P.bulb, 26, pc)}
            </div>
            <div class="sc-alt-info">
              <div class="sc-alt-name">${a.name}</div>
              <div class="sc-alt-price-row">
                ${a.price > 0
                  ? `<span class="sc-alt-price-val">${a.priceIsEstimate ? '~' : ''}Rs. ${a.price.toLocaleString('en-IN')}${a.priceIsEstimate ? ' <small style="font-weight:500;opacity:.7">est.</small>' : ''}</span>
                     ${save > 0 ? `<span class="sc-alt-save">${a.priceIsEstimate ? 'Maybe save' : 'Save'} Rs.${save.toLocaleString('en-IN')}</span>` : ''}`
                  : `<span style="font-size:11px;color:#94A3B8">Tap to check price</span>`}
              </div>
              <div class="sc-alt-badges">
                <span class="sc-alt-plat-tag" style="background:${pc}22;color:${pc}">${platLbl}</span>
                <span class="sc-alt-type-tag" style="background:${tc}18;color:${tc}">${tl}</span>
                ${a.indianBrand ? `<span class="sc-alt-india-tag">&#127470;&#127475; Indian Brand</span>` : ''}
                ${a.rating > 0 ? `<span style="font-size:9px;color:#CA8A04;font-weight:700">&#9733; ${a.rating.toFixed(1)}</span>` : ''}
              </div>
              ${a.reason ? `<div class="sc-alt-reason">${a.reason}</div>` : ''}
            </div>
            ${href ? `<div class="sc-alt-arrow">${_ic(P.extlink, 14, pc)}</div>` : ''}
          </div>`
      }).join('')
    : `<div style="padding:28px 16px;text-align:center;color:#94A3B8;font-size:12px;line-height:1.6">
         ${_ic(P.bulb, 36, '#94A3B8')}
         <p style="margin-top:12px;font-weight:600;color:#0F172A">No alternatives found</p>
         <p style="margin-top:4px;font-size:11px">Try searching on Amazon.in or Flipkart manually.</p>
       </div>`

  return `
    ${_rHead(P.bulb, '#CA8A04', 'rgba(234,179,8,0.1)', 'Cheaper options', 'Similar products on Indian stores',
      hasReal
        ? (bestSave > 0 ? `SAVE Rs.${bestSave.toLocaleString('en-IN')}` : `${realAlts.length} FOUND`)
        : alts.length > 0 ? 'EXPLORE' : 'NONE FOUND',
      '#CA8A04')}
    <div class="sc-alt-grid" id="sc-alt-grid">${cardsHTML}</div>
    ${_aiBox(insight)}
    ${hasReal
      ? _verdict(bestSave > 0 ? `Save up to Rs. ${bestSave.toLocaleString('en-IN')} with these alternatives` : `${realAlts.length} alternative${realAlts.length > 1 ? 's' : ''} found — compare and choose`, 'green')
      : alts.length > 0
      ? _verdict('Click any card to explore alternatives on Amazon or Flipkart', 'yellow')
      : _verdict('No alternatives found — this may be a unique or niche product', 'yellow')}
  `
}

function _setupAltCards() {
  const grid = _shadowRoot.getElementById('sc-alt-grid')
  if (!grid) return
  grid.addEventListener('click', e => {
    const card = e.target.closest('[data-href]')
    if (card && card.dataset.href) window.open(card.dataset.href, '_blank', 'noopener')
  })
}

/* ── Summary ── */
function _summaryResult(r) {
  const score = r.trustScore || 0
  const c     = score >= 70 ? '#16A34A' : score >= 45 ? '#CA8A04' : '#DC2626'
  const fake  = r.fakeReviewPercent
  const ver   = r.sellerVerified
  const sellerKnown = ver != null
  const risk  = r.counterfeitRisk || 'medium'

  // Seller badge: unverified OR medium/high/critical risk → always show as caution/unverified,
  // never show "Seller Verified" when the Seller Trust section would show UNVERIFIED.
  const sellerSafe   = ver && (risk === 'low' || risk === 'medium')
  const sellerBadge  = !sellerKnown ? 'Seller Unknown' : sellerSafe ? 'Seller Verified' : ver ? 'Seller Caution' : 'Seller Unverified'
  const sellerClr    = !sellerKnown ? '#9CA3AF' : sellerSafe ? '#2563EB' : ver ? '#CA8A04' : '#DC2626'
  const sellerBg     = !sellerKnown ? 'rgba(156,163,175,0.1)' : sellerSafe ? 'rgba(37,99,235,0.1)' : ver ? 'rgba(234,179,8,0.1)' : 'rgba(220,38,38,0.1)'

  const reviewsOK    = fake != null && fake < 30
  const hasSavings   = (r.savings || 0) > 0

  // Add a note if seller is unverified but overall score looks high — prevent misleading AUTHENTIC
  const sellerWarning = sellerKnown && !ver && score >= 70
    ? ' Note: seller is unverified — verify independently before purchasing.'
    : ''

  const insight = r.analysis?.authenticity
    ? `${r.analysis.authenticity}${sellerWarning}`
    : `Trust Score: ${score}/100. ${score>=70?'Product appears genuine.':score>=40?'Proceed with caution.':'High risk — avoid.'} ${sellerWarning}`

  return `
    ${_rHead(P.shield,c,c+'1A',score >= 70 ? 'Safe to buy' : score >= 45 ? 'Buy with caution' : 'Do not buy',`${r.checksCompleted ?? 6} of ${r.checksTotal ?? 6} checks completed`,`${score}/100`,c)}
    ${_trustBar(score)}
    ${_stats([fake == null ? '—' : `${fake}%`,'Fake Reviews',fake == null ? null : reviewsOK?'#16A34A':'#DC2626'],[r.sellerRating == null ? '—' : `${r.sellerRating}/5`,'Seller',null],[hasSavings?`Rs.${(r.savings||0).toLocaleString('en-IN')}`:'Fair','Price','#16A34A'])}
    ${_aiBox(insight)}
    <div class="sc-sum-badges">
      <span class="sc-sum-badge" style="color:${reviewsOK?'#16A34A':'#DC2626'};background:${reviewsOK?'rgba(22,163,74,0.1)':'rgba(220,38,38,0.1)'}">Reviews ${reviewsOK?'OK':'Suspicious'}</span>
      <span class="sc-sum-badge" style="color:${sellerClr};background:${sellerBg}">${sellerBadge}</span>
      <span class="sc-sum-badge" style="color:${hasSavings?'#16A34A':'#CA8A04'};background:${hasSavings?'rgba(22,163,74,0.1)':'rgba(234,179,8,0.1)'}">${hasSavings?'Save Money':'Fair Price'}</span>
    </div>
    ${_verdict(score>=70?'Safe to buy — green light from our AI':score>=40?'Proceed with caution — verify key details':'Avoid this product — multiple risk signals',score>=70?'green':score>=40?'yellow':'red')}
  `
}

/* ═══════════════════════════════════════════════
   PANEL CONTROLS
═══════════════════════════════════════════════ */
function _showPanel()   { _shadowRoot?.getElementById('sc-panel')?.classList.add('open'); _shadowRoot?.getElementById('sc-backdrop')?.classList.add('on') }
function _hidePanel()   { _shadowRoot?.getElementById('sc-panel')?.classList.remove('open'); _shadowRoot?.getElementById('sc-backdrop')?.classList.remove('on') }
function _togglePanel() { _shadowRoot?.getElementById('sc-panel')?.classList.contains('open') ? _hidePanel() : _showPanel() }
