import {
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

export function ReviewSummary({
  fakePercent,
  total,
}) {
  const genuine = 100 - fakePercent;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">

      <div className="flex items-center gap-2">

        <MessageSquare className="w-5 h-5 text-blue-600" />

        <h3 className="font-semibold text-gray-900">
          Review Analysis
        </h3>

      </div>

      <div className="mt-4">

        <div className="flex justify-between text-sm">

          <span>
            Genuine Reviews
          </span>

          <span className="font-semibold text-green-600">
            {genuine}%
          </span>

        </div>

        <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">

          <div
            className="h-full bg-green-500"
            style={{
              width: `${genuine}%`,
            }}
          />

        </div>

      </div>

      <div className="mt-4 flex justify-between">

        <span className="flex items-center gap-1 text-red-500">

          <AlertTriangle className="w-4 h-4" />

          Fake Reviews

        </span>

        <span className="font-bold text-red-500">
          {fakePercent}%
        </span>

      </div>

      <div className="mt-2 flex justify-between">

        <span className="text-gray-500">
          Total Reviews
        </span>

        <span className="font-semibold">
          {total}
        </span>

      </div>

    </div>
  );
}