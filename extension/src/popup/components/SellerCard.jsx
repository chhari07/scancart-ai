import { ShieldCheck, BadgeCheck } from "lucide-react";

export function SellerCard({ rating, verified }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-2">

          <ShieldCheck className="w-5 h-5 text-blue-600" />

          <span className="font-semibold text-gray-900">
            Seller Trust
          </span>

        </div>

        {verified ? (
          <BadgeCheck className="w-5 h-5 text-green-500" />
        ) : (
          <div className="w-5 h-5 rounded-full bg-red-500" />
        )}

      </div>

      <div className="mt-3 flex justify-between">

        <span className="text-gray-500">
          Rating
        </span>

        <span className="font-bold text-gray-900">
          ⭐ {rating}/5
        </span>

      </div>

      <div className="mt-2 flex justify-between">

        <span className="text-gray-500">
          Verified
        </span>

        <span
          className={`font-semibold ${
            verified
              ? "text-green-600"
              : "text-red-500"
          }`}
        >
          {verified ? "Yes" : "No"}
        </span>

      </div>

    </div>
  );
}