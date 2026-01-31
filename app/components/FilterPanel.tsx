'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { type ActiveFilters, CHANNEL_OPTIONS, VALUE_PROP_OPTIONS, SENTIMENT_OPTIONS, VISUAL_STYLE_OPTIONS } from '@/lib/filters';

interface FilterPanelProps {
  activeFilters: ActiveFilters;
  onFiltersChange: (filters: ActiveFilters) => void;
  onReset: () => void;
  onToggleDebug: () => void;
  debugPaneVisible: boolean;
}

interface FilterPillProps {
  label: string;
  hasSelection: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function FilterPill({ label, hasSelection, isExpanded, onToggle, children }: FilterPillProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isExpanded || !buttonRef.current || typeof document === 'undefined') return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, [isExpanded]);

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className={`
          inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium
          border border-gray-300 transition-colors
          ${hasSelection ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-white text-gray-700 hover:bg-gray-50'}
        `}
      >
        <span>{label}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isExpanded && dropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed z-[100] min-w-[200px] max-w-[280px] p-3 bg-white border border-gray-200 rounded-lg shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2 max-h-[280px] overflow-y-auto overscroll-contain">
              {children}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default function FilterPanel({
  activeFilters,
  onFiltersChange,
  onReset,
  onToggleDebug,
  debugPaneVisible,
}: FilterPanelProps) {
  const [expandedPill, setExpandedPill] = useState<string | null>(null);

  const handleChannelChange = (channel: string, checked: boolean) => {
    const currentChannels = activeFilters.channel || [];
    const newChannels = checked
      ? [...currentChannels, channel]
      : currentChannels.filter((c) => c !== channel);

    onFiltersChange({
      ...activeFilters,
      channel: newChannels.length > 0 ? newChannels : undefined,
    });
  };

  const handleValuePropChange = (valueProp: string, checked: boolean) => {
    const currentValueProps = activeFilters.value_prop || [];
    const newValueProps = checked
      ? [...currentValueProps, valueProp]
      : currentValueProps.filter((vp) => vp !== valueProp);

    onFiltersChange({
      ...activeFilters,
      value_prop: newValueProps.length > 0 ? newValueProps : undefined,
    });
  };

  const handleSentimentChange = (sentiment: string, checked: boolean) => {
    const currentSentiments = activeFilters.sentiment || [];
    const newSentiments = checked
      ? [...currentSentiments, sentiment]
      : currentSentiments.filter((s) => s !== sentiment);

    onFiltersChange({
      ...activeFilters,
      sentiment: newSentiments.length > 0 ? newSentiments : undefined,
    });
  };

  const handleVisualStyleChange = (visualStyle: string, checked: boolean) => {
    const currentVisualStyles = activeFilters.visual_style || [];
    const newVisualStyles = checked
      ? [...currentVisualStyles, visualStyle]
      : currentVisualStyles.filter((vs) => vs !== visualStyle);

    onFiltersChange({
      ...activeFilters,
      visual_style: newVisualStyles.length > 0 ? newVisualStyles : undefined,
    });
  };

  const handleReset = () => {
    onFiltersChange({});
    setExpandedPill(null);
    onReset();
  };

  const hasActiveFilters = Object.keys(activeFilters).length > 0;

  const togglePill = (id: string) => {
    setExpandedPill((prev) => (prev === id ? null : id));
  };

  return (
    <div className="bg-white border-b border-gray-200 p-3">
      {/* Horizontal scrollable row of pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
          <FilterPill
            label="Channel"
            hasSelection={(activeFilters.channel?.length ?? 0) > 0}
            isExpanded={expandedPill === 'channel'}
            onToggle={() => togglePill('channel')}
          >
            {CHANNEL_OPTIONS.map((channel) => (
              <label
                key={channel}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.channel?.includes(channel) || false}
                  onChange={(e) => handleChannelChange(channel, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="capitalize">{channel.replace('_', ' ')}</span>
              </label>
            ))}
          </FilterPill>

          <FilterPill
            label="Value Props"
            hasSelection={(activeFilters.value_prop?.length ?? 0) > 0}
            isExpanded={expandedPill === 'value_prop'}
            onToggle={() => togglePill('value_prop')}
          >
            {VALUE_PROP_OPTIONS.map((valueProp) => (
              <label
                key={valueProp}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.value_prop?.includes(valueProp) || false}
                  onChange={(e) => handleValuePropChange(valueProp, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{valueProp}</span>
              </label>
            ))}
          </FilterPill>

          <FilterPill
            label="Sentiment"
            hasSelection={(activeFilters.sentiment?.length ?? 0) > 0}
            isExpanded={expandedPill === 'sentiment'}
            onToggle={() => togglePill('sentiment')}
          >
            {SENTIMENT_OPTIONS.map((sentiment) => (
              <label
                key={sentiment}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.sentiment?.includes(sentiment) || false}
                  onChange={(e) => handleSentimentChange(sentiment, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{sentiment}</span>
              </label>
            ))}
          </FilterPill>

          <FilterPill
            label="Visual Style"
            hasSelection={(activeFilters.visual_style?.length ?? 0) > 0}
            isExpanded={expandedPill === 'visual_style'}
            onToggle={() => togglePill('visual_style')}
          >
            {VISUAL_STYLE_OPTIONS.map((visualStyle) => (
              <label
                key={visualStyle}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900"
              >
                <input
                  type="checkbox"
                  checked={activeFilters.visual_style?.includes(visualStyle) || false}
                  onChange={(e) => handleVisualStyleChange(visualStyle, e.target.checked)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{visualStyle}</span>
              </label>
            ))}
          </FilterPill>
        </div>

        {/* Reset pill */}
        <div className="flex-shrink-0 pl-2 border-l border-gray-200 ml-1">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <span>Reset</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Debug pill: toggles 3rd pane visibility */}
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={onToggleDebug}
            className={`
              inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors
              ${debugPaneVisible ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
            `}
          >
            <span>Debug</span>
          </button>
        </div>
      </div>

      {/* Click-outside overlay: below portaled dropdown (z-[100]) but above page content */}
      {expandedPill && (
        <div
          className="fixed inset-0 z-[90]"
          aria-hidden="true"
          onClick={() => setExpandedPill(null)}
        />
      )}
    </div>
  );
}
