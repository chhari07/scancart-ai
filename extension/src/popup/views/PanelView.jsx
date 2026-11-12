// src/popup/views/PanelView.jsx — the toolbar popup's main screen IS the on-page panel
// (same code: content/injectButton.js mountInline), so both always look and work the same.
import { useEffect, useRef } from 'react'
import { RotateCw } from 'lucide-react'
import { mountInline } from '../../content/injectButton'

export function PanelView({ product, url, tabId, status }) {
  const ref = useRef(null)
  const api = useRef(null)

  useEffect(() => {
    if (ref.current && product) api.current = mountInline(ref.current, { product, url, tabId, status })
    // status is pushed separately below, so a new score doesn't reset an open check
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, url, tabId])

  useEffect(() => { if (status) api.current?.setStatus(status) }, [status])

  if (!product) {
    return (
      <div className="sc-body" style={{ alignItems: 'center', textAlign: 'center', paddingTop: 60 }}>
        <div className="sc-list-title" style={{ fontSize: 15 }}>Reload this page to check it</div>
        <p className="sc-list-sub" style={{ maxWidth: 260 }}>
          ScanCart couldn't read this product yet. This happens on tabs opened before ScanCart was installed or updated.
        </p>
        <button className="sc-btn primary" onClick={() => { chrome.tabs.reload(tabId); window.close() }}>
          <RotateCw size={15} /> Reload page
        </button>
      </div>
    )
  }
  return <div ref={ref} className="sc-panel-host" />
}
