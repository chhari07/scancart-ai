// src/content/injectButton.js
// Shadow DOM isolation — all styles scoped inside shadow root.
// Electric Blue (#2563EB) button, dark panel.
import { analyzeProduct, fetchAlternatives } from '../services/aiAnalysis'
import { addWatch, findWatch, removeWatch } from '../services/priceWatch'
import { whereToBuy } from '../utils/stores'
import { collectReviews, readStoreInsights, setDeepReviews } from './reviewCollector'
import { SELECTORS, detectPlatform } from '../utils/selectors'
import { quickExtract } from './scanner'
import { storeKey } from './genericReader'
import { getTheme, getThemeSetting, setThemeSetting, onThemeChange, darkenCss, DARK_INLINE } from '../utils/theme'
import { LANGS, getLang, setLang, onLangChange, attachTranslator, translateTree } from '../utils/i18n'
import { getLocalPoints, localInfo, pickHistory } from '../services/localPriceHistory'
import { classifyReviews } from '../../../backend/utils/reviewClassifier.js'
import { detectCategory, tagAspects } from '../../../backend/utils/reviewAspects.js'

const HOST_ID = 'scancart-host'

let _productData = null
let _shadowRoot  = null
let _lastWatch = false   // a watch exists for this page (Sources card)
let _gStats = null       // graph stat row for the current verdict (Figma: Lowest · Average · Highest)
let _lastVerdict = null   // price verdict shown on the Price tab (Wait → watch target = the earlier low)
let _priceInfo   = null   // { points, summary, discount } from /api/price/observe on page load
let _quick       = null   // quick badge result
let _full        = null   // full scan score (number) once the user ran a check
let _aiOn        = true   // false when the backend ran basic rules only (no AI)
let _tabId       = null
let _pageUrl     = null   // set when the panel runs inside the toolbar popup (not on the page)
let _lastReview  = null   // last scan result shown in the Reviews view (for the aspect detail screen)
let _scan        = null   // { url, result } full scan of this page — every tab reuses it (no re-scan)
let _alts        = null   // { url, result } where-to-buy lookup of this page
let _gathered    = null   // { url, meta } reviews collected for this page (product page + review pages + "Customers say")
const _url = () => _pageUrl || window.location.href

// What the page knows right now — the toolbar popup reads this (one source of truth)
export function getPageStatus() {
  return {
    quick: _quick && typeof _quick.trustScore === 'number' ? { trustScore: _quick.trustScore, discount: _quick.discount?.status || null } : null,
    full: typeof _full === 'number' ? _full : null,
  }
}
function _renderStrip() {
  const el = _shadowRoot?.getElementById('sc-score-strip')
  if (!el) return
  const st = getPageStatus()
  const score = st.full ?? st.quick?.trustScore
  if (typeof score !== 'number') { el.innerHTML = ''; return }
  const [, words] = _fabTone(score)
  const col = score >= 70 ? '#16A34A' : score >= 45 ? '#F59E0B' : '#DC2626'
  const fakeSale = st.full == null && st.quick?.discount === 'fake_sale'
  const r = _scan?.url === _url() ? _scan.result : null
  const sub = st.full != null
    ? `${r?.checksCompleted ?? 6} of ${r?.checksTotal ?? 6} checks completed`
    : 'Quick check from page data · pick a check below'
  el.innerHTML = `<div class="sc-sstrip"><span class="sc-spill" style="background:${col}">${score} · ${fakeSale ? 'Sale looks fake' : words}</span><span class="sc-ssub">${sub}</span>${r ? `<button class="sc-share" id="sc-share" title="Share this result">${_ic(_SHARE, 13, 'currentColor')} Share</button>` : ''}</div>`
  el.querySelector('#sc-share')?.addEventListener('click', e => { e.stopPropagation(); _share(e.currentTarget) })
}

// Share a result: the phone app's share menu (WhatsApp etc.), the browser's share sheet, or copy
const _SHARE = `<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>`
function _shareText() {
  const r = _scan?.url === _url() ? _scan.result : {}
  const score = _full ?? r.trustScore
  const words = typeof score === 'number' ? _fabTone(score)[1] : ''
  const d = _productData || {}
  const lines = [`ScanCart ${score} · ${words}`, `${d.productName || r.productName || 'Product'}${d.price ? ` · ₹${Math.round(d.price).toLocaleString('en-IN')}` : ''}`]
  const pts = (_priceInfo?.points || []).filter(p => p.price > 0)
  if (pts.length > 1) {
    const lo = pts.reduce((a, b) => b.price < a.price ? b : a)
    lines.push(`Lowest seen ₹${Math.round(lo.price).toLocaleString('en-IN')} on ${new Date(lo.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`)
  }
  const topics = (r.reviewAspects?.aspects || []).filter(a => a.strength !== 'hidden' && a.mentions >= 3)
  if (topics.length) lines.push('Buyers say: ' + topics.slice(0, 4).map(a => `${a.label.replace(/\?$/, '')} ${a.pos >= a.neg ? 'good' : 'bad'} (${a.pos}/${a.mentions})`).join(', '))
  if (r.fakeReviewPercent != null) lines.push(`About ${r.fakeReviewPercent}% of ratings look suspicious`)
  lines.push(_url(), '— checked with ScanCart.ai')
  return lines.join('\n')
}
async function _share(btn) {
  const text = _shareText()
  try {
    if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'share', text })); return }
    if (window.App && window.App.share) { window.App.share(text); return }   // Android app: share menu (WhatsApp …)
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) { await navigator.share({ text }); return }
    await navigator.clipboard.writeText(text)
    const old = btn.innerHTML; btn.textContent = '✓ Copied'; setTimeout(() => { btn.innerHTML = old }, 1600)
  } catch {}
}
function _announce() {
  _renderStrip()
  try { chrome.runtime.sendMessage({ type: 'SCANCART_STATUS', status: getPageStatus() }) } catch {}
}

/**
 * Draw the same panel inside the toolbar popup (its main screen).
 * The popup passes what the page's script read: product, page URL, tab id and the page's score.
 */
export function mountInline(container, { product = null, url = null, tabId = null, status = null, mobile = false } = {}) {
  // A new open = a fresh check (never the last product's or last time's results)
  _scan = null; _alts = null; _gathered = null; _lastReview = null; _priceInfo = null
  _productData = product
  _pageUrl = url
  _tabId = tabId
  _quick = status?.quick ? { trustScore: status.quick.trustScore, discount: status.quick.discount ? { status: status.quick.discount } : null } : null
  _full = typeof status?.full === 'number' ? status.full : null
  _shadowRoot = container.shadowRoot || container.attachShadow({ mode: 'open' })
  _shadowRoot.innerHTML = `<style>${_CSS}</style><style id="sc-theme-css"></style>${_buildHTML(product)}`
  _shadowRoot.getElementById('sc-fab')?.remove()
  _shadowRoot.getElementById('sc-backdrop')?.remove()
  _shadowRoot.getElementById('sc-panel').classList.add('sc-inline')
  if (mobile) _shadowRoot.getElementById('sc-panel').classList.add('sc-mobile')   // Android app: Figma phone layout
  _setupOptions()
  _renderStrip()
  _setupTheme()
  _setupLang()
  if (url && product?.price) getLocalPoints(url).then(pts => { if (pts.length) _priceInfo = localInfo(pts, { price: product.price, mrp: product.mrpPrice || 0 }) }).catch(() => {})
  return {
    setStatus(st) {
      if (st?.quick) _quick = { trustScore: st.quick.trustScore, discount: st.quick.discount ? { status: st.quick.discount } : null }
      if (typeof st?.full === 'number') _full = st.full
      _renderStrip()
    },
    open(option) { if (option) _handleOption(option) },
  }
}

/** Open the panel from the toolbar popup, optionally straight into one check. */
export function openPanel(option) {
  if (!_shadowRoot) return false
  _showPanel()
  if (option) _handleOption(option)
  return true
}

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
  alert:   `<path d="m21.73 18-8-14a2 2 0 00-3.46 0l-8 14A2 2 0 004 21h16a2 2 0 001.73-3"/><path d="M12 9v4M12 17h.01"/>`,
}

/* ── Light / dark (one setting for the page panel, the toolbar popup and the phone apps) ── */
let _darkCss = null
// Dark-only touches the colour swap can't do by itself
const _DARK_EXTRA = `
.sc-ph-logo img{filter:invert(1) hue-rotate(180deg) brightness(1.2)}
.sc-watch input{background:#000;color:#F5F5F5;border-color:#333}
.sc-watch input::placeholder{color:#8A8A8A}
.sc-watch-btn{background:#2F6BFF}
.sc-g-tip{border:1px solid #333}
.sc-lang{background:#0D0D0D;border-color:#262626}
.sc-lang button{color:#A3A3A3}.sc-lang button.on{background:#F5F5F5;color:#000}
[style*="background:#0F172A"]{background:#F5F5F5!important}
#sc-panel{color-scheme:dark}
`
let _theme = 'light'
const _SUN  = `<path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4"/><circle cx="12" cy="12" r="4"/>`
const _MOON = `<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>`
function _applyTheme(t) {
  _theme = t
  if (!_shadowRoot) return
  const css = _shadowRoot.getElementById('sc-theme-css')
  if (css) css.textContent = t === 'dark' ? (_darkCss ||= darkenCss(_CSS) + DARK_INLINE + _DARK_EXTRA) : ''
  _shadowRoot.getElementById('sc-panel')?.classList.toggle('sc-dark', t === 'dark')
  const b = _shadowRoot.getElementById('sc-theme')
  if (b) {
    b.innerHTML = _ic(t === 'dark' ? _SUN : _MOON, 15, t === 'dark' ? '#FACC15' : '#475569')
    b.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
    b.setAttribute('aria-pressed', String(t === 'dark'))
  }
}
let _themeWired = false
function _setupTheme() {
  _applyTheme(_theme)
  getTheme().then(_applyTheme)
  _shadowRoot?.getElementById('sc-theme')?.addEventListener('click', e => {
    e.stopPropagation()
    const next = _theme === 'dark' ? 'light' : 'dark'
    _applyTheme(next)
    setThemeSetting(next)
  })
  if (!_themeWired) { _themeWired = true; onThemeChange(_applyTheme) }
}
/* ── Language: English (main) · हिन्दी · Hinglish — one setting for the panel, popup and apps ── */
let _langNow = 'en'
function _applyLang(l) {
  _langNow = l === 'hi' || l === 'hinglish' ? l : 'en'
  if (!_shadowRoot) return
  _shadowRoot.querySelectorAll('#sc-lang button').forEach(b => { const on = b.dataset.lang === _langNow; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) })
  _shadowRoot.getElementById('sc-panel')?.setAttribute('lang', _langNow === 'hi' ? 'hi' : 'en')
  translateTree(_shadowRoot, _langNow)
}
let _langWired = false
function _setupLang() {
  if (_shadowRoot && !_shadowRoot.__scTr) { _shadowRoot.__scTr = true; attachTranslator(_shadowRoot, () => _langNow) }
  _applyLang(_langNow)
  getLang().then(_applyLang)
  _shadowRoot?.querySelectorAll('#sc-lang button').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation(); _applyLang(b.dataset.lang); setLang(b.dataset.lang)
  }))
  if (!_langWired) { _langWired = true; onLangChange(_applyLang) }
}
/** For the phone apps: set the language from outside (their own switch). */
export function setPanelLang(l) { _applyLang(l) }

/** For the phone apps: set the theme from outside (their own switch). */
export function setPanelTheme(t) { _applyTheme(t === 'dark' ? 'dark' : 'light') }

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
  _shadowRoot.innerHTML = `<style>${_CSS}</style><style id="sc-theme-css"></style>${_buildHTML(productData)}`

  _shadowRoot.getElementById('sc-fab').addEventListener('click', _togglePanel)
  _shadowRoot.getElementById('sc-close').addEventListener('click', _hidePanel)
  _shadowRoot.getElementById('sc-backdrop').addEventListener('click', _hidePanel)
  _setupOptions()
  _setupTheme()
  _setupLang()
  // No auto-open: the button itself now shows a quick Trust Score (see setFabQuick).
}

export function removeScanButton() {
  document.getElementById(HOST_ID)?.remove()
  _shadowRoot = null
}

const _fabTone = (score) => score >= 70 ? ['fab-green', 'Safe to buy'] : score >= 45 ? ['fab-yellow', 'Buy with caution'] : ['fab-red', 'Do not buy']

export function setFabChecking() {
  const label = _shadowRoot?.getElementById('sc-fab-label')
  if (label) label.textContent = 'ScanCart · checking…'
}

