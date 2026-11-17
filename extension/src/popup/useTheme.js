// src/popup/useTheme.js — light / dark for the toolbar popup (same `scTheme` setting as the panel)
import { useEffect, useState } from 'react'
import { getTheme, setThemeSetting, onThemeChange, darkenCss } from '../utils/theme'
import popupCss from './Popup.css?raw'

const VARS = `:root{--slate-900:#F5F5F5;--slate-700:#D4D4D4;--slate-500:#A3A3A3;--slate-400:#8A8A8A;--slate-200:#262626;--slate-100:#1A1A1A;--slate-50:#000000;--blue-600:#4F8CFF;--blue-50:#0B1B33;--green-50:#06210F;--amber-50:#241A03;--red-50:#2A0D0D;--shadow:none}
body{color-scheme:dark}
.sc-logo img{filter:invert(1) hue-rotate(180deg) brightness(1.2)}
.sc-score .sc-btn.sm{background:#1C1C1C!important;color:#fff!important}
.sc-btn.primary,.sc-save-card{color:#fff!important}
.sc-lang{background:#0D0D0D!important;border-color:#262626!important}.sc-lang button{color:#A3A3A3!important}.sc-lang button.on{background:#F5F5F5!important;color:#000!important}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15)}`
let darkCss = null

export function useTheme() {
  const [theme, setTheme] = useState('light')
  useEffect(() => { getTheme().then(setTheme); return onThemeChange(setTheme) }, [])
  useEffect(() => {
    let el = document.getElementById('sc-popup-dark')
    if (!el) { el = document.createElement('style'); el.id = 'sc-popup-dark'; document.head.appendChild(el) }
    el.textContent = theme === 'dark' ? (darkCss ||= darkenCss(popupCss.replace(/@tailwind[^;]*;/g, '')) + VARS) : ''
    document.documentElement.classList.toggle('sc-dark', theme === 'dark')
  }, [theme])
  const toggle = () => { const n = theme === 'dark' ? 'light' : 'dark'; setTheme(n); setThemeSetting(n) }
  return [theme, toggle]
}
