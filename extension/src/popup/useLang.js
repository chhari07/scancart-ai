// src/popup/useLang.js — English / हिन्दी / Hinglish for the toolbar popup (same `scLang` setting as the panel)
import { useEffect, useState } from 'react'
import { getLang, setLang, onLangChange, attachTranslator, translateTree } from '../utils/i18n'

let current = 'en'
let attached = false

export function useLang() {
  const [lang, setL] = useState('en')
  useEffect(() => {
    if (!attached) { attached = true; attachTranslator(document.body, () => current) }
    const apply = (l) => { current = l; setL(l); document.documentElement.lang = l === 'hi' ? 'hi' : 'en'; translateTree(document.body, l) }
    getLang().then(apply)
    return onLangChange(apply)
  }, [])
  const choose = (l) => { current = l; setL(l); setLang(l); translateTree(document.body, l) }
  return [lang, choose]
}
