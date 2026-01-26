'use client';

import { useState } from 'react';
import ChatPanel from './components/ChatPanel';
import ResultsPanel from './components/ResultsPanel';
import { type Campaign } from '@/lib/supabase/client';

export default function Home() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [aggregation, setAggregation] = useState<Record<string, number>>();
  const [total, setTotal] = useState<number>();
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const handleQuery = async (message: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error('Failed to process query');
      }

      const data = await response.json();
      setCampaigns(data.campaigns || []);
      setAggregation(data.aggregation);
      setTotal(data.total);
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
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
          <ChatPanel onQuery={handleQuery} isLoading={isLoading} />
        </div>

        {/* Results Panel - Right */}
        <div className="w-full md:w-1/2 flex flex-col">
          <ResultsPanel
            campaigns={campaigns}
            aggregation={aggregation}
            total={total}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
