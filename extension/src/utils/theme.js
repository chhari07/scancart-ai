// src/utils/theme.js
// One light / dark setting for the whole of ScanCart: the on-page panel, the toolbar popup and the
// phone apps (they run the same panel). Saved in chrome.storage.local as `scTheme`:
// 'light' | 'dark' | 'system' (default: follow the phone / computer setting).

const KEY = 'scTheme'
const store = () => globalThis.chrome?.storage?.local || null
const sysDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches } catch { return false } }

export async function getThemeSetting() {
  try { const v = (await store()?.get(KEY))?.[KEY]; return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
export const resolveTheme = (setting) => setting === 'dark' || (setting === 'system' && sysDark()) ? 'dark' : 'light'
export async function getTheme() { return resolveTheme(await getThemeSetting()) }

export async function setThemeSetting(v) {
  try { await store()?.set({ [KEY]: v }) } catch {}
  _listeners.forEach(fn => { try { fn(resolveTheme(v)) } catch {} })
}

/** Calls fn('light' | 'dark') whenever the setting changes here, in another ScanCart view, or in the OS. */
const _listeners = new Set()
let _wired = false
export function onThemeChange(fn) {
  _listeners.add(fn)
  if (!_wired) {
    _wired = true
    try {
      globalThis.chrome?.storage?.onChanged?.addListener((ch, area) => {
        if (area === 'local' && ch[KEY]) _listeners.forEach(f => f(resolveTheme(ch[KEY].newValue)))
      })
    } catch {}
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => { const t = await getTheme(); _listeners.forEach(f => f(t)) }) } catch {}
  }
  return () => _listeners.delete(fn)
}

// ── Dark colours: the panel's own CSS is turned into a dark copy, property by property ──
// True black (OLED) dark mode: black page, near-black cards, thin grey lines, white text, brighter accents
const BG = {
  '#fff': '#0D0D0D', '#ffffff': '#0D0D0D', '#f8fafc': '#000000', '#f1f5f9': '#1A1A1A', '#eef2f7': '#1A1A1A',
  '#eff6ff': '#0B1B33', '#f8fbff': '#121212', '#f0fdf4': '#06210F', '#fffbeb': '#241A03', '#fef2f2': '#2A0D0D',
  '#fef3c7': '#2E2204', '#fecaca': '#3D1414', '#fde68a': '#3A2D07', '#e2e8f0': '#262626', '#cbd5e1': '#3A3A3A',
  '#bbf7d0': '#0F3D1F', '#fef08a': '#3A2D07', '#dbeafe': '#0F2A55', '#e0f2fe': '#0A2540', '#dcfce7': '#0F3D1F',
  '#f3e8ff': '#24103A', '#cffafe': '#062E38', '#fef9c3': '#332B05', '#1e293b': '#1C1C1C', '#2563eb': '#2F6BFF',
}
const FG = {
  '#0f172a': '#F5F5F5', '#1e293b': '#EDEDED', '#334155': '#D4D4D4', '#475569': '#BDBDBD', '#64748b': '#A3A3A3',
  '#94a3b8': '#8A8A8A', '#1e3a8a': '#BFD4FF', '#15803d': '#4ADE80', '#16a34a': '#22C55E', '#b45309': '#FBBF24',
  '#b91c1c': '#F87171', '#dc2626': '#F87171', '#2563eb': '#4F8CFF', '#ca8a04': '#FACC15',
}
const LINE = { '#e2e8f0': '#262626', '#f1f5f9': '#1F1F1F', '#eef2f7': '#1F1F1F', '#cbd5e1': '#333333', '#fff': '#262626', '#ffffff': '#262626', '#bbf7d0': '#14532D', '#fde68a': '#4A3A0A', '#fecaca': '#5C1F1F' }
const swap = (val, map) => val.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, c => map[c.toLowerCase()] || c)

/** Dark copy of a stylesheet: same selectors, colours swapped by what they colour. */
export function darkenCss(css) {
  return css.replace(/([{;\s])([a-z-]+)\s*:\s*([^;{}]+)/g, (m, pre, prop, val) => {
    let v = val
    if (/^(background|background-color)$/.test(prop)) v = swap(val, BG)
    else if (prop === 'color' || prop === 'fill' || prop === 'caret-color') v = swap(val, FG)
    else if (/^(border|border-(top|bottom|left|right)|border-color|outline|stroke)$/.test(prop)) v = swap(val, LINE)
    else if (prop === 'box-shadow') v = val.replace(/rgba\(15,\s*23,\s*42,\s*([\d.]+)\)/g, (_, a) => `rgba(0,0,0,${Math.min(0.6, a * 2.2).toFixed(2)})`)
    else return m
    return `${pre}${prop}:${v}`
  })
}

/** Colours written straight into the panel's HTML (style="…", SVG fill / stroke). */
export const DARK_INLINE = `
[style*="color:#0F172A"]{color:#F5F5F5!important}
[style*="color:#64748B"]{color:#A3A3A3!important}
[style*="color:#94A3B8"]{color:#8A8A8A!important}
[style*="color:#B45309"]{color:#FBBF24!important}
[style*="color:#B91C1C"]{color:#F87171!important}
[style*="color:#15803D"]{color:#4ADE80!important}
[style*="color:#2563EB"]{color:#4F8CFF!important}
[style*="background:#F0FDF4"]{background:#06210F!important}
[style*="background:#FFFBEB"]{background:#241A03!important}
[style*="background:#FEF2F2"]{background:#2A0D0D!important}
[style*="background:#EFF6FF"]{background:#0B1B33!important}
[style*="background:#CBD5E1"]{background:#3A3A3A!important}
svg [fill="#0F172A"]{fill:#F5F5F5}
svg [stroke="#0F172A"]{stroke:#F5F5F5}
svg [fill="#fff"]{fill:#0D0D0D}
svg [stroke="#fff"]{stroke:#0D0D0D}
svg [stroke="#E2E8F0"]{stroke:#262626}
svg [fill="#94A3B8"]{fill:#8A8A8A}
svg [stroke="#2563EB"]{stroke:#4F8CFF}
svg [fill="#2563EB"]{fill:#4F8CFF}
svg text[fill="#475569"]{fill:#BDBDBD}
`
