'use client';

import { type Campaign } from '@/lib/supabase/client';
import CampaignCard from './CampaignCard';

interface ResultsPanelProps {
  campaigns: Campaign[];
  aggregation?: Record<string, number>;
  total?: number;
  isLoading?: boolean;
}

export default function ResultsPanel({
  campaigns,
  aggregation,
  total,
  isLoading,
}: ResultsPanelProps) {
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Searching campaigns...</p>
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">No campaigns found</p>
          <p className="text-sm">Try adjusting your search query</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-1">
          Results {total !== undefined && `(${total})`}
        </h2>
        {aggregation && Object.keys(aggregation).length > 0 && (
          <div className="mt-3 p-4 bg-indigo-50 rounded-lg">
            <h3 className="text-sm font-medium text-indigo-900 mb-2">Summary</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(aggregation)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([key, count]) => (
                  <span
                    key={key}
                    className="px-3 py-1 bg-white text-indigo-700 rounded-full text-sm font-medium"
                  >
                    {key}: {count}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </div>
  );
}
