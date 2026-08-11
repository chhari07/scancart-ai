// src/utils/formatter.js
export const formatCurrency = (n) => n != null ? `₹${Number(n).toLocaleString('en-IN')}` : '₹0'
export const extractPrice = (t) => parseInt((t || '').toString().replace(/[^0-9]/g, '')) || 0
export const truncate = (s, n = 60) => !s ? '' : s.length > n ? s.slice(0, n) + '...' : s
export const timeAgo = (date) => {
  if (!date) return ''
  const d = date?.toDate ? date.toDate() : new Date(date)
  const s = Math.floor((Date.now() - d) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  if (s < 86400) return `${Math.floor(s/3600)}h ago`
  return `${Math.floor(s/86400)}d ago`
}
