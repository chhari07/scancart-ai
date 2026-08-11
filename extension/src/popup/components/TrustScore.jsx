// src/popup/components/TrustScore.jsx
import { getTrustLevel } from '../../utils/constants'

export function TrustScore({ score }) {
  const level = getTrustLevel(score)
  return (
    <div className={`bg-gradient-to-br ${level.gradient} p-6 text-white text-center`}>
      <div className="text-7xl font-black mb-1 animate-fade-in">{score}</div>
      <div className="text-sm opacity-80 mb-1">Trust Score</div>
      <div className="text-lg font-bold">{level.label}</div>
    </div>
  )
}
