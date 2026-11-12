export function PriceCard({ bestPrice, savings }) {
  const price = bestPrice?.price?.toLocaleString('en-IN') ?? savings ?? 'N/A'
  const savingsAmt = savings?.toLocaleString?.('en-IN') ?? savings

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center">
          <span style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>Rs</span>
        </div>
        <h3 className="font-semibold text-gray-900">Price Analysis</h3>
      </div>

      <div className="flex justify-between mb-2">
        <span className="text-gray-500 text-sm">
          Best Price{bestPrice?.platform ? ` on ${bestPrice.platform}` : ''}
        </span>
        <span className="font-bold text-green-600">Rs. {price}</span>
      </div>

      {savingsAmt && (
        <div className="flex justify-between">
          <span className="text-gray-500 text-sm">You Save</span>
          <span className="text-green-600 font-bold">Rs. {savingsAmt}</span>
        </div>
      )}
    </div>
  )
}