'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import ResultsPanel from './components/ResultsPanel';
import CampaignDetailModal from './components/CampaignDetailModal';
import Resizer from './components/Resizer';
import { type Campaign } from '@/lib/supabase/client';
import { type ActiveFilters, applyFilters, mergeFilters } from '@/lib/filters';

const MIN_PANE_PCT = 15;
const DEFAULT_2_PANE = [50, 50] as const;
const DEFAULT_3_PANE = [33.33, 33.33, 33.34] as const;

function clampPct(v: number) {
  return Math.max(MIN_PANE_PCT, Math.min(85, v));
}

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
  
  // Pane layout: debug pane visibility and widths (percent)
  const [debugPaneVisible, setDebugPaneVisible] = useState(false);
  const [chatWidth, setChatWidth] = useState<number>(DEFAULT_2_PANE[0]);
  const [resultsWidth, setResultsWidth] = useState<number>(DEFAULT_2_PANE[1]);
  const [debugWidth, setDebugWidth] = useState<number>(DEFAULT_3_PANE[2]);
  
  // Initial load state
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const toggleDebugPane = useCallback(() => {
    setDebugPaneVisible((v) => {
      if (v) {
        setChatWidth(DEFAULT_2_PANE[0]);
        setResultsWidth(DEFAULT_2_PANE[1]);
        return false;
      }
      setChatWidth(DEFAULT_3_PANE[0]);
      setResultsWidth(DEFAULT_3_PANE[1]);
      setDebugWidth(DEFAULT_3_PANE[2]);
      return true;
    });
  }, []);

  const resizeChatResults = useCallback((deltaPercent: number) => {
    setChatWidth((c) => clampPct(c + deltaPercent));
    setResultsWidth((r) => clampPct(r - deltaPercent));
  }, []);

  const resizeResultsDebug = useCallback((deltaPercent: number) => {
    setResultsWidth((r) => clampPct(r + deltaPercent));
    setDebugWidth((d) => clampPct(d - deltaPercent));
  }, []);

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

      {/* Main Content: resizable panes */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Pane 1: Chat */}
        <div
          className="flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 min-w-0"
          style={{ width: `${chatWidth}%` }}
        >
          <ChatPanel
            onQuery={handleQuery}
            isLoading={isLoading}
            llmResponse={llmResponse}
          />
        </div>

        <Resizer onResize={resizeChatResults} />

        {/* Pane 2: Campaign viewer */}
        <div
          className="flex-shrink-0 flex flex-col min-w-0"
          style={{ width: `${resultsWidth}%` }}
        >
          <ResultsPanel
            campaigns={displayedCampaigns}
            allCampaigns={allCampaigns}
            aggregation={aggregation}
            total={total}
            isLoading={isLoading || isInitialLoading}
            activeFilters={activeFilters}
            onFiltersChange={setActiveFilters}
            onReset={handleReset}
            onToggleDebug={toggleDebugPane}
            debugPaneVisible={debugPaneVisible}
            onCampaignClick={setSelectedCampaign}
          />
        </div>

        {/* Pane 3: Debug (hidden by default, toggled by Debug pill) */}
        {debugPaneVisible && (
          <>
            <Resizer onResize={resizeResultsDebug} />
            <div
              className="flex-shrink-0 flex flex-col bg-gray-900 text-gray-100 min-w-0 border-l border-gray-700"
              style={{ width: `${debugWidth}%` }}
            >
              <div className="flex-shrink-0 px-3 py-2 border-b border-gray-700 font-semibold text-sm text-gray-300">
                Agent debug log
              </div>
              <pre className="flex-1 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap break-words overscroll-contain">
                {debugSteps.length
                  ? debugSteps.join('\n')
                  : 'No debug output yet. Ask a question to see agent steps.'}
              </pre>
            </div>
          </>
        )}
      </div>

      {/* Campaign Detail Modal */}
      <CampaignDetailModal
        campaign={selectedCampaign}
        onClose={() => setSelectedCampaign(null)}
      />
    </div>
  );
}
