// src/popup/components/LoginRequired.jsx
import { Shield, Search, Wallet, Lightbulb } from 'lucide-react'

const BENEFITS = [
  { icon: Search, text: 'Fake review detection (94% accuracy)' },
  { icon: Shield, text: 'Seller verification & risk score' },
  { icon: Wallet, text: 'Best price across 5 platforms' },
  { icon: Lightbulb, text: 'Smart alternative recommendations' },
]

export function LoginRequired({ onLogin, onSignUp }) {
  return (
    <div className="w-[380px] p-6 bg-white min-h-[500px] flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-6xl mb-3">🛡️</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">ScanCart.ai</h1>
        <p className="text-sm text-gray-500">AI detects fake products in 6 seconds</p>
      </div>

      <div className="space-y-3 mb-6">
        {BENEFITS.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm text-gray-700">
            <div className="w-8 h-8 bg-accentL rounded-lg flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-accent" />
            </div>
            {text}
          </div>
        ))}
      </div>

      <button
        onClick={onSignUp}
        className="w-full bg-accent hover:bg-accent2 text-white py-3 rounded-xl font-semibold mb-2 transition"
      >
        Sign Up Free
      </button>
      <button
        onClick={onLogin}
        className="w-full border border-gray-300 hover:bg-gray-50 text-gray-700 py-3 rounded-xl font-medium transition"
      >
        I already have an account
      </button>
      <p className="text-center text-xs text-gray-400 mt-3">
        Free forever · 10 scans/day · No credit card
      </p>
    </div>
  )
}
