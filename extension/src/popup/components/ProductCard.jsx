import { IndianRupee } from "lucide-react";

export function ProductCard({
  productName,
  platform,
  productPrice,
}) {
  // If no product is detected, return null or a simple empty state
  if (!productName) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <h2 className="font-bold text-gray-900 text-lg leading-tight truncate">
        {productName || "Unknown Product"}
      </h2>

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Platform</span>
          <span className="text-sm font-semibold text-gray-800 capitalize">
            {platform || "N/A"}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-sm text-gray-500">
            <IndianRupee size={14} />
            Price
          </span>
          <span className="font-bold text-green-600">
            {productPrice ? `₹${productPrice}` : "Price unavailable"}
          </span>
        </div>
      </div>
    </div>
  );
}