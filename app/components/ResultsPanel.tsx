'use client';

import { type Campaign } from '@/lib/supabase/client';
import { type ActiveFilters } from '@/lib/filters';
import CampaignCard from './CampaignCard';
import FilterPanel from './FilterPanel';

interface ResultsPanelProps {
  campaigns: Campaign[];
  allCampaigns: Campaign[];
  aggregation?: Record<string, number>;
  total?: number;
  isLoading?: boolean;
  activeFilters: ActiveFilters;
  onFiltersChange: (filters: ActiveFilters) => void;
  onReset: () => void;
  debugLog: string;
  onCampaignClick?: (campaign: Campaign) => void;
}

export default function ResultsPanel({
  campaigns,
  allCampaigns,
  aggregation,
  total,
  isLoading,
  activeFilters,
  onFiltersChange,
  onReset,
  debugLog,
  onCampaignClick,
}: ResultsPanelProps) {
  const hasActiveFilters = Object.keys(activeFilters).length > 0;
  const filteredCount = campaigns.length;
  const totalCount = allCampaigns.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter Panel - always visible, with z-index so dropdowns appear above campaigns */}
      <div className="relative z-30 flex-shrink-0 border-b border-gray-200 bg-white">
        <FilterPanel
          activeFilters={activeFilters}
          onFiltersChange={onFiltersChange}
          onReset={onReset}
          debugLog={debugLog}
        />
      </div>

      {/* Results Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center min-h-[200px]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Searching campaigns...</p>
            </div>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="h-full flex items-center justify-center min-h-[200px]">
            <div className="text-center text-gray-500">
              <p className="text-lg mb-2">No campaigns found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          </div>
        ) : (
          <>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xl font-semibold text-gray-900">
              Campaigns
            </h2>
            {hasActiveFilters && (
              <span className="text-sm text-gray-500">
                Showing {filteredCount} of {totalCount}
              </span>
            )}
          </div>
          {!hasActiveFilters && (
            <p className="text-sm text-gray-500">All campaigns ({totalCount})</p>
          )}
          {hasActiveFilters && (
            <p className="text-xs text-indigo-600 mt-1">
              Queries apply to current filters
            </p>
          )}
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
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onClick={() => onCampaignClick?.(campaign)}
            />
          ))}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
