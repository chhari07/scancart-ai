// Shared product row: thumbnail, name, platform pill, price
import { ShoppingBag } from 'lucide-react'
import { PLATFORM_NAMES } from '../../utils/constants'

export const rupees = n => `₹${Number(n || 0).toLocaleString('en-IN')}`

export function ProductRow({ name, price, platform, image, sub }) {
  return (
    <div className="sc-card sc-product">
      <div className="sc-product-thumb">
        {image ? <img src={image} alt="" /> : <ShoppingBag size={18} color="#64748B" />}
      </div>
      <div className="sc-grow">
        <div className="sc-product-name">{name || 'This product'}</div>
        {sub && <div className="sc-list-sub sc-ellipsis">{sub}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        {platform && <div className="sc-pill amber" style={{ fontSize: 10, padding: '2px 8px' }}>{PLATFORM_NAMES[platform] || platform}</div>}
        {price > 0 && <div className="sc-price" style={{ marginTop: 4 }}>{rupees(price)}</div>}
      </div>
    </div>
  )
}
