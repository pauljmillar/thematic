'use client';

import { useState, useEffect, useMemo } from 'react';
import ChatPanel from './components/ChatPanel';
import ResultsPanel from './components/ResultsPanel';
import CampaignDetailModal from './components/CampaignDetailModal';
import { type Campaign } from '@/lib/supabase/client';
import { type ActiveFilters, applyFilters, mergeFilters } from '@/lib/filters';

export default function Home() {
  // All campaigns from database (unfiltered)
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  
  // Filter state
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  
  // Query results state
  const [aggregation, setAggregation] = useState<Record<string, number>>();
  const [total, setTotal] = useState<number>();
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [llmResponse, setLlmResponse] = useState<string>('');
  const [debugSteps, setDebugSteps] = useState<string[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  
  // Initial load state
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Apply filters to allCampaigns to get displayed campaigns
  const displayedCampaigns = useMemo(() => {
    return applyFilters(allCampaigns, activeFilters);
  }, [allCampaigns, activeFilters]);

  // Load all campaigns on mount
  useEffect(() => {
    const loadAllCampaigns = async () => {
      try {
        setIsInitialLoading(true);
        const response = await fetch('/api/campaigns?limit=1000');
        if (!response.ok) {
          throw new Error('Failed to load campaigns');
        }
        const data = await response.json();
        setAllCampaigns(data.campaigns || []);
      } catch (error) {
        console.error('Error loading campaigns:', error);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadAllCampaigns();
  }, []);

  const handleQuery = async (message: string) => {
    setIsLoading(true);
    setLlmResponse('');
    setDebugSteps([]);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          activeFilters,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process query');
      }

      const data = await response.json();
      setAggregation(data.aggregation);
      setTotal(data.total);
      setSuggestions(data.suggestions || []);
      setLlmResponse(data.response || '');
      setDebugSteps(data.debugSteps || []);

      // Update active filters if the API detected new filters
      if (data.detectedFilters) {
        setActiveFilters((prev) => {
          return mergeFilters(prev, data.detectedFilters);
        });
      }
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setActiveFilters({});
    setLlmResponse('');
    setAggregation(undefined);
    setTotal(undefined);
    setSuggestions([]);
    setDebugSteps([]);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Multimodal Marketing Campaign Intelligence
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Explore and analyze credit card marketing campaigns across channels
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Chat Panel - Left */}
        <div className="w-full md:w-1/2 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col">
          <ChatPanel 
            onQuery={handleQuery} 
            isLoading={isLoading}
            llmResponse={llmResponse}
          />
        </div>

        {/* Results Panel - Right */}
        <div className="w-full md:w-1/2 flex flex-col">
          <ResultsPanel
            campaigns={displayedCampaigns}
            allCampaigns={allCampaigns}
            aggregation={aggregation}
            total={total}
            isLoading={isLoading || isInitialLoading}
            activeFilters={activeFilters}
            onFiltersChange={setActiveFilters}
            onReset={handleReset}
            debugLog={debugSteps.join('\n')}
            onCampaignClick={setSelectedCampaign}
          />
        </div>
      </div>

      {/* Campaign Detail Modal */}
      <CampaignDetailModal
        campaign={selectedCampaign}
        onClose={() => setSelectedCampaign(null)}
      />
    </div>
  );
}