/** Quick check on page load (backup rules only). Tapping the button runs the full AI scan. */
export function setFabQuick(q) {
  _quick = q
  const fab = _shadowRoot?.getElementById('sc-fab')
  const label = _shadowRoot?.getElementById('sc-fab-label')
  if (!fab || !label) return
  if (!q || typeof q.trustScore !== 'number') { label.textContent = 'Scan with ScanCart'; return }
  fab.classList.remove('fab-green', 'fab-yellow', 'fab-red')
  const [cls, words] = _fabTone(q.trustScore)
  fab.classList.add(cls)
  label.innerHTML = `<span class="fab-quick">QUICK</span> ${q.trustScore} · ${q.discount?.status === 'fake_sale' ? 'Sale looks fake' : words}`
  fab.title = 'Quick check from page data (no AI yet). Open to run the full scan.'
  _announce()
}

export function setPriceInfo(info) {
  _priceInfo = info
}

export function setFabResult(score) {
  _full = score
  _announce()
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
.sc-g{padding:14px 14px 12px}
.sc-g-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sc-g-title{font-size:17px;font-weight:800;color:#0F172A;letter-spacing:-.3px}
.sc-g-pills{display:flex;gap:2px;background:#F1F5F9;border-radius:10px;padding:2px}
.sc-g-pill{border:0;background:transparent;font:inherit;font-size:11px;font-weight:700;color:#64748B;padding:4px 7px;border-radius:8px;cursor:pointer}
.sc-g-pill.on{background:#fff;color:#0F172A;box-shadow:0 1px 3px rgba(15,23,42,.12)}
.sc-g-stats{display:flex;gap:22px;margin:10px 0 6px}
.sc-g-k{font-size:10.5px;font-weight:700;letter-spacing:.6px;color:#64748B;text-transform:uppercase;display:flex;align-items:center;gap:6px}
.sc-g-k i{display:inline-block;width:12px;height:2.5px;border-radius:2px}
.sc-g-v{font-size:20px;font-weight:800;color:#0F172A;letter-spacing:-.4px;margin-top:2px}
.sc-g-v span{font-size:11px;font-weight:700;letter-spacing:0;margin-left:3px}
.sc-g-v .dn{color:#2563EB}.sc-g-v .up{color:#0F172A}.sc-g-v .mute{color:#94A3B8;font-weight:600}
.sc-g-wrap{position:relative}
.sc-g-tip{position:absolute;pointer-events:none;background:#1E293B;color:#fff;border-radius:10px;padding:8px 10px;box-shadow:0 6px 18px rgba(15,23,42,.25);white-space:nowrap;z-index:2}
.sc-g-tip-d{font-size:10.5px;font-weight:600;opacity:.85;margin-bottom:4px}
.sc-g-tip-r{display:flex;gap:14px}
.sc-g-tip-r b{display:block;font-size:15px;font-weight:800}
.sc-g-tip-r span{font-size:10px;opacity:.8}
.sc-g-tip-x{font-size:10.5px;margin-top:5px;opacity:.95}
.sc-g-tip-x em{font-style:normal;font-weight:800}.sc-g-tip-x .dn{color:#93C5FD}.sc-g-tip-x .up{color:#fff;text-decoration:underline}

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
#sc-fab .fab-quick { font-size: 9.5px; font-weight: 800; letter-spacing: .1em; background: rgba(255,255,255,.22); border-radius: 999px; padding: 2px 6px; margin-right: 2px; vertical-align: 1px; }
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
.sc-ph { justify-content: flex-start; }
.sc-ph-badge { margin-left: auto; }
.sc-lang { display: inline-flex; border: 1px solid #E2E8F0; border-radius: 999px; padding: 2px; background: #F1F5F9; flex-shrink: 0; }
.sc-lang button { border: 0; background: transparent; font: inherit; font-size: 10.5px; font-weight: 800; color: #64748B; padding: 3px 7px; border-radius: 999px; cursor: pointer; line-height: 1.2; }
.sc-lang button.on { background: #0F172A; color: #fff; }
#sc-panel[lang="hi"] { font-family: 'ScanCart Inter', 'Inter', 'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', system-ui, sans-serif; }

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
.sc-graph { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 12px 12px 8px; }
.sc-graph-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.sc-graph-k { font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: .1em; }
.sc-graph-legend { display: flex; justify-content: space-between; font-size: 10.5px; color: #64748B; margin-top: 4px; }
.sc-watch { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.sc-watch-row { display: flex; gap: 8px; align-items: center; }
.sc-watch input { flex: 1; min-width: 0; height: 38px; border: 1px solid #CBD5E1; border-radius: 10px; padding: 0 10px; font: inherit; font-size: 13px; color: #0F172A; }
.sc-watch-btn { height: 38px; border: 0; border-radius: 999px; background: #0F172A; color: #fff; font: inherit; font-size: 12.5px; font-weight: 700; padding: 0 16px; cursor: pointer; white-space: nowrap; }
.sc-watch-btn.ghost { background: #fff; color: #0F172A; border: 1px solid #E2E8F0; }
.sc-watch-note { font-size: 11px; color: #64748B; line-height: 1.45; }

/* ── Price check (Figma: scancart-price-check) ── */
.sc-pc { border-radius: 16px; padding: 14px; border: 1px solid #E2E8F0; background: #fff; }
.sc-pc.green { background: #F0FDF4; border-color: #BBF7D0; } .sc-pc.amber { background: #FFFBEB; border-color: #FDE68A; }
.sc-pc.red { background: #FEF2F2; border-color: #FECACA; } .sc-pc.blue { background: #EFF6FF; border-color: #E2E8F0; }
.sc-pc-top { display: flex; align-items: center; gap: 10px; }
.sc-pc-emoji { font-size: 24px; line-height: 1; flex-shrink: 0; }
.sc-pc-pill { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: .08em; border-radius: 999px; padding: 3px 8px; }
.sc-pc-pill.green { background: #DCFCE7; color: #15803D; } .sc-pc-pill.amber { background: #FEF3C7; color: #B45309; }
.sc-pc-pill.red { background: #FECACA; color: #B91C1C; } .sc-pc-pill.blue { background: #DBEAFE; color: #2563EB; } .sc-pc-pill.grey { background: #F1F5F9; color: #64748B; }
.sc-pc-title { font-size: 16px; font-weight: 800; color: #0F172A; letter-spacing: -.3px; margin-top: 4px; line-height: 1.25; }
.sc-pc-msg { font-size: 12px; color: #64748B; line-height: 1.5; margin-top: 8px; }
.sc-pc-real { margin-top: 10px; border-top: 1px solid #FECACA; padding-top: 10px; font-size: 12px; color: #0F172A; }
.sc-pc-real div { display: flex; justify-content: space-between; margin-top: 4px; }
.sc-pc-bar { height: 7px; border-radius: 999px; background: #E2E8F0; margin-top: 8px; overflow: hidden; }
.sc-pc-bar span { display: block; height: 100%; background: #DC2626; border-radius: 999px; }
.sc-pc-reads { display: flex; gap: 3px; margin-top: 10px; }
.sc-pc-reads span { flex: 1; height: 18px; border-radius: 5px; background: #E2E8F0; }
.sc-pc-reads span.on { background: #2563EB; }
.sc-pc-k { font-size: 10.5px; font-weight: 800; color: #64748B; text-transform: uppercase; letter-spacing: .1em; display: flex; align-items: center; gap: 6px; }
.sc-pc-k b { margin-left: auto; letter-spacing: 0; text-transform: none; }
.sc-pc-row { display: flex; align-items: center; gap: 8px; margin-top: 9px; font-size: 12.5px; color: #0F172A; }
.sc-pc-row .nm { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
.sc-pc-row .pr { margin-left: auto; font-weight: 800; white-space: nowrap; }
.sc-pc-row .why { font-size: 11px; color: #64748B; }
.sc-pc-x { width: 16px; height: 16px; border-radius: 50%; background: #DC2626; color: #fff; font-size: 9px; font-weight: 800; display: grid; place-items: center; flex-shrink: 0; }
.sc-pc-note { font-size: 11px; color: #64748B; line-height: 1.45; margin-top: 8px; }
.sc-pc details summary { list-style: none; cursor: pointer; }
.sc-pc details summary::-webkit-details-marker { display: none; }
.sc-pc-cta { display: flex; align-items: center; justify-content: space-between; width: 100%; border: 0; border-radius: 999px; background: #0F172A; color: #fff; font: inherit; font-size: 14px; font-weight: 700; padding: 5px 5px 5px 20px; cursor: pointer; min-height: 44px; }
.sc-pc-cta i { width: 34px; height: 34px; border-radius: 50%; background: #fff; color: #0F172A; display: grid; place-items: center; font-style: normal; font-size: 15px; font-weight: 800; }
.sc-pc-cta.purple { background: #5E5CE6; } .sc-pc-cta.purple i { color: #5E5CE6; }
.sc-pc-cta.ghost { background: #fff; color: #0F172A; border: 1.5px solid #0F172A; justify-content: center; padding: 0 16px; }
.sc-pc-ctas { display: flex; gap: 8px; } .sc-pc-ctas > * { flex: 1; }
.sc-pc-chk { display: flex; align-items: center; gap: 9px; font-size: 12.5px; font-weight: 600; color: #0F172A; padding: 8px 0; border-top: 1px solid #F1F5F9; }
.sc-pc-chk:first-child { border-top: 0; }
.sc-pc-chk b { margin-left: auto; font-size: 12px; }
.sc-pc-dot { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 10px; font-weight: 800; flex-shrink: 0; }
.sc-pc-src { display: flex; align-items: center; gap: 10px; margin-top: 10px; }
.sc-pc-src .ic { width: 34px; height: 34px; border-radius: 10px; background: #EFF6FF; display: grid; place-items: center; font-size: 15px; flex-shrink: 0; }
.sc-pc-src .t { font-size: 12.5px; font-weight: 700; color: #0F172A; } .sc-pc-src .d { font-size: 11px; color: #64748B; line-height: 1.35; }
.sc-pc-src .sc-pc-pill { margin-left: auto; flex-shrink: 0; }
.sc-g3 { display: grid; grid-template-columns: repeat(3, 1fr); text-align: center; margin-top: 8px; gap: 6px; }
.sc-g3 b { display: block; font-size: 14px; font-weight: 800; color: #0F172A; } .sc-g3 span { font-size: 11px; color: #64748B; }
.sc-watch.hide { display: none; }
/* ── Same product on other sites (Where to buy) ── */
.sc-sp { display: flex; flex-direction: column; gap: 10px; }
.sc-sp-card { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 14px; }
.sc-sp-card.here { background: #F8FAFC; }
.sc-sp-top { display: flex; align-items: center; gap: 8px; }
.sc-sp-store { font-size: 14px; font-weight: 800; color: #0F172A; }
.sc-sp-price { margin-left: auto; text-align: right; font-size: 16px; font-weight: 800; color: #0F172A; white-space: nowrap; }
.sc-sp-price small { display: block; font-size: 11px; font-weight: 700; }
.sc-sp-name { font-size: 11.5px; color: #64748B; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sc-sp-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
.sc-sp-stats div { background: #F8FAFC; border-radius: 10px; padding: 7px 4px; text-align: center; }
.sc-sp-stats b { display: block; font-size: 13.5px; font-weight: 800; color: #0F172A; }
.sc-sp-stats span { font-size: 10.5px; color: #64748B; }
.sc-sp-bar { display: flex; height: 7px; border-radius: 999px; overflow: hidden; background: #E2E8F0; margin-top: 10px; }
.sc-sp-bar i { display: block; height: 100%; }
.sc-sp-leg { display: flex; justify-content: space-between; font-size: 11px; color: #64748B; margin-top: 5px; }
.sc-sp-line { font-size: 11.5px; color: #0F172A; margin-top: 8px; line-height: 1.45; }
.sc-sp-line span { color: #64748B; }
.sc-sp-quote { font-size: 11.5px; color: #475569; font-style: italic; margin-top: 8px; padding-left: 10px; border-left: 3px solid #BBF7D0; line-height: 1.45; }
.sc-sp-open { display: flex; align-items: center; justify-content: space-between; width: 100%; margin-top: 12px; border: 0; border-radius: 999px; background: #0F172A; color: #fff; font: inherit; font-size: 12.5px; font-weight: 700; padding: 4px 4px 4px 16px; cursor: pointer; }
.sc-sp-open i { width: 28px; height: 28px; border-radius: 50%; background: #fff; color: #0F172A; display: grid; place-items: center; font-style: normal; font-weight: 800; }

/* ── Real vs fake reviews ── */
.sc-rv-group { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 4px 12px; }
.sc-rv-group summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 9px 0; font-size: 12.5px; font-weight: 800; color: #0F172A; }
.sc-rv-group summary::-webkit-details-marker { display: none; }
.sc-rv-group summary b { margin-left: auto; font-size: 11px; color: #64748B; background: #F1F5F9; border-radius: 999px; padding: 1px 8px; }
.sc-rv-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.sc-rv-dot.real { background: #16A34A; } .sc-rv-dot.fake { background: #DC2626; } .sc-rv-dot.unclear { background: #94A3B8; }
.sc-rv { border-top: 1px solid #F1F5F9; padding: 9px 0 10px 10px; border-left: 3px solid transparent; margin-left: -12px; padding-left: 12px; }
.sc-rv.real { border-left-color: #16A34A; } .sc-rv.fake { border-left-color: #DC2626; } .sc-rv.unclear { border-left-color: #CBD5E1; }
.sc-rv-txt { font-size: 12px; color: #334155; line-height: 1.5; }
.sc-rv.fake .sc-rv-txt { color: #64748B; }
.sc-rv-why { font-size: 10.5px; font-weight: 700; margin-top: 4px; }
.sc-rv.real .sc-rv-why { color: #15803D; } .sc-rv.fake .sc-rv-why { color: #DC2626; } .sc-rv.unclear .sc-rv-why { color: #94A3B8; }
/* ── Reviews: counts + "What buyers say" (v1.3) ── */
.sc-rc { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 11px 12px; }
.sc-rc-k { font-size: 10.5px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748B; }
.sc-rc-big { display: flex; align-items: baseline; gap: 8px; margin: 3px 0 7px; }
.sc-rc-big b { font-size: 28px; font-weight: 900; letter-spacing: -.02em; color: #0F172A; }
.sc-rc-big span { font-size: 12px; color: #64748B; font-weight: 600; }
.sc-rc-split { display: flex; height: 9px; border-radius: 999px; overflow: hidden; background: #F1F5F9; }
.sc-rc-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 7px; font-size: 11.5px; font-weight: 700; color: #0F172A; }
.sc-rc-leg i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; }
.sc-rc-sub { font-size: 11px; color: #64748B; margin-top: 5px; line-height: 1.4; }
.sc-rwarn { font-size: 12px; font-weight: 700; border-radius: 12px; padding: 8px 10px; line-height: 1.35; }
.sc-asp { display: grid; grid-template-columns: minmax(0, 150px) 1fr auto; gap: 3px 10px; align-items: center; padding: 7px 4px; border-top: 1px dashed #EEF2F7; cursor: pointer; border-radius: 10px; }
.sc-asp:first-of-type { border-top: 0; }
.sc-asp:hover { background: #F8FBFF; }
.sc-asp.pin { background: #EFF6FF; border-top: 0; margin: 2px 0; }
.sc-asp-l { font-size: 12.5px; font-weight: 700; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sc-asp-t { height: 7px; border-radius: 999px; background: #F1F5F9; display: flex; overflow: hidden; min-width: 50px; }
.sc-asp-c { font-size: 11px; font-weight: 700; color: #334155; white-space: nowrap; }
.sc-asp-q { grid-column: 1 / -1; font-size: 11px; color: #475569; font-style: italic; line-height: 1.35; display: flex; gap: 6px; align-items: baseline; }
.sc-asp-q i { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; transform: translateY(-1px); }
.sc-chip { font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 999px; margin-left: 5px; letter-spacing: .04em; vertical-align: 1px; }
.sc-chip.strong { background: #DCFCE7; color: #15803D; } .sc-chip.few { background: #FEF3C7; color: #B45309; }
.sc-rq { font-size: 11.5px; line-height: 1.4; padding: 7px 9px; border-radius: 10px; margin-top: 6px; color: #0F172A; }
.sc-rq em { display: block; font-style: normal; font-weight: 700; font-size: 10.5px; margin-top: 2px; }
.sc-rq.pos { background: #F0FDF4; } .sc-rq.pos em { color: #15803D; }
.sc-rq.neg { background: #FEF2F2; } .sc-rq.neg em { color: #B91C1C; }
.sc-rq.mixed { background: #FFFBEB; } .sc-rq.mixed em { color: #B45309; }
.sc-rlink { background: none; border: 0; padding: 0; font-family: inherit; font-size: 13px; font-weight: 700; color: #2563EB; cursor: pointer; }


/* ── Where to buy ── */
.sc-store { align-items: center; }
.sc-store-rate { width: 46px; height: 46px; border-radius: 12px; flex-shrink: 0; color: #fff; font-size: 15px; font-weight: 900; display: flex; align-items: center; justify-content: center; letter-spacing: -.02em; }
.sc-store-rate span { font-size: 9px; font-weight: 700; opacity: .8; margin-left: 1px; }
.sc-store-note { font-size: 10.5px; color: #94A3B8; line-height: 1.45; margin: -2px 2px 4px; }

/* ── Inline mode: the same panel as the toolbar popup's main screen ── */
#sc-panel.sc-inline { display: flex; position: static; width: 100%; height: auto; min-height: 520px; border: 0; border-radius: 0; box-shadow: none; animation: none; }
#sc-panel.sc-inline .sc-ph { display: none; }
#sc-panel.sc-inline .sc-pb { overflow: visible; }

/* ── Score strip (quick or full score, same number as the button) ── */
.sc-share { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid #E2E8F0; background: #fff; color: #334155; font: inherit; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.sc-share:hover { background: #F1F5F9; }
.sc-sstrip { margin: 0 14px 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sc-spill { font-size: 12.5px; font-weight: 800; border-radius: 999px; padding: 6px 12px; color: #fff; }
.sc-ssub { font-size: 11.5px; color: #64748B; font-weight: 600; }
.sc-tabs { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; padding: 0 0 10px; margin: 0 0 2px; border-bottom: 1px solid #EEF2F7; }
.sc-tabs::-webkit-scrollbar { display: none; }
.sc-tab { flex-shrink: 0; font-family: inherit; font-size: 11.5px; font-weight: 700; color: #64748B; padding: 6px 10px; border-radius: 999px; border: 0; background: transparent; cursor: pointer; }
.sc-tab:hover { background: #F1F5F9; color: #0F172A; }
.sc-tab.on { background: #2563EB; color: #fff; }
.sc-score-strip { margin: 0 14px 12px; display: flex; align-items: center; gap: 12px; border-radius: 16px; padding: 10px 12px; background: #fff; border: 1.5px solid #E2E8F0; }
.sc-score-strip .n { width: 42px; height: 42px; border-radius: 12px; color: #fff; font-size: 18px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-score-strip .w { font-size: 13.5px; font-weight: 800; }
.sc-score-strip .s { font-size: 11px; color: #64748B; }

/* ── Warning signs + trusted stores button ── */
.sc-warns { background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; padding: 2px 12px; }
.sc-warn { display: flex; gap: 10px; align-items: flex-start; padding: 9px 0; font-size: 12px; color: #334155; line-height: 1.45; }
.sc-warn + .sc-warn { border-top: 1px solid #F1F5F9; }
.sc-warn-ic { width: 24px; height: 24px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sc-trusted-btn { width: 100%; height: 42px; border: 0; border-radius: 999px; background: linear-gradient(90deg, #2563EB, #3B82F6); color: #fff; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; box-shadow: 0 6px 16px rgba(37,99,235,.28); }

/* ── Android app (Figma phone layout): checks and stores each in ONE card with dividers ── */
#sc-panel.sc-mobile .sc-opt-list { gap: 0; background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05); }
#sc-panel.sc-mobile .sc-opt-btn { border: 0; border-radius: 0; box-shadow: none; padding: 10px 12px; gap: 11px; }
#sc-panel.sc-mobile .sc-opt-btn + .sc-opt-btn { border-top: 1px solid #F1F5F9; }
#sc-panel.sc-mobile .sc-opt-icon { width: 32px; height: 32px; border-radius: 10px; }
#sc-panel.sc-mobile .sc-opt-icon svg { width: 16px; height: 16px; }
#sc-panel.sc-mobile .sc-opt-title { font-size: 12.5px; }
#sc-panel.sc-mobile .sc-opt-desc { font-size: 10.5px; }
#sc-panel.sc-mobile #sc-store-grid { gap: 0; background: #fff; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05); }
#sc-panel.sc-mobile #sc-store-grid .sc-alt-item { border: 0; border-radius: 0; box-shadow: none; padding: 9px 11px; }
#sc-panel.sc-mobile #sc-store-grid .sc-alt-item + .sc-alt-item { border-top: 1px solid #F1F5F9; }
#sc-panel.sc-mobile .sc-store-rate { width: 40px; height: 40px; border-radius: 11px; font-size: 13.5px; }
#sc-panel.sc-mobile .sc-prod { margin: 12px 14px; }
#sc-panel.sc-mobile .sc-result { padding: 12px 14px; }
#sc-panel.sc-mobile .sc-score-strip { margin: 0 14px 10px; }
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
        <span class="sc-ph-badge">${_esc(_productData?.storeName || (_productData?.platform || 'store').replace(/^./, c => c.toUpperCase()))}</span>
        <div class="sc-lang" id="sc-lang" role="group" aria-label="Language">${LANGS.map(([k, l]) => `<button data-lang="${k}" class="${k === _langNow ? 'on' : ''}" aria-pressed="${k === _langNow}">${k === 'hinglish' ? 'Hing' : l}</button>`).join('')}</div>
        <button class="sc-close sc-theme-btn" id="sc-theme" aria-label="Dark mode" title="Dark mode"></button>
        <button class="sc-close" id="sc-close">${_ic(P.x, 14, '#94A3B8')}</button>
      </div>

      <div class="sc-pb">
        <div id="sc-product-section">${_productHTML(productData)}</div>
        <div id="sc-score-strip"></div>
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
  const price = d.price ? `₹${Number(d.price).toLocaleString('en-IN')}` : null
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
          ${rating ? `<span>· ${rating} ★</span>` : ''}
          ${numRatings ? `<span>· ${Number(numRatings).toLocaleString('en-IN')} ratings</span>` : ''}
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
  { key: 'reviews',      icon: P.search,  color: '#7C3AED', bg: '#F3E8FF', label: 'Reviews',                desc: 'Real vs fake + what buyers say'      },
  { key: 'seller',       icon: P.store,   color: '#2563EB', bg: '#DBEAFE', label: 'Seller trust',           desc: 'Seller history and trust tier'       },
  { key: 'price',        icon: P.rupee,   color: '#0891B2', bg: '#CFFAFE', label: 'Real price & discount',  desc: 'Fake sale check, price on other stores' },
  { key: 'alternatives', icon: P.bulb,    color: '#CA8A04', bg: '#FEF9C3', label: 'Where to buy & alternatives', desc: 'Trusted stores rated · similar products' },
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

  // Tabs reuse this page's scan: switching tabs never re-runs the checks
  const cache = option === 'alternatives' ? _alts : _scan
  if (cache && cache.url === _url()) { _showResult(cnt, option, cache.result); return }

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

  let pinned = null   // step text shown while review pages are read (the rotating steps wait)
  const iv = setInterval(() => {
    si = (si + 1) % steps.length
    const el = _shadowRoot.getElementById('sc-step-txt')
    if (el) el.textContent = pinned || steps[si]
    _shadowRoot.querySelectorAll('.sc-dot').forEach((d, i) => d.classList.toggle('on', i <= si))
  }, 1400)

  try {
    // Read more reviews first (product page + store review pages + "Customers say"), then scan with all of them
    if (option !== 'alternatives') {
      await _gatherReviews(t => { pinned = t; const el = _shadowRoot.getElementById('sc-step-txt'); if (el) el.textContent = t })
      pinned = null
    }
    // Alternatives have their own on-demand endpoint so they never slow down or fail a scan
    // Alternatives: the "where to buy" store list works offline, so a failed search still shows it
    const result = option === 'alternatives'
      ? { ...(await fetchAlternatives(_url(), _productData).catch(() => ({ altFailed: true })) || {}), productPrice: _productData?.price || 0 }
      : await analyzeProduct(_url(), _productData)
    if (option !== 'alternatives') { _aiOn = result.aiUsed !== false; _withReviews(result) }
    clearInterval(iv)
    if (option === 'alternatives') _alts = { url: _url(), result }
    else _scan = { url: _url(), result }
    _renderStrip()
    _showResult(cnt, option, result)
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

// Collect reviews for this page once. In the toolbar popup the page's own content script does it
// (it has the page and the user's store login); in the Android app there is no page, so it is skipped.
async function _gatherReviews(onStep) {
  if (_gathered && _gathered.url === _url()) return
  let meta = null
  try {
    if (!_pageUrl) {
      const platform = _productData?.platform || detectPlatform() || storeKey(location.hostname)
      if (platform) meta = await collectReviews(platform, _url(), { onStep, extraTextSelector: SELECTORS[platform]?.reviewTexts, wake: true })   // same as the apps: load reviews that appear on scroll / behind a Reviews tab
    } else if (_tabId != null && globalThis.chrome?.tabs?.sendMessage) {
      onStep?.('Reading review pages…')
      meta = await new Promise(res => {
        const t = setTimeout(() => res(null), 25000)
        try { chrome.tabs.sendMessage(_tabId, { type: 'COLLECT_REVIEWS' }, r => { clearTimeout(t); void chrome.runtime.lastError; res(r || null) }) } catch { clearTimeout(t); res(null) }
      })
    }
  } catch { meta = null }
  _gathered = { url: _url(), meta }
  if (!meta || !_productData) return
  const R = meta.reviews || []
  if (R.length > (_productData.reviewTexts?.length || 0)) {
    _productData = { ..._productData, reviewTexts: R.map(r => r.text) }
    const dates = R.map(r => r.date).filter(Boolean)
    if (dates.length) _productData.reviewDates = dates.slice(0, 60)
  }
  const marked = R.filter(r => r.verified != null)
  if (marked.length) _productData = { ..._productData, verifiedCount: marked.filter(r => r.verified).length, verifiedOf: marked.length }
}

// Add what was collected to the scan result. If the backend didn't sort reviews into topics
// (older backend), sort them here with the same rules so the Reviews tab is never empty.
function _withReviews(result) {
  const meta = _gathered?.url === _url() ? _gathered.meta : null
  const texts = _productData?.reviewTexts || []
  result.reviewMeta = meta ? { read: texts.length, fromPage: meta.fromPage, pagesRead: meta.pagesRead, source: meta.source, note: meta.note, deep: meta.deep } : null
  result.storeInsights = meta?.storeInsights || (!_pageUrl ? readStoreInsights(document) : null)
  const backendRead = result.reviewSamples?.checked || 0
  if (texts.length && (!result.reviewAspects || backendRead < texts.length)) {
    try {
      const S = classifyReviews(texts)
      const labelled = [...S.real.map(r => ({ ...r, label: 'real' })), ...S.fake.map(r => ({ ...r, label: 'fake' })), ...S.unclear.map(r => ({ ...r, label: 'unclear' }))]
      const cat = result.productCategory || detectCategory(_productData?.productName || '', _productData?.breadcrumb || '')
      result.reviewSamples = S
      result.productCategory = cat
      result.reviewAspects = tagAspects(labelled, cat)
    } catch {}
  }
  if (result.verifiedReviewCount == null && Number.isFinite(_productData?.verifiedCount)) {
    result.verifiedReviewCount = _productData.verifiedCount
    result.verifiedReviewOf = _productData.verifiedOf
  }
  return result
}

const TABS = [['summary', 'Overview'], ['reviews', 'Reviews'], ['seller', 'Seller'], ['price', 'Price'], ['alternatives', 'Where to buy']]
function _tabsHTML(opt) {
  return `<div class="sc-tabs" role="tablist">${TABS.map(([k, l]) => `<button class="sc-tab${k === opt ? ' on' : ''}" role="tab" data-tab="${k}" aria-selected="${k === opt}">${l}</button>`).join('')}</div>`
}


// Draw one tab of the result and wire its buttons (used after a scan, on tab switch, and on "← Reviews")
function _showResult(cnt, option, result) {
  cnt.innerHTML = _resultHTML(option, result)
  cnt.scrollTop = 0
  cnt.querySelectorAll('.sc-tab[data-tab]').forEach(t => t.addEventListener('click', e => {
    e.stopPropagation()
    if (t.dataset.tab !== option) _handleOption(t.dataset.tab)
  }))
  if (option === 'alternatives') _setupAltCards()
  cnt.querySelector('.sc-trusted-btn')?.addEventListener('click', e => { e.stopPropagation(); _handleOption('alternatives') })
  if (option === 'price') { _setupWatch(); _setupGraph(cnt); _setupPriceCtas(cnt) }
  if (option === 'reviews') {
    _lastReview = result; _setupReviewAspects(cnt)
    // Switch review pages on/off, then re-scan this page so the counts match the setting
    // Phone app: sign in on this shop's own site, so its review pages open
    cnt.querySelector('[data-signin]')?.addEventListener('click', e => { e.stopPropagation(); try { globalThis.App.storeLogin(_url()) } catch {} })
    cnt.querySelector('[data-deep]')?.addEventListener('click', async e => {
      e.stopPropagation()
      await _setDeep(e.currentTarget.dataset.deep === 'on')
      _scan = null; _gathered = null
      if (!_pageUrl) { try { const d = quickExtract(); if (d) _productData = d } catch {} }
      _handleOption('reviews')
    })
  }
  // Wire up data-href clicks (price best-found card, etc.) via event delegation
  cnt.querySelectorAll('[data-href]:not(.sc-alt-grid [data-href])').forEach(el => {
    el.addEventListener('click', () => {
      const url = el.dataset.href
      if (url) window.open(url, '_blank', 'noopener')
    })
  })
  if (result.trustScore !== undefined) {
    setFabResult(result.trustScore)
    // Running inside the popup → tell the page's button too
    if (_pageUrl && _tabId != null) { try { chrome.tabs.sendMessage(_tabId, { type: 'SCAN_COMPLETE', trustScore: result.trustScore }) } catch {} }
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
  return `<div class="sc-result">${_tabsHTML(opt)}${body}</div>`
}

/* shared helpers */
function _rHead(icon, color, bg, title, sub, chip, cc) {
  return `<div class="sc-r-head"><div class="sc-r-icon" style="background:${bg}">${_ic(icon,24,color)}</div><div class="sc-r-head-text"><span class="sc-r-title">${title}</span><br><span class="sc-r-sub">${sub}</span></div><span class="sc-r-chip" style="color:${cc};background:${cc}22">${chip}</span></div>`
}
function _trustBar(score) {
  const s = Math.min(100,Math.max(0,score||0))
  // same cut-offs as the button / bubble: 70+ safe · 45–69 caution · below 45 do not buy
  const c = s>=70?'#16A34A':s>=45?'#CA8A04':'#DC2626'
  const l = s>=70?'AUTHENTIC':s>=45?'CAUTION':'HIGH RISK'
  return `<div class="sc-trust-bar"><div class="sc-trust-labels"><span style="color:#94A3B8;font-size:11px">Trust Score</span><span style="color:${c};font-size:11px;font-weight:700">${s}/100 — ${l}</span></div><div class="sc-trust-track"><div class="sc-trust-fill" style="width:${s}%;background:${c}"></div></div></div>`
}
function _stats(...items) {
  return `<div class="sc-stats">${items.map(([v,k,c])=>`<div class="sc-stat"><span class="sc-stat-v"${c?` style="color:${c}"`:''}>${v}</span><span class="sc-stat-k">${k}</span></div>`).join('')}</div>`
}
function _aiBox(txt) {
  const title = _aiOn ? 'What the AI found' : 'What ScanCart found · basic check (no AI)'
  return `<div class="sc-ai-box"><div class="sc-ai-box-title">${_ic(P.zap,13,'#2563EB')} ${title}</div><p class="sc-ai-box-txt">${txt}</p></div>`
}
const _esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function _verdict(txt, level) {
  const cls = level==='green'?'sc-verdict-green':level==='red'?'sc-verdict-red':'sc-verdict-yellow'
  return `<div class="sc-verdict ${cls}">${txt}</div>`
}

/* ── Review ── */
const _QC = { pos: '#16A34A', neg: '#DC2626', mixed: '#F59E0B' }
function _aspBar(a) {
  const w = v => a.mentions ? (v / a.mentions * 100).toFixed(1) : 0
  return `<div class="sc-asp-t"><i style="width:${w(a.pos)}%;background:#16A34A"></i><i style="width:${w(a.mixed)}%;background:#F59E0B"></i><i style="width:${w(a.neg)}%;background:#DC2626"></i></div>`
}
// Topics with 3+ opinions, "Matches photo?" / "Genuine product?" pinned first, then most talked about
function _shownAspects(A) {
  const list = (A?.aspects || []).filter(a => a.strength !== 'hidden')
  const pinRank = a => a.key === 'matches' ? 0 : a.key === 'genuine' ? 1 : 2
  return list.sort((x, y) => pinRank(x) - pinRank(y) || y.mentions - x.mentions)
}
function _aspectsHTML(A, S) {
  if (!A) return ''
  const shown = _shownAspects(A)
  const hidden = (A.aspects || []).filter(a => a.strength === 'hidden').map(a => _esc(a.label))
  const rows = shown.map(a => {
    const q = a.quotes?.[0]
    return `<div class="sc-asp${a.key === 'matches' || a.key === 'genuine' ? ' pin' : ''}" data-asp="${_esc(a.key)}" title="See every quote">
      <div class="sc-asp-l">${_esc(a.label)}<span class="sc-chip ${a.strength}">${a.strength === 'strong' ? 'STRONG' : 'FEW'}</span></div>
      ${_aspBar(a)}<div class="sc-asp-c">${a.pos} of ${a.mentions} positive</div>
      ${q ? `<div class="sc-asp-q"><i style="background:${_QC[q.pol]}"></i>“${_esc(q.text)}”</div>` : ''}</div>`
  }).join('')
  const empty = !shown.length ? `<div style="text-align:center;padding:14px 6px">${_ic(P.search, 28, '#2563EB')}
      <div style="font-weight:800;font-size:13.5px;margin-top:6px;color:#0F172A">Not enough reviews yet</div>
      <div class="sc-rc-sub">We show a topic only when 3 or more real reviews give an opinion on it.${S?.real ? ` This page has ${S.real.length} real-looking review${S.real.length === 1 ? '' : 's'}.` : ''}</div></div>` : ''
  return `<div class="sc-rc">
    <div class="sc-rc-k">What buyers say · ${_esc(A.categoryLabel || 'Other')}</div>
    <div class="sc-rc-sub" style="margin:2px 0 4px">Real reviews only: ${A.counted} counted, ${A.skippedFake} fake left out${shown.length ? ' · tap a topic' : ''}</div>
    ${rows}${empty}
    ${hidden.length ? `<div class="sc-rc-sub">Not enough reviews about: ${hidden.join(', ')}</div>` : ''}
  </div>`
}
function _reviewCountsHTML(r, S) {
  const n = S.checked || 0
  const pct = v => n ? (v / n * 100).toFixed(1) : 0
  const total = r.totalReviews || 0
  const ver = r.verifiedReviewCount, verOf = r.verifiedReviewOf
  return `<div class="sc-rc">
    <div class="sc-rc-k">Reviews ScanCart read</div>
    <div class="sc-rc-big"><b>${n}</b><span>${n ? `review${n === 1 ? '' : 's'} read` : 'no review text found'}${total ? ` · ${total.toLocaleString('en-IN')} ratings in all` : ''}</span></div>
    ${_readFromHTML(r.reviewMeta)}
    ${n ? `<div class="sc-rc-split"><i style="width:${pct(S.real.length)}%;background:#16A34A"></i><i style="width:${pct(S.unclear.length)}%;background:#CBD5E1"></i><i style="width:${pct(S.fake.length)}%;background:#DC2626"></i></div>
    <div class="sc-rc-leg"><span><i style="background:#16A34A"></i>${S.real.length} look real</span><span><i style="background:#DC2626"></i>${S.fake.length} look fake</span><span><i style="background:#CBD5E1"></i>${S.unclear.length} can't judge</span></div>` : ''}
    ${ver != null && verOf ? `<div class="sc-rc-sub">${ver} of ${verOf} review${verOf === 1 ? '' : 's'} marked Verified Purchase</div>` : ''}
  </div>`
}
// Where the reviews came from + why not more, and the on/off switch for review pages
// The switch lives in the extension's storage, so it is the same on the page and in the popup
async function _setDeep(on) {
  try { await setDeepReviews(on) } catch {}
}
const _storeName = () => ({ amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra', nykaa: 'Nykaa', meesho: 'Meesho' }[_productData?.platform] || _productData?.storeName || 'this shop')
function _readFromHTML(M) {
  if (!M) return ''
  const from = M.pagesRead ? `${M.fromPage} from this page + ${M.read - M.fromPage} from ${M.pagesRead} review page${M.pagesRead === 1 ? '' : 's'}` : 'from this page only'
  const signIn = M.note && /sign in/i.test(M.note) && globalThis.App?.storeLogin
  return `<div class="sc-rc-sub">${from}${M.note ? ` · ${_esc(M.note)}` : ''}</div>
    ${signIn ? `<button class="sc-rlink" data-signin="1" style="margin:2px 0 0;font-size:12px">Sign in to ${_esc(_storeName())} in ScanCart →</button>` : ''}
    <button class="sc-rlink" data-deep="${M.deep ? 'off' : 'on'}" style="margin:2px 0 4px;font-size:11px;font-weight:600;color:#64748B">${M.deep ? 'Reading extra review pages: On · turn off' : 'Reading extra review pages: Off · turn on'}</button>`
}
// The store's own summary of every review (Amazon "Customers say")
function _storeInsightsHTML(I) {
  if (!I || (!I.summary && !I.topics?.length)) return ''
  const rows = (I.topics || []).map(t => {
    if (t.mentions) {
      const mixed = Math.max(0, t.mentions - t.pos - t.neg)
      return `<div class="sc-asp" style="cursor:default"><div class="sc-asp-l">${_esc(t.label)}</div>${_aspBar({ mentions: t.mentions, pos: t.pos, neg: t.neg, mixed })}<div class="sc-asp-c">${t.pos.toLocaleString('en-IN')} of ${t.mentions.toLocaleString('en-IN')} positive</div></div>`
    }
    const c = t.tone === 'neg' ? '#DC2626' : t.tone === 'mixed' ? '#F59E0B' : t.tone === 'pos' ? '#16A34A' : '#64748B'
    return `<span class="sc-chip" style="display:inline-block;margin:3px 4px 0 0;color:${c};background:${c}18;font-size:11px;padding:3px 8px">${_esc(t.label)}</span>`
  }).join('')
  return `<div class="sc-rc">
    <div class="sc-rc-k">${_esc(I.source)} · all reviews</div>
    <div class="sc-rc-sub" style="margin:2px 0 4px">The store's own summary of every review. Not checked for fakes.</div>
    ${I.summary ? `<p class="sc-ai-box-txt" style="margin:4px 0 6px">${_esc(I.summary)}</p>` : ''}
    ${rows}
  </div>`
}
function _reviewResult(r) {
  const S = r.reviewSamples || { checked: 0, real: [], fake: [], unclear: [] }
  const A = r.reviewAspects
  const fake  = r.fakeReviewPercent
  const has   = fake != null
  const c     = !has ? '#9CA3AF' : fake<20?'#16A34A':fake<50?'#CA8A04':'#DC2626'
  const risk  = !has ? 'N/A' : fake<20?'LOW RISK':fake<50?'MEDIUM':'HIGH RISK'
  const total = r.totalReviews||0
  const worst = _shownAspects(A).filter(a => a.neg > a.pos && a.mentions >= 3).sort((x, y) => y.neg - x.neg)[0]
  const quote = (x, kind) => `
    <div class="sc-rv ${kind}">
      <p class="sc-rv-txt">“${_esc(x.text.length > 260 ? x.text.slice(0, 257) + '…' : x.text)}”</p>
      ${x.why ? `<p class="sc-rv-why">${kind === 'real' ? '✓' : kind === 'fake' ? '⚠' : '·'} ${_esc(x.why)}</p>` : ''}
    </div>`
  const group = (title, list, kind, open) => list.length ? `
    <details class="sc-rv-group ${kind}"${open ? ' open' : ''}>
      <summary><span class="sc-rv-dot ${kind}"></span>${title} <b>${list.length}</b></summary>
      ${list.map(x => quote(x, kind)).join('')}
    </details>` : ''
  const insight = has
    ? `Across all ${total.toLocaleString('en-IN')} ratings, about ${fake}% look suspicious from the rating pattern.`
    : 'The rating-pattern check could not run for this scan, so it was left out of the Trust Score.'
  return `
    ${_rHead(P.search,'#7C3AED','rgba(124,58,237,0.15)','Reviews','Real vs fake · what buyers say',risk,c)}
    ${_reviewCountsHTML(r, S)}
    ${r.reviewSpike?.spike ? `<div class="sc-rwarn" style="background:#FEF2F2;color:#B91C1C">⚠ ${_esc(r.reviewSpike.note)}</div>` : ''}
    ${worst ? `<div class="sc-rwarn" style="background:#FFFBEB;color:#B45309">⚠ ${_esc(worst.label)}: ${worst.neg} of ${worst.mentions} buyers unhappy</div>` : ''}
    ${_aspectsHTML(A, S)}
    ${_storeInsightsHTML(r.storeInsights)}
    ${group('Real reviews — read these', S.real, 'real', !A || !_shownAspects(A).length)}
    ${group('Flagged as fake', S.fake, 'fake', false)}
    ${group('Too short to judge', S.unclear, 'unclear', false)}
    ${_aiBox(insight)}
    ${has ? _verdict(fake<20?'Reviews look genuine — rating looks trustworthy':fake<50?'Partly inflated — trust the real reviews above':'Reviews unreliable — do not trust the star rating',fake<20?'green':fake<50?'yellow':'red') : ''}
  `
}
// Tap a topic → every quote behind it (good / bad / mixed), back returns to the Reviews view
function _aspectDetailHTML(a) {
  const by = k => (a.quotes || []).filter(q => q.pol === k)
  const sec = (title, k) => by(k).length ? `<div class="sc-rc-k" style="margin-top:4px">${title} (${by(k).length})</div>${by(k).map(q => `<div class="sc-rq ${k}">“${_esc(q.text)}”<em>Real-looking review</em></div>`).join('')}` : ''
  return `<div class="sc-result">
    <button class="sc-rlink" data-back="1">← Reviews</button>
    <div class="sc-rc"><div class="sc-rc-k">What buyers say · ${_esc(a.label)}</div>
      <div class="sc-rc-big"><b>${a.mentions}</b><span>real review${a.mentions === 1 ? '' : 's'} give an opinion</span></div>
      <div class="sc-asp" style="cursor:default;padding:4px 0"><div class="sc-asp-l">${_esc(a.label)}<span class="sc-chip ${a.strength}">${a.strength === 'strong' ? 'STRONG' : 'FEW'}</span></div>${_aspBar(a)}<div class="sc-asp-c">${a.pos} of ${a.mentions} positive</div></div>
      <div class="sc-rc-leg"><span><i style="background:#16A34A"></i>${a.pos} good</span><span><i style="background:#DC2626"></i>${a.neg} bad</span><span><i style="background:#F59E0B"></i>${a.mixed} mixed</span></div></div>
    ${sec('Bad', 'neg')}${sec('Mixed', 'mixed')}${sec('Good', 'pos')}
    ${a.quotes?.length < a.mentions ? `<div class="sc-rc-sub">Showing ${a.quotes.length} of ${a.mentions} quotes.</div>` : ''}
    <div class="sc-rc-sub">Only reviews that passed the fake check are listed here.</div>
  </div>`
}
function _setupReviewAspects(cnt) {
  cnt.querySelectorAll('.sc-asp[data-asp]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation()
    const a = (_lastReview?.reviewAspects?.aspects || []).find(x => x.key === el.dataset.asp)
    if (!a) return
    cnt.innerHTML = _aspectDetailHTML(a)
    cnt.scrollTop = 0
    cnt.querySelector('[data-back]')?.addEventListener('click', ev => {
      ev.stopPropagation()
      _showResult(cnt, 'reviews', _lastReview)
    })
  }))
}

/* ── Price (Figma: scancart-price-check frames 02–08) ── */
function _priceResult(r) {
  const cur  = _productData?.price || r.productPrice || 0
  const hist = pickHistory(r.priceHistory, _priceInfo) || _priceInfo
  const d    = hist?.discount || null
  const v    = d ? (d.verdict || _FROM_STATUS[d.status] || 'not_enough_history') : 'not_enough_history'
  _lastVerdict = d
  const sum  = d?.history || null
  const cheaper = (r.priceMatches?.matched || []).some(m => m.price < cur) || (r.bestPrice?.price > 0 && r.bestPrice.price < cur)
  const ok = c => `<span class="sc-pc-dot" style="background:${c}">${c === '#16A34A' ? '✓' : '!'}</span>`
  const G = '#16A34A', A = '#F59E0B'
  const chk = rows => `<div class="sc-pc" style="padding:6px 14px">${rows.map(([c, k, val, vc]) => `<div class="sc-pc-chk">${ok(c)}${k}<b style="color:${vc}">${val}</b></div>`).join('')}</div>`

  // graph stats row (Figma: per verdict)
  _gStats = !sum ? null
    : v === 'good_deal' ? [[_rs(cur), 'Now'], [_rs(sum.avg), 'Average'], [_rs(sum.high), 'Highest']]
    : v === 'wait'      ? [[_rs(d.wasPrice), `Lowest (${d.wasDaysAgo <= 0 ? 'today' : d.wasDaysAgo + ' days ago'})`], [_rs(cur), 'Now'], [String(d.drops || 0), 'Drops']]
    : [[_rs(sum.low), 'Lowest'], [_rs(sum.avg), 'Average'], [_rs(sum.high), 'Highest']]

  let extra = '', cta = ''
  const watchCta = (label) => `<button class="sc-pc-cta purple" data-pc="watch">${label}<i>🔔</i></button>`
  if (v === 'good_deal') {
    extra = chk([[G, 'vs lowest seen', cur <= sum.low ? 'Same' : `${_rs(cur - sum.low)} more`, '#15803D'],
                 [cur <= sum.avg ? G : A, 'vs average', cur === sum.avg ? 'Same' : cur < sum.avg ? `${_rs(sum.avg - cur)} less` : `${_rs(cur - sum.avg)} more`, cur <= sum.avg ? '#15803D' : '#B45309'],
                 [cheaper ? A : G, 'Cheaper on other stores', cheaper ? 'Yes' : 'No', cheaper ? '#B45309' : '#15803D']])
    cta = `<button class="sc-pc-cta" data-pc="close">Buy on ${_esc(_storeName())}<i>›</i></button>`
  } else if (v === 'fair') {
    extra = chk([[A, 'vs lowest seen', `${_rs(cur - sum.low)} more`, '#B45309'],
                 [cur <= sum.avg ? G : A, 'vs average', cur === sum.avg ? 'Same' : cur < sum.avg ? `${_rs(sum.avg - cur)} less` : `${_rs(cur - sum.avg)} more`, cur <= sum.avg ? '#15803D' : '#B45309'],
                 [cheaper ? A : G, 'Cheaper on other stores', cheaper ? 'Yes' : 'No', cheaper ? '#B45309' : '#15803D']])
    cta = `<div class="sc-pc-ctas"><button class="sc-pc-cta ghost" data-pc="watch">Watch price</button><button class="sc-pc-cta" data-pc="close">Buy now<i>›</i></button></div>`
  } else if (v === 'wait') {
    cta = watchCta(`Tell me at ${_rs(d.wasPrice)}`) + `<p class="sc-pc-note" style="text-align:center;margin-top:0">We check every 6 hours and send a ${globalThis.App?.notify ? 'phone' : 'Chrome'} notification.</p>`
  } else if (v === 'fake_discount') {
    cta = `<button class="sc-pc-cta" data-pc="alts">See cheaper options<i>›</i></button>`
  } else {
    cta = watchCta('Watch this price')
  }
  if (globalThis.ReactNativeWebView) cta = cta.replace(/<button class="sc-pc-cta[^"]*" data-pc="watch">[\s\S]*?<\/button>/g, '')   // no alerts in the phone app yet

  return `
    ${_discountHTML(d, hist?.points?.length || 0)}
    ${v === 'not_enough_history' && (hist?.points?.length || 0) < 2 ? '' : _graphHTML(hist?.points, cur, hist?.source, _productData?.mrpPrice || 0)}
    ${extra}${_fakeCard}
    ${_matchesHTML(r.priceMatches, cur)}
    ${_watchHTML()}
    ${cta}
    ${_sourcesHTML(hist)}
  `
}

/* ── Seller ── */
function _sellerResult(r) {
  const rat   = r.sellerRating || 0
  const ver   = r.sellerVerified
  const risk  = r.counterfeitRisk || 'low'
  const type  = r.sellerType || 'unknown'
  const sig   = r.sellerTrustSignals || {}
  const warn  = risk === 'medium' || risk === 'high' || risk === 'critical'
  const c     = rat >= 4 ? '#16A34A' : rat >= 3 ? '#CA8A04' : '#DC2626'

  const LABEL = {
    brand_official:      ["Brand's official store", 'OFFICIAL',  '#16A34A'],
    authorized_reseller: ['Known large seller',     'VERIFIED',  '#16A34A'],
    established_3p:      ['Established seller',     'TRUSTED',   '#16A34A'],
    not_listed:          ['Not in our list yet',    'NO WARNINGS','#64748B'],
    new_3p:              ['New seller',             'CHECK',     '#CA8A04'],
    suspicious:          ['Suspicious seller',      'WARNING',   '#DC2626'],
    unknown:             ['Seller not shown',       'UNKNOWN',   '#64748B'],
  }
  const [label, chip0, chipClr0] = LABEL[type] || LABEL.unknown
  const chip    = warn ? (risk === 'medium' ? 'CHECK' : 'WARNING') : chip0
  const chipClr = warn ? (risk === 'medium' ? '#CA8A04' : '#DC2626') : chipClr0

  const signals = [
    sig.fulfilled  ? 'Fulfilled by the store' : null,
    sig.brandStore ? "Brand's store page" : null,
    sig.choice     ? 'Store badge (Choice / Assured)' : null,
    sig.bought     ? `${sig.bought}+ bought last month` : null,
    sig.goodRatings ? 'Good ratings' : null,
  ].filter(Boolean)

  const insight = r.sellerHistory || r.analysis?.sellerHistory || `${r.sellerName || 'This seller'}: ${label}.`
  const verdict = risk === 'critical' || risk === 'high'
    ? ['Warning signs on this listing — check the seller before buying', 'red']
    : risk === 'medium' ? ['Some doubts — check the seller’s rating and reviews', 'yellow']
    : ver || type === 'established_3p' || type === 'brand_official' ? ['Seller looks fine', 'green']
    : ['No warning signs — seller just isn’t in our list yet', 'green']

  return `
    ${_rHead(P.shield,'#2563EB','rgba(37,99,235,0.1)','Seller Trust', _esc(r.sellerName || 'Seller'), chip, chipClr)}
    ${_stats([rat > 0 ? `${rat}/5` : '—','Seller rating',rat > 0 ? c : '#94A3B8'],[_esc(label),'Seller type',chipClr0],[risk.toUpperCase(),'Risk',risk==='low'?'#16A34A':risk==='medium'?'#CA8A04':'#DC2626'])}
    ${signals.length ? `<div class="sc-sum-badges">${signals.map(t => `<span class="sc-sum-badge" style="color:#15803D;background:#F0FDF4">✓ ${t}</span>`).join('')}</div>` : ''}
    ${_aiBox(_esc(insight))}
    ${_verdict(verdict[0], verdict[1])}
  `
}

/* ── Alternatives ── */
// Same product on other sites, each with its own rating + review check (backend: services/sameProduct.js)
const _REV = {
  mostly_real: ['green', 'Mostly real reviews'],
  mixed:       ['amber', 'Mixed: check reviews'],
  many_fake:   ['red',   'Many reviews look fake'],
  too_few:     ['grey',  'Too few reviews to judge'],
}
function _sameProductHTML(sp) {
  if (!sp) return ''
  const cur = _productData?.price || 0
  const STORE = { amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra' }
  const fmtN = n => n >= 1e5 ? (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
  const sr = _scan?.result
  // This page, for comparison (from the main scan when it has run)
  const here = `<div class="sc-sp-card here"><div class="sc-sp-top"><span class="sc-sp-store">${_esc(_storeName())}</span><span class="sc-pc-pill blue">YOU'RE HERE</span><span class="sc-sp-price">${cur ? _rs(cur) : '—'}</span></div>
    <div class="sc-sp-stats"><div><b>${_productData?.rating ? `${_productData.rating}★` : '—'}</b><span>rating</span></div><div><b>${_productData?.numRatings ? fmtN(_productData.numRatings) : '—'}</b><span>ratings</span></div>
    <div><b>${sr?.fakeReviewPercent != null ? `${sr.fakeReviewPercent}%` : '—'}</b><span>fake reviews</span></div></div>
    ${sr?.fakeReviewPercent == null ? '<div class="sc-sp-line"><span>Open the Reviews tab to check this page\'s reviews.</span></div>' : ''}</div>`

  const cards = (sp.listings || []).map(l => {
    const R = l.reviews, [rc, rlabel] = R ? (_REV[R.verdict] || _REV.too_few) : ['grey', l.pageRead ? 'No review text on the page' : "Couldn't read this page"]
    const d = l.diff || 0
    const priceNote = !cur ? '' : d < 0 ? `<small style="color:#16A34A">${_rs(-d)} cheaper</small>` : d > 0 ? `<small style="color:#DC2626">${_rs(d)} more</small>` : '<small style="color:#64748B">same price</small>'
    const bar = R ? `<div class="sc-sp-bar" aria-label="${R.realPercent}% real, ${R.unclearPercent}% unclear, ${R.fakePercent}% fake"><i style="width:${R.realPercent}%;background:#16A34A"></i><i style="width:${R.unclearPercent}%;background:#CBD5E1"></i><i style="width:${R.fakePercent}%;background:#DC2626"></i></div>
      <div class="sc-sp-leg"><span>Real <b style="color:#15803D">${R.realPercent}%</b></span><span>Unclear ${R.unclearPercent}%</span><span>Fake <b style="color:#DC2626">${R.fakePercent}%</b></span></div>` : ''
    return `<div class="sc-sp-card">
      <div class="sc-sp-top"><span class="sc-sp-store">${_esc(STORE[l.platform] || l.platform)}</span>
        <span class="sc-pc-pill ${l.otherColour ? 'amber' : l.how === 'exact' ? 'green' : 'blue'}">${l.otherColour ? 'OTHER COLOUR' : l.how === 'exact' ? 'SAME MODEL' : _esc(String(l.how).toUpperCase())}</span>
        <span class="sc-sp-price">${_rs(l.price)}${priceNote}</span></div>
      <div class="sc-sp-name" title="${_esc(l.name)}">${_esc(l.name)}</div>
      <div class="sc-sp-stats"><div><b>${l.rating ? `${l.rating}★` : '—'}</b><span>rating</span></div><div><b>${l.ratingCount ? fmtN(l.ratingCount) : '—'}</b><span>ratings</span></div>
        <div><b>${R ? R.checked : '—'}</b><span>reviews checked</span></div></div>
      <div class="sc-sp-line" style="margin-top:10px"><span class="sc-pc-pill ${rc}">${rlabel.toUpperCase()}</span></div>
      ${bar}
      ${l.ratingCheck ? `<div class="sc-sp-line">${l.ratingCheck.ok ? '✓' : '⚠️'} ${_esc(l.ratingCheck.note)}</div>` : ''}
      ${R?.liked?.length ? `<div class="sc-sp-line"><span>Buyers like:</span> ${R.liked.map(_esc).join(', ')}</div>` : ''}
      ${R?.disliked?.length ? `<div class="sc-sp-line"><span>Complaints:</span> ${R.disliked.map(_esc).join(', ')}</div>` : ''}
      ${l.seller ? `<div class="sc-sp-line"><span>Seller:</span> ${_esc(l.seller)}${l.fulfilled ? ' · Fulfilled by Amazon' : ''}</div>` : ''}
      ${R?.quote ? `<div class="sc-sp-quote">"${_esc(R.quote)}"</div>` : ''}
      <button class="sc-sp-open" data-href="${_esc(l.url)}">Open on ${_esc(STORE[l.platform] || l.platform)}<i>↗</i></button>
    </div>`
  }).join('')

  return `<p class="sc-opt-head" style="margin:4px 2px 0">Same product on other sites</p>
    <div class="sc-sp">${here}${cards || `<div class="sc-sp-card"><div class="sc-sp-line"><span>${_esc(sp.note || 'Not found on other sites.')}</span></div></div>`}</div>
    <p class="sc-store-note">ScanCart checks Amazon for the exact same product (same storage, size and colour) and reads each listing's own rating and reviews. Review labels are rule-based estimates, not proof. Flipkart and Myntra block these checks, so use the store list below to search there.</p>`
}

function _storesHTML() {
  const stores = whereToBuy({ ..._productData, platform: _productData?.platform })
  if (!stores.length) return ''
  return `
    <p class="sc-opt-head" style="margin:4px 2px 0">Where to buy this product</p>
    <div class="sc-alt-grid" id="sc-store-grid">
      ${stores.map(st => `
        <div class="sc-alt-item sc-store" data-href="${_esc(st.url)}">
          <div class="sc-store-rate" style="background:${st.rating >= 4.5 ? '#16A34A' : st.rating >= 4 ? '#2563EB' : '#CA8A04'}">${st.rating.toFixed(1)}<span>/5</span></div>
          <div class="sc-alt-info">
            <div class="sc-alt-name">${_esc(st.name)}</div>
            <div class="sc-alt-badges">
              ${st.official ? '<span class="sc-alt-type-tag" style="background:#F0FDF4;color:#16A34A">OFFICIAL</span>' : ''}
              ${st.here ? '<span class="sc-alt-type-tag" style="background:#EFF6FF;color:#2563EB">YOU’RE HERE</span>' : ''}
            </div>
            <div class="sc-alt-reason">${st.points.map(_esc).join(' · ')}</div>
          </div>
          <div class="sc-alt-arrow">${_ic(P.extlink, 14, '#64748B')}</div>
        </div>`).join('')}
    </div>
    <p class="sc-store-note">ScanCart store rating = genuine-product guarantee, brand warranty, returns and seller control. It rates the store, not today’s price — tap to search this product there.</p>`
}

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
    ? `Found ${realAlts.length} alternative${realAlts.length > 1 ? 's' : ''} on Indian e-commerce${bestSave > 0 ? ` — best saves ₹${bestSave.toLocaleString('en-IN')}` : ''}. Click any card to view.`
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
                  ? `<span class="sc-alt-price-val">${a.priceIsEstimate ? '~' : ''}₹${a.price.toLocaleString('en-IN')}${a.priceIsEstimate ? ' <small style="font-weight:500;opacity:.7">est.</small>' : ''}</span>
                     ${save > 0 ? `<span class="sc-alt-save">${a.priceIsEstimate ? 'Maybe save' : 'Save'} ₹${save.toLocaleString('en-IN')}</span>` : ''}`
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
    ${_rHead(P.bulb, '#CA8A04', 'rgba(234,179,8,0.1)', 'Where to buy & alternatives', 'Trusted stores + similar products',
      hasReal
        ? (bestSave > 0 ? `SAVE ₹${bestSave.toLocaleString('en-IN')}` : `${realAlts.length} FOUND`)
        : alts.length > 0 ? 'EXPLORE' : 'NONE FOUND',
      '#CA8A04')}
    ${_sameProductHTML(r.sameProduct)}
    ${_storesHTML()}
    <p class="sc-opt-head" style="margin:6px 2px 0">Similar products${r.altFailed ? ' — search didn’t finish, try again later' : ''}</p>
    <div class="sc-alt-grid" id="sc-alt-grid">${cardsHTML}</div>
    ${_aiBox(insight)}
    ${hasReal
      ? _verdict(bestSave > 0 ? `Save up to ₹${bestSave.toLocaleString('en-IN')} with these alternatives` : `${realAlts.length} alternative${realAlts.length > 1 ? 's' : ''} found — compare and choose`, 'green')
      : alts.length > 0
      ? _verdict('Click any card to explore alternatives on Amazon or Flipkart', 'yellow')
      : _verdict('No alternatives found — this may be a unique or niche product', 'yellow')}
  `
}

function _setupAltCards() {
  for (const id of ['sc-alt-grid', 'sc-store-grid']) {
    const grid = _shadowRoot.getElementById(id)
    if (!grid) continue
    grid.addEventListener('click', e => {
      const card = e.target.closest('[data-href]')
      if (card && card.dataset.href) window.open(card.dataset.href, '_blank', 'noopener')
    })
  }
}

/* ── Warning signs (from the backend's verdict evidence) for scores below "safe" ── */
function _warnList(r, score) {
  if (score >= 70) return ''
  const v = (r.aiSummary || []).find(s => s.id === 'verdict')
  const pts = (v?.points || []).slice(1)
    .filter(p => !/could not run|Mixed signals|No significant negative/i.test(p))
    .map(p => p.replace(/^[a-zA-Z]+:\s*/, ''))
    .slice(0, 3)
  if (!pts.length) return ''
  const c = score >= 45 ? '#D97706' : '#DC2626', bg = score >= 45 ? '#FFFBEB' : '#FEF2F2'
  return `<div class="sc-warns">${pts.map(p => `<div class="sc-warn"><span class="sc-warn-ic" style="background:${bg}">${_ic(P.alert, 13, c)}</span><span>${_esc(p)}</span></div>`).join('')}</div>`
}

/* ── Summary ── */
function _summaryResult(r) {
  const score = r.trustScore || 0
  const c     = score >= 70 ? '#16A34A' : score >= 45 ? '#CA8A04' : '#DC2626'
  const fake  = r.fakeReviewPercent
  const ver   = r.sellerVerified
  const sellerKnown = ver != null
  const risk  = r.counterfeitRisk || 'low'

  // Seller badge: unverified OR medium/high/critical risk → always show as caution/unverified,
  // never show "Seller Verified" when the Seller Trust section would show UNVERIFIED.
  // Seller badge follows real warning signs, not "is the seller in our list"
  const sellerWarn   = ['medium', 'high', 'critical'].includes(r.counterfeitRisk)
  const sellerBadge  = !sellerKnown ? 'Seller Unknown' : sellerWarn ? (r.counterfeitRisk === 'medium' ? 'Check Seller' : 'Seller Warning') : ver ? 'Seller Verified' : 'Seller OK'
  const sellerClr    = !sellerKnown ? '#9CA3AF' : sellerWarn ? (r.counterfeitRisk === 'medium' ? '#CA8A04' : '#DC2626') : '#2563EB'
  const sellerBg     = !sellerKnown ? 'rgba(156,163,175,0.1)' : sellerWarn ? (r.counterfeitRisk === 'medium' ? 'rgba(234,179,8,0.1)' : 'rgba(220,38,38,0.1)') : 'rgba(37,99,235,0.1)'

  const reviewsOK    = fake != null && fake < 30
  const hasSavings   = (r.savings || 0) > 0

  // Add a note if seller is unverified but overall score looks high — prevent misleading AUTHENTIC
  const sellerWarning = ''

  const insight = r.analysis?.authenticity
    ? `${r.analysis.authenticity}${sellerWarning}`
    : `Trust Score: ${score}/100. ${score>=70?'Product appears genuine.':score>=40?'Proceed with caution.':'High risk — avoid.'} ${sellerWarning}`

  return `
    ${_rHead(score >= 70 ? P.shield : P.alert,c,c+'1A',score >= 70 ? 'Safe to buy' : score >= 45 ? 'Buy with caution' : 'Do not buy',`${r.checksCompleted ?? 6} of ${r.checksTotal ?? 6} checks completed`,`${score}/100`,c)}
    ${_trustBar(score)}
    ${_stats([fake == null ? '—' : `${fake}%`,'Fake Reviews',fake == null ? null : reviewsOK?'#16A34A':'#DC2626'],[r.sellerRating == null ? '—' : `${r.sellerRating}/5`,'Seller',null],[hasSavings?`₹${(r.savings||0).toLocaleString('en-IN')}`:'Fair','Price','#16A34A'])}
    ${_warnList(r, score)}
    ${_aiBox(insight)}
    <div class="sc-sum-badges">
      <span class="sc-sum-badge" style="color:${reviewsOK?'#16A34A':'#DC2626'};background:${reviewsOK?'rgba(22,163,74,0.1)':'rgba(220,38,38,0.1)'}">Reviews ${reviewsOK?'OK':'Suspicious'}</span>
      <span class="sc-sum-badge" style="color:${sellerClr};background:${sellerBg}">${sellerBadge}</span>
      <span class="sc-sum-badge" style="color:${hasSavings?'#16A34A':'#CA8A04'};background:${hasSavings?'rgba(22,163,74,0.1)':'rgba(234,179,8,0.1)'}">${hasSavings?'Save Money':'Fair Price'}</span>
    </div>
    ${score < 45 ? '<button class="sc-trusted-btn">See trusted stores for this product</button>' : ''}
    ${_verdict(score>=70?`Safe to buy — green light from ${_aiOn ? 'our AI' : 'ScanCart’s checks'}`:score>=45?'Proceed with caution — verify key details':'Avoid this product — multiple risk signals',score>=70?'green':score>=45?'yellow':'red')}
  `
}

/* ═══════════════════════════════════════════════
   PANEL CONTROLS
═══════════════════════════════════════════════ */
function _showPanel()   { _renderStrip(); _shadowRoot?.getElementById('sc-panel')?.classList.add('open'); _shadowRoot?.getElementById('sc-backdrop')?.classList.add('on') }
function _hidePanel()   { _shadowRoot?.getElementById('sc-panel')?.classList.remove('open'); _shadowRoot?.getElementById('sc-backdrop')?.classList.remove('on') }
function _togglePanel() { _shadowRoot?.getElementById('sc-panel')?.classList.contains('open') ? _hidePanel() : _showPanel() }


/* ═══════════════════════════════════════════════
   PRICE HISTORY · DISCOUNT CHECK · WATCH (v1.1)
═══════════════════════════════════════════════ */
const _rs = (n) => '₹' + Math.round(n).toLocaleString('en-IN')

// Figma frames 02–06: first scan · Good deal · Fair price · Wait · Fake discount
const _PC = {
  good_deal:          ['green', 'GOOD DEAL',     '✅'],
  fair:               ['blue',  'FAIR PRICE',    '👌'],
  wait:               ['amber', 'WAIT',          '⏳'],
  fake_discount:      ['red',   'FAKE DISCOUNT', '🚩'],
  not_enough_history: ['grey',  'JUST STARTED',  '📈'],
}
const _FROM_STATUS = { fake_sale: 'fake_discount', new_low: 'good_deal', usual: 'fair', above_usual: 'wait' }
let _fakeCard = ''
function _discountHTML(d, readings = 0) {
  _fakeCard = ''
  if (!d) return ''
  const v = d.verdict || _FROM_STATUS[d.status] || 'not_enough_history'
  const [cls, pill, emoji] = _PC[v] || _PC.not_enough_history
  const title = d.title || ({ good_deal: 'Real deal: lowest price seen', fair: 'Usual price', wait: 'Higher than usual', fake_discount: 'Sale looks fake' }[v] || 'Price history is just starting')
  let extra = ''
  if (v === 'fake_discount' && d.claimedDiscountPercent != null) {
    _fakeCard = `<div class="sc-pc sc-pc-real" style="margin-top:0;border-top:1px solid #E2E8F0;padding-top:14px"><div class="sc-pc-k" style="display:flex">What the discount really is</div>
      <div><span>Store says</span><s style="color:#94A3B8">${d.claimedDiscountPercent}% off</s></div>
      <div><b>Real saving</b><b style="color:#DC2626">${d.realSavingPercent || 0}% · ${_rs(d.realSavingAmount || 0)}</b></div>
      <div class="sc-pc-bar"><span style="width:${Math.max(2, Math.min(100, d.realSavingPercent || 0))}%"></span></div></div>`
  }
  if (v === 'not_enough_history') {
    const n = Math.max(1, Math.min(14, readings || d.readings || 1))
    extra = `<div class="sc-pc-reads" aria-label="${n} of 14 price readings">${Array.from({ length: 14 }, (_, i) => `<span class="${i < n ? 'on' : ''}"></span>`).join('')}</div>
      <div class="sc-pc-note">${n} price reading${n > 1 ? 's' : ''} so far · a verdict needs 3 over 2+ days. Watched products are re-checked every 6 hours.</div>`
  }
  return `<div class="sc-pc ${cls}"><div class="sc-pc-top"><span class="sc-pc-emoji">${emoji}</span><div><span class="sc-pc-pill ${cls}">${pill}</span><div class="sc-pc-title">${_esc(title)}</div></div></div>
    <p class="sc-pc-msg">${_esc(d.message || '')}</p>${extra}</div>`
}

// Figma frame 07: same product on other stores, and what was left out (variant rules)
function _matchesHTML(m, cur) {
  if (!m || (!m.matched?.length && !m.excluded?.length)) return ''
  const STORE = { amazon: 'Amazon', flipkart: 'Flipkart', myntra: 'Myntra' }
  const row = (a) => `<div class="sc-pc-row"${a.url ? ` data-href="${_esc(a.url)}" style="cursor:pointer"` : ''}>`
  const ok = (m.matched || []).map(a => `${row(a)}<span class="nm" title="${_esc(a.name)}">${_esc(STORE[a.platform] || a.platform)}</span>
      <span class="sc-pc-pill ${a.how === 'exact' ? 'green' : 'blue'}">${a.how === 'exact' ? 'Same model' : _esc(a.how)}</span>
      <span class="pr" style="color:${a.price < cur ? '#16A34A' : '#0F172A'}">${_rs(a.price)}</span></div>`).join('')
  const out = (m.excluded || []).map(a => `${row(a)}<span class="sc-pc-x">✕</span><div style="min-width:0;flex:1"><div class="nm" title="${_esc(a.name)}">${_esc(a.name)}</div><div class="why">${_esc(a.reason)}</div></div>
      <span class="pr" style="color:#94A3B8;font-weight:600">${_rs(a.price)}</span></div>`).join('')
  return `${ok ? `<div class="sc-pc"><div class="sc-pc-k">Same product elsewhere <b class="sc-pc-pill green">${m.matched.length} matched</b></div>${ok}</div>` : ''}
    ${out ? `<div class="sc-pc"><div class="sc-pc-k">Not the same, left out <b class="sc-pc-pill grey">${m.excluded.length}</b></div>${out}
      <p class="sc-pc-note">ScanCart only compares when brand, model, storage, size, quantity and colour all match.</p></div>` : ''}`
}

// Figma frames 01 + 08: where these prices come from + what ScanCart read from this page
function _sourcesHTML(hist) {
  const d = _productData || {}, ids = d.productIds || {}
  const read = [['Store ID', ids.storeId], ['Barcode (GTIN)', ids.gtin], ['Model', ids.model], ['Variant', [ids.color, ids.size].filter(Boolean).join(' · ')],
    ['Price now', d.price ? _rs(d.price) : null], ['MRP shown', d.mrpPrice > d.price ? _rs(d.mrpPrice) : null], ['Seller', typeof d.seller === 'string' ? d.seller : d.seller?.name]]
    .filter(([, val]) => val)
  const n = hist?.points?.length || 0, shared = hist?.source === 'shared'
  const src = (ic, t, desc, count, cls, id = '') => `<div class="sc-pc-src"><span class="ic">${ic}</span><div><div class="t">${t}</div><div class="d">${desc}</div></div><span class="sc-pc-pill ${cls}"${id ? ` id="${id}"` : ''}>${count}</span></div>`
  return `<div class="sc-pc"><details><summary class="sc-pc-k">Where these prices come from <b style="color:#2563EB">Show</b></summary>
    ${src('👤', shared ? 'ScanCart users' : `This ${globalThis.ReactNativeWebView ? 'phone' : 'browser'}`, 'Saved each time this product is opened', n, 'blue')}
    ${src('↻', 'Re-check', 'Every 6 hours for products you watch', _lastWatch ? 'On' : 'Off', _lastWatch ? 'green' : 'grey', 'sc-pc-recheck')}
    ${src('🔎', 'Shopping search', 'Prices on other stores, same product only', '—', 'grey')}
    <div class="sc-pc-k" style="margin-top:14px">Read from this page <b class="sc-pc-pill ${d.sources?.jsonLd ? 'blue' : 'grey'}">${d.sources?.jsonLd ? 'Page data (JSON-LD)' : 'Page layout'}</b></div>
    <div style="margin-top:4px">${read.map(([k, val]) => `<div class="sc-pc-chk"><span class="sc-pc-dot" style="background:${k === 'MRP shown' ? '#F59E0B' : '#16A34A'}">${k === 'MRP shown' ? '!' : '✓'}</span>${k}<b>${_esc(String(val).slice(0, 40))}</b></div>`).join('')}</div>
    <p class="sc-pc-note">We use the store's own product data and prices seen by users. These IDs are how ScanCart finds the same product on other stores.</p>
  </details></div>`
}

// Price graph, dashboard style: stat row, range pills (7 / 14 / 30 / 90 days), grid with a day axis,
// blue = price that day, black = lowest price so far; hover / tap shows that day's prices.
const _INK = '#0F172A', _BLUE = '#2563EB'
let _gState = null   // { days:[{t, price, low}], cur, mrp, source }
const _day = (t, o = { day: 'numeric', month: 'short' }) => new Date(t).toLocaleDateString('en-IN', o)

// One value per calendar day: the last price seen that day, days with no visit carry the last price
function _dailySeries(points) {
  const pts = (points || []).filter(p => p.price > 0).sort((a, b) => a.t - b.t)
  if (!pts.length) return []
  const start = new Date(pts[0].t); start.setHours(0, 0, 0, 0)
  const end = new Date(); end.setHours(0, 0, 0, 0)
  const byDay = new Map()
  const mrpDay = new Map()
  pts.forEach(p => { const d = new Date(p.t); d.setHours(0, 0, 0, 0); byDay.set(+d, p.price); if (p.mrp > 0) mrpDay.set(+d, p.mrp) })
  const out = []; let last = null, low = Infinity, lastMrp = null
  for (let t = +start; t <= +end; t += 86400e3) {
    const seen = byDay.has(t)
    if (seen) last = byDay.get(t)
    if (last == null) continue
    low = Math.min(low, last)
    if (mrpDay.has(t)) lastMrp = mrpDay.get(t)
    out.push({ t, price: last, low, seen, mrp: lastMrp })
  }
  return out
}

function _graphHTML(points, current, source, mrp) {
  const series = _dailySeries(points)
  const cur = current || series[series.length - 1]?.price || 0
  _gState = { series, cur, mrp, source, range: Math.min(90, Math.max(7, series.length <= 7 ? 7 : series.length <= 14 ? 14 : series.length <= 30 ? 30 : 90)) }
  if (!series.length) {
    return `<div class="sc-graph sc-g"><div class="sc-g-title">Price history</div><p class="sc-watch-note" style="margin-top:6px">No prices saved yet. ScanCart saves the price each time this page is opened, so the graph fills in over the coming days.</p></div>`
  }
  return `<div class="sc-graph sc-g" id="sc-g">${_graphInner()}</div>`
}

function _graphInner() {
  const { series: all, cur, mrp, source, range } = _gState
  const since = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d - (range - 1) * 86400e3 })()
  const S = all.filter(p => p.t >= since)
  const prices = S.map(p => p.price)
  const showMrp = _lastVerdict?.verdict === 'fake_discount' && S.some(p => p.mrp > 0)
  const lo = Math.min(...prices, cur), hi = Math.max(...prices, cur, ...(showMrp ? S.map(p => p.mrp || 0) : []))
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
  const vsAvg = avg ? Math.round((cur - avg) / avg * 100) : 0
  const lowDay = S.find(p => p.price === lo)
  const from = source === 'shared' ? 'Prices seen by ScanCart users' : `Prices seen by you on this ${globalThis.ReactNativeWebView ? 'phone' : 'browser'}`
  const pill = [7, 14, 30, 90].map(n => `<button class="sc-g-pill${n === range ? ' on' : ''}" data-range="${n}">${n}d</button>`).join('')
  const arrow = vsAvg < 0 ? '↓' : vsAvg > 0 ? '↑' : '•'

  // chart geometry (fixed scale: text stays sharp)
  const W = 330, H = 170, L = 40, R = 10, T = 14, B = 24
  const t0 = since, t1 = Math.max(S[S.length - 1].t, t0 + 86400e3)
  const step = (() => { const r = (hi - lo) || hi * 0.1 || 10; const raw = r / 4; const m = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(k => k * m).find(k => k >= raw) })()
  const yMin = Math.max(0, Math.floor(lo / step) * step - (lo % step ? 0 : step)), yMax = Math.ceil(hi / step) * step + (hi % step ? 0 : step)
  const x = t => L + (W - L - R) * ((t - t0) / (t1 - t0))
  const y = v => T + (H - T - B) * (1 - (v - yMin) / (yMax - yMin))
  const line = key => S.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ')
  const yt = []; for (let v = yMin; v <= yMax + 0.01; v += step) yt.push(v)
  const nDays = Math.round((t1 - t0) / 86400e3) + 1
  const every = nDays <= 8 ? 1 : nDays <= 15 ? 2 : nDays <= 31 ? 5 : 15
  const xt = []; for (let t = t1; t >= t0 - 1; t -= 86400e3 * every) xt.unshift(t)   // counted back from today, so today is always labelled
  const fmt = v => v >= 1e5 ? (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L' : v >= 1e3 ? (v / 1e3).toFixed(v % 1000 ? 1 : 0) + 'k' : String(v)
  const svg = `<svg class="sc-g-svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block" role="img" aria-label="Price from ${_day(t0)} to ${_day(t1)}: low ${_rs(lo)}, high ${_rs(hi)}">
    ${yt.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E2E8F0"/><text x="${L - 8}" y="${y(v) + 3.5}" text-anchor="end" font-size="10" fill="#94A3B8">${fmt(v)}</text>`).join('')}
    ${xt.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}" stroke="#E2E8F0" stroke-dasharray="3 3"/><text x="${x(t)}" y="${H - 7}" text-anchor="middle" font-size="10" fill="#94A3B8">${new Date(t).getDate()}</text>`).join('')}
    <path d="${line('price')} L${x(S[S.length - 1].t)} ${H - B} L${x(S[0].t)} ${H - B} Z" fill="${_BLUE}" fill-opacity="0.07"/>
    ${showMrp ? (() => { const M = S.filter(p => p.mrp > 0); const up = M.find((p, i) => i && p.mrp >= M[0].mrp * 1.1); return `<path d="${M.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.mrp).toFixed(1)}`).join(' ')}" fill="none" stroke="#DC2626" stroke-width="1.8" stroke-dasharray="5 4"/>` + (up ? `<circle cx="${x(up.t).toFixed(1)}" cy="${y(up.mrp).toFixed(1)}" r="4" fill="#DC2626"/><text x="${Math.max(L + 50, Math.min(W - R - 50, x(up.t))).toFixed(1)}" y="${(y(up.mrp) - 8).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#DC2626">MRP raised to ${_rs(up.mrp)}</text>` : '') })() : ''}
    <path d="${line('price')}" fill="none" stroke="${_BLUE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    ${lowDay && !showMrp ? `<circle cx="${x(lowDay.t).toFixed(1)}" cy="${y(lo).toFixed(1)}" r="4" fill="#16A34A"/><text x="${Math.min(W - R, Math.max(L + 30, x(lowDay.t))).toFixed(1)}" y="${(y(lo) + 15 > H - B ? y(lo) - 8 : y(lo) + 15).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="800" fill="#15803D" paint-order="stroke" stroke="#fff" stroke-width="3">Lowest ${_rs(lo)}</text>` : ''}
    ${S.filter(p => p.seen).map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.price).toFixed(1)}" r="2.6" fill="#fff" stroke="${_BLUE}" stroke-width="1.6"/>`).join('')}
    <g class="sc-g-hover" style="display:none"><line y1="${T}" y2="${H - B}" stroke="${_INK}" stroke-width="1.2"/><rect class="sc-g-dp" width="6" height="6" fill="#fff" stroke="${_BLUE}" stroke-width="1.5"/><rect class="sc-g-dl" width="6" height="6" fill="#fff" stroke="${_INK}" stroke-width="1.5"/><text class="sc-g-dx" text-anchor="middle" font-size="10" font-weight="800" fill="${_INK}" y="${H - 7}"></text></g>
    <rect class="sc-g-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
  </svg>`
  return `
    <div class="sc-g-head"><div class="sc-pc-k">Price, last ${range} days</div><div class="sc-g-pills">${pill}</div></div>
    <div class="sc-g-wrap">${svg}<div class="sc-g-tip" style="display:none"></div></div>
    <div class="sc-g3">${(_gStats || [[_rs(lo), 'Lowest'], [_rs(avg), 'Average'], [_rs(hi), 'Highest']]).map(([val, k]) => `<div><b>${val}</b><span>${k}</span></div>`).join('')}</div>
    <div class="sc-rc-sub" style="margin-top:6px;text-align:center">${mrp > cur ? `MRP ${_rs(mrp)} · ` : ''}${from}${all.length < 3 ? ' · fills in as you visit on more days' : ''}</div>`
}

function _setupGraph(cnt) {
  const box = cnt.querySelector('#sc-g'); if (!box || !_gState?.series?.length) return
  const wire = () => {
    box.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); _gState.range = +b.dataset.range; box.innerHTML = _graphInner(); wire() }))
    const svg = box.querySelector('.sc-g-svg'), hit = box.querySelector('.sc-g-hit'), g = box.querySelector('.sc-g-hover'), tip = box.querySelector('.sc-g-tip')
    if (!svg || !hit) return
    const since = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return +d - (_gState.range - 1) * 86400e3 })()
    const S = _gState.series.filter(p => p.t >= since)
    // Map points to screen through the SVG's own coordinates (stays right at any panel width)
    const pathP = svg.querySelectorAll('path')[2]
    const move = ev => {
      const pt = ev.touches?.[0] || ev
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal
      const vx = (pt.clientX - r.left) / r.width * vb.width
      // nearest day by x
      const t0 = since, t1 = Math.max(S[S.length - 1].t, t0 + 86400e3), L = 40, R = 10
      const xOf = t => L + (vb.width - L - R) * ((t - t0) / (t1 - t0))
      let best = S[0]; for (const p of S) if (Math.abs(xOf(p.t) - vx) < Math.abs(xOf(best.t) - vx)) best = p
      const segs = pathP.getAttribute('d').split(/[ML]/).filter(Boolean).map(s => s.trim().split(' ').map(Number))
      const i = S.indexOf(best), [px, py] = segs[i], ly = +svg.querySelectorAll('path')[1].getAttribute('d').split(/[ML]/).filter(Boolean)[i].trim().split(' ')[1]
      g.style.display = ''
      g.querySelector('line').setAttribute('x1', px); g.querySelector('line').setAttribute('x2', px)
      g.querySelector('.sc-g-dp').setAttribute('x', px - 3); g.querySelector('.sc-g-dp').setAttribute('y', py - 3)
      g.querySelector('.sc-g-dl').setAttribute('x', px - 3); g.querySelector('.sc-g-dl').setAttribute('y', ly - 3)
      const dx = g.querySelector('.sc-g-dx'); dx.setAttribute('x', px); dx.textContent = new Date(best.t).getDate()
      // Difference: this date vs the day before and vs today
      const prev = S[i - 1], today = _gState.cur
      const diff = (a, b, label) => {
        const d = a - b
        if (!d) return `<div class="sc-g-tip-x">= same as ${label}</div>`
        return `<div class="sc-g-tip-x"><em class="${d < 0 ? 'dn' : 'up'}">${d < 0 ? '↓' : '↑'} ${_rs(Math.abs(d))} (${Math.abs(Math.round(d / b * 100))}%)</em> vs ${label}</div>`
      }
      const isToday = i === S.length - 1
      tip.innerHTML = `<div class="sc-g-tip-d">${_day(best.t, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}${isToday ? ' · today' : best.seen ? '' : ' · no visit, last price'}</div>
        <div class="sc-g-tip-r"><div><b>${_rs(best.price)}</b><span>Price</span></div><div><b>${_rs(best.low)}</b><span>Lowest so far</span></div></div>
        ${prev ? diff(best.price, prev.price, _day(prev.t)) : ''}${!isToday ? diff(best.price, today, 'today') : ''}`
      tip.style.display = ''
      const left = px / vb.width * r.width, tw = tip.offsetWidth
      const above = py / vb.height * r.height - tip.offsetHeight - 12
      if (above >= 0) {   // room above the point: centred over it (like the reference)
        tip.style.left = Math.max(0, Math.min(r.width - tw, left - tw / 2)) + 'px'
        tip.style.top = above + 'px'
      } else {            // no room: beside the line, so it never covers the point
        tip.style.left = (left + 10 + tw <= r.width ? left + 10 : left - 10 - tw) + 'px'
        tip.style.top = '4px'
      }
    }
    const out = () => { g.style.display = 'none'; tip.style.display = 'none' }
    hit.addEventListener('mousemove', move); hit.addEventListener('touchstart', move, { passive: true }); hit.addEventListener('touchmove', move, { passive: true })
    hit.addEventListener('mouseleave', out)
  }
  wire()
}

function _watchHTML() {
  // Phone app (Expo): Chrome's background alarms aren't there, so price alerts aren't offered yet
  if (globalThis.ReactNativeWebView) return ''
  const cur = _productData?.price || 0
  if (!cur) return ''
  const suggest = _lastVerdict?.verdict === 'wait' && _lastVerdict.wasPrice < cur ? _lastVerdict.wasPrice : Math.round(cur * 0.9)
  return `<div class="sc-watch hide" id="sc-watch">
    <div class="sc-graph-k">Watch this price</div>
    <div class="sc-watch-row" id="sc-watch-form">
      <input id="sc-watch-target" type="number" min="1" inputmode="numeric" placeholder="Alert me at (optional)" value="${suggest}">
      <button class="sc-watch-btn" id="sc-watch-add">Watch</button>
    </div>
    <p class="sc-watch-note" id="sc-watch-note">ScanCart checks this page every 6 hours and sends a ${globalThis.App?.notify ? "phone" : "Chrome"} notification when the price drops or reaches your target.</p>
  </div>`
}

function _setupPriceCtas(cnt) {
  cnt.querySelectorAll('[data-pc]').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation()
    const k = b.dataset.pc
    if (k === 'close') return _hidePanel()
    if (k === 'alts') return _handleOption('alternatives')
    const box = _shadowRoot.getElementById('sc-watch'); if (!box) return
    box.classList.remove('hide')
    // Wait: one tap = alert at the earlier low; otherwise show the target box
    if (_lastVerdict?.verdict === 'wait' && b.classList.contains('purple')) { _shadowRoot.getElementById('sc-watch-add')?.click() }
    else box.querySelector('input')?.focus()
    cnt.querySelectorAll('[data-pc="watch"]').forEach(x => x.remove())
  }))
}

async function _setupWatch() {
  const box = _shadowRoot?.getElementById('sc-watch')
  if (!box) return
  const url = _url()
  const show = (w) => {
    const form = _shadowRoot.getElementById('sc-watch-form'), note = _shadowRoot.getElementById('sc-watch-note')
    if (!w) return
    form.innerHTML = `<button class="sc-watch-btn ghost" id="sc-watch-stop">Stop watching</button>`
    note.textContent = `Watching${w.targetPrice ? ` · alert at ${_rs(w.targetPrice)}` : ' · alert on any drop'}. Started at ${_rs(w.startPrice)}.`
    _shadowRoot.getElementById('sc-watch-stop').addEventListener('click', async (e) => {
      e.stopPropagation(); await removeWatch(w.id)
      try { globalThis.App?.watchesChanged?.() } catch {}
      box.outerHTML = _watchHTML(); _setupWatch()
    })
  }
  const existing = await findWatch(url).catch(() => null)
  _lastWatch = Boolean(existing)
  const rc = _shadowRoot.getElementById('sc-pc-recheck'); if (rc) { rc.textContent = existing ? 'On' : 'Off'; rc.className = `sc-pc-pill ${existing ? 'green' : 'grey'}` }
  if (existing) { box.classList.remove('hide'); _shadowRoot.querySelectorAll('[data-pc="watch"]').forEach(b => b.remove()); return show(existing) }
  _shadowRoot.getElementById('sc-watch-add')?.addEventListener('click', async (e) => {
    e.stopPropagation()
    const target = Number(_shadowRoot.getElementById('sc-watch-target')?.value) || 0
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Saving…'
    try {
      show(await addWatch({ url, productName: _productData?.productName, platform: _productData?.platform, price: _productData?.price, image: _productData?.image }, target))
      const rc = _shadowRoot.getElementById('sc-pc-recheck'); if (rc) { rc.textContent = 'On'; rc.className = 'sc-pc-pill green' }
      try { globalThis.App?.watchesChanged?.() } catch {}   // Android app: start its 6-hourly price check
    } catch { btn.disabled = false; btn.textContent = 'Try again' }
  })
}
