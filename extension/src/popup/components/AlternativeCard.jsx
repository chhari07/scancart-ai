import {
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function AlternativeCard({
  alternative,
}) {
  if (!alternative) return null;

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-4 shadow-sm">

      <div className="flex items-center gap-2">

        <Sparkles className="w-5 h-5 text-green-600" />

        <h3 className="font-semibold text-gray-900">
          Better Alternative
        </h3>

      </div>

      <div className="mt-4">

        <p className="font-bold text-gray-900">
          {alternative.name}
        </p>

        <p className="text-green-600 font-semibold mt-1">
          Rs. {alternative.price?.toLocaleString?.('en-IN') ?? alternative.price}
        </p>

        {alternative.reason && (
          <p className="text-sm text-gray-500 mt-2">
            {alternative.reason}
          </p>
        )}

      </div>

      <button className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 flex items-center justify-center gap-2 transition">

        View Alternative

        <ArrowRight className="w-4 h-4" />

      </button>

    </div>
  );
}