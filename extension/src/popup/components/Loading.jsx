// ──────────────────────────────────────────────────
// src/popup/components/Loading.jsx
// ──────────────────────────────────────────────────
export function Loading({ message = 'Loading...' }) {
  return (
    <div className="w-[380px] h-[300px] flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-3 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">{message}</p>
      </div>
    </div>
  )
}
