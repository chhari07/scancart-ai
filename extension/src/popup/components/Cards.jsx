// src/popup/components/ProductCard.jsx
import { PLATFORM_NAMES, PLATFORM_COLORS } from '../../utils/constants'
import { truncate, formatCurrency } from '../../utils/formatter'

export function ProductCard({ productName, platform, productPrice }) {
  return (
    <div className="p-4 border-b border-gray-100">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Analyzed</span>
        {platform && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_COLORS[platform] || 'bg-gray-100 text-gray-700'}`}>
            {PLATFORM_NAMES[platform] || platform}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 text-sm leading-snug">
        {truncate(productName, 80)}
      </h3>
      {productPrice > 0 && (
        <p className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(productPrice)}</p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
// src/popup/components/SellerCard.jsx
// ──────────────────────────────────────────────
import { Shield, CheckCircle, AlertTriangle } from 'lucide-react'

export function SellerCard({ rating, verified }) {
  const color = verified ? 'green' : 'amber'
  const Icon = verified ? CheckCircle : AlertTriangle
  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-3`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 bg-${color}-100 rounded-lg flex items-center justify-center shrink-0`}>
          <Shield className={`w-5 h-5 text-${color}-600`} />
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Seller Verification</div>
          <div className="font-semibold text-gray-900">{rating}/5 ★</div>
          <div className={`text-xs text-${color}-700 flex items-center gap-1 mt-0.5`}>
            <Icon className="w-3 h-3" />
            {verified ? 'Verified Seller' : 'Unverified Seller'}
          </div>
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// src/popup/components/ReviewSummary.jsx
// ──────────────────────────────────────────────
import { Search } from 'lucide-react'

export function ReviewSummary({ fakePercent, total }) {
  const genuine = 100 - fakePercent
  const color = fakePercent < 20 ? 'green' : fakePercent < 50 ? 'amber' : 'red'
  return (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-3`}>
      <div className="flex items-start gap-3 mb-2">
        <div className={`w-10 h-10 bg-${color}-100 rounded-lg flex items-center justify-center shrink-0`}>
          <Search className={`w-5 h-5 text-${color}-600`} />
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-400 mb-0.5">Review Analysis</div>
          <div className="font-semibold text-gray-900">{fakePercent}% Fake Reviews</div>
          <div className="text-xs text-gray-500">{genuine}% genuine · {(total || 0).toLocaleString()} total</div>
        </div>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`bg-${color}-500 h-full transition-all duration-1000`}
          style={{ width: `${genuine}%` }}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// src/popup/components/PriceCard.jsx
// ──────────────────────────────────────────────
import { Wallet, ExternalLink } from 'lucide-react'
import { formatCurrency } from '../../utils/formatter'

export function PriceCard({ bestPrice, savings }) {
  if (!bestPrice || savings <= 0) return null
  return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-400 mb-0.5">Better Price Found</div>
          <div className="font-semibold text-gray-900">{formatCurrency(bestPrice.price)}</div>
          <div className="text-xs text-green-700">
            on {bestPrice.platform} · Save {formatCurrency(savings)}
          </div>
        </div>
        <button
          onClick={() => chrome.tabs.create({ url: bestPrice.url })}
          className="text-green-600 hover:text-green-800 flex items-center gap-1 text-xs font-medium"
        >
          View <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────
// src/popup/components/AlternativeCard.jsx
// ──────────────────────────────────────────────
import { Lightbulb } from 'lucide-react'
import { formatCurrency } from '../../utils/formatter'

export function AlternativeCard({ alternative }) {
  if (!alternative) return null
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
          <Lightbulb className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">Smart Alternative</div>
          <div className="font-semibold text-gray-900 truncate max-w-[220px]">{alternative.name}</div>
          <div className="text-xs text-blue-700">
            {formatCurrency(alternative.price)} · {alternative.reason}
          </div>
        </div>
      </div>
    </div>
  )
}
