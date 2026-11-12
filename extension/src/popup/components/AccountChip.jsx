// src/popup/components/AccountChip.jsx — login status in the popup header.
// Signed in: photo (or initial) + first name + green dot; click opens a menu with
// email, Dashboard and Sign out. Signed out: grey "Signed out" pill that opens sign-in.
import { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, LogOut } from 'lucide-react'

export function AccountChip({ user, onSignIn, onDashboard, onSignOut }) {
  const [open, setOpen] = useState(false)
  const [imgOk, setImgOk] = useState(true)
  const ref = useRef(null)

  useEffect(() => { setImgOk(true) }, [user?.imageUrl])
  useEffect(() => {
    if (!open) return
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  if (!user) {
    return (
      <button className="sc-acct out" onClick={onSignIn} title="Not signed in — click to sign in">
        <span className="sc-acct-dot grey" /> Signed out
      </button>
    )
  }

  const name = (user.name || '').trim() || (user.email || '').split('@')[0] || 'Account'
  const first = name.split(/\s+/)[0]
  const initial = first.charAt(0).toUpperCase()
  const avatar = user.imageUrl && imgOk
    ? <img src={user.imageUrl} alt="" onError={() => setImgOk(false)} />
    : <span>{initial}</span>

  return (
    <div className="sc-acct-wrap" ref={ref}>
      <button className="sc-acct" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={`Signed in as ${user.email || name}`}>
        <span className="sc-avatar">{avatar}<i className="sc-acct-dot green" /></span>
        <span className="sc-acct-name">{first}</span>
      </button>

      {open && (
        <div className="sc-acct-menu" role="menu">
          <div className="sc-acct-head">
            <span className="sc-avatar lg">{avatar}</span>
            <div className="sc-grow">
              <div className="sc-acct-full sc-ellipsis">{name}</div>
              {user.email && <div className="sc-acct-email sc-ellipsis">{user.email}</div>}
            </div>
          </div>
          <div className="sc-acct-status"><span className="sc-acct-dot green" /> Signed in · synced with website</div>
          <button className="sc-acct-item" role="menuitem" onClick={() => { setOpen(false); onDashboard() }}>
            <LayoutDashboard size={14} /> Dashboard
          </button>
          <button className="sc-acct-item danger" role="menuitem" onClick={() => { setOpen(false); onSignOut() }}>
            <LogOut size={14} /> Sign out of extension
          </button>
        </div>
      )}
    </div>
  )
}
