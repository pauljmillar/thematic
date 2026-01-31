import type { Campaign } from './supabase/client';
import type { ActiveFilters } from './filters';
import { mergeFilters } from './filters';
import { embedText } from './embeddings';
import {
  executeVectorSearch,
  executeFilteredQuery,
  executeAggregation,
} from './query-executor';
import type { QueryPlan } from './query-planner';
import { supabaseAdmin } from './supabase/client';

const MAX_SUMMARY_CAMPAIGNS = 20;
const MAX_SUMMARY_LINE_LENGTH = 200;

export interface ToolResult {
  count: number;
  summary_for_llm: string;
  campaigns: Campaign[];
}

/**
 * Build a consistent tool result from a list of campaigns.
 * Caps summary to first MAX_SUMMARY_CAMPAIGNS with 2-3 lines each to avoid blowing context.
 */
export function buildToolResult(campaigns: Campaign[]): ToolResult {
  const count = campaigns.length;
  const forSummary = campaigns.slice(0, MAX_SUMMARY_CAMPAIGNS);
  const lines = forSummary.map((c, idx) => {
    const textSnippet = [c.campaign_text, c.full_campaign_text]
      .filter(Boolean)
      .join(' ')
      .slice(0, MAX_SUMMARY_LINE_LENGTH);
    const parts = [
      `Campaign ${idx + 1}: ${c.company || 'Unknown'}${c.brand ? ` (${c.brand})` : ''}`,
      c.offer != null ? `Offer: ${c.offer}` : null,
      c.key_value_props?.length ? `Value props: ${c.key_value_props.join(', ')}` : null,
      c.imagery_sentiment ? `Sentiment: ${c.imagery_sentiment}` : null,
      c.imagery_visual_style ? `Visual style: ${c.imagery_visual_style}` : null,
      c.capture_date ? `Date: ${c.capture_date}` : null,
      textSnippet ? `Copy: ${textSnippet}...` : null,
    ].filter(Boolean);
    return parts.join(' | ');
  });
  const summary_for_llm =
    count === 0
      ? 'No campaigns found.'
      : `Found ${count} campaign(s).\n${lines.join('\n')}${count > MAX_SUMMARY_CAMPAIGNS ? `\n... and ${count - MAX_SUMMARY_CAMPAIGNS} more.` : ''}`;

  return {
    count,
    summary_for_llm,
    campaigns,
  };
}

/** OpenAI function-calling tool definitions (compatible with chat.completions.create tools) */
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description:
        'Search campaigns by meaning. Use for concept-based queries like "travel benefits", "no fee offers", "campaigns about rewards". Choose embedding_field: value_prop_embedding for value/offers, copy_embedding for text/copy, visual_embedding for imagery/style.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query' },
          embedding_field: {
            type: 'string',
            enum: ['value_prop_embedding', 'copy_embedding', 'visual_embedding'],
            description: 'Which embedding to search (default value_prop_embedding)',
          },
          channel: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by channel: facebook, instagram, twitter, email, direct_mail',
          },
          value_prop: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by value prop e.g. Cash Back / Rewards',
          },
          sentiment: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by sentiment e.g. Aspirational, Premium',
          },
          visual_style: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by visual style',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'filter_campaigns',
      description:
        'Filter campaigns by structured database fields: channel, sentiment, value prop, visual style, date range, or whether they have an offer. Use when the user asks for specific dimensions (e.g. "Instagram campaigns", "aspirational", "Cash Back") or "what are the offers from recent Cash Back, Premium campaigns" (filter first, then answer from the result).',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by channel: facebook, instagram, twitter, email, direct_mail',
          },
          value_prop: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by value prop e.g. Cash Back / Rewards, Premium',
          },
          sentiment: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by sentiment e.g. Aspirational, Trust-Building, Premium',
          },
          visual_style: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by visual style',
          },
          date_range: {
            type: 'object',
            properties: {
              start: { type: 'string', description: 'ISO date YYYY-MM-DD' },
              end: { type: 'string', description: 'ISO date YYYY-MM-DD' },
            },
          },
          has_offer: {
            type: 'boolean',
            description: 'If true, only campaigns that have an offer value',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'full_text_search',
      description:
        'Search for exact words or phrases in campaign copy/text. Use when the user asks for campaigns that "mention X", "say Y", or contain specific wording.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words or phrase to search for in campaign text' },
          channel: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional filter by channel',
          },
        },
        required: ['query'],
      },
    },
  },
];

export interface SemanticSearchParams {
  query: string;
  embedding_field?: 'value_prop_embedding' | 'copy_embedding' | 'visual_embedding';
  channel?: string[];
  value_prop?: string[];
  sentiment?: string[];
  visual_style?: string[];
}

export interface FilterCampaignsParams {
  channel?: string[];
  value_prop?: string[];
  sentiment?: string[];
  visual_style?: string[];
  date_range?: { start?: string; end?: string };
  has_offer?: boolean;
}

export interface FullTextSearchParams {
  query: string;
  channel?: string[];
}

export async function runSemanticSearch(
  params: SemanticSearchParams,
  baseFilters?: ActiveFilters
): Promise<ToolResult> {
  const merged = mergeFilters(baseFilters ?? {}, {
    channel: params.channel,
    value_prop: params.value_prop,
    sentiment: params.sentiment,
    visual_style: params.visual_style,
  });
  const filters: QueryPlan['filters'] = {};
  if (merged.channel?.length) filters.channel = merged.channel;
  if (merged.value_prop?.length) filters.value_prop = merged.value_prop;
  if (merged.sentiment?.length) filters.sentiment = merged.sentiment;
  if (merged.visual_style?.length) filters.visual_style = merged.visual_style;

  const queryEmbedding = await embedText(params.query);
  const plan: QueryPlan = {
    type: 'vector_search',
    vectorField: params.embedding_field ?? 'value_prop_embedding',
    queryEmbedding,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
  const result = await executeVectorSearch(plan);
  // Apply sentiment/visual_style in memory if RPC didn't support them
  let campaigns = result.campaigns;
  if (filters.sentiment?.length || filters.visual_style?.length) {
    campaigns = campaigns.filter((c) => {
      if (filters.sentiment?.length && !c.imagery_sentiment) return false;
      if (filters.sentiment?.length && !filters.sentiment!.includes(c.imagery_sentiment!)) return false;
      if (filters.visual_style?.length && !c.imagery_visual_style) return false;
      if (filters.visual_style?.length && !filters.visual_style!.includes(c.imagery_visual_style!)) return false;
      return true;
    });
  }
  return buildToolResult(campaigns);
}

export async function runFilterCampaigns(
  params: FilterCampaignsParams,
  baseFilters?: ActiveFilters
): Promise<ToolResult> {
  const merged = mergeFilters(baseFilters ?? {}, {
    channel: params.channel,
    value_prop: params.value_prop,
    sentiment: params.sentiment,
    visual_style: params.visual_style,
    date_range: params.date_range,
  });
  const filters: QueryPlan['filters'] = {};
  if (merged.channel?.length) filters.channel = merged.channel;
  if (merged.value_prop?.length) filters.value_prop = merged.value_prop;
  if (merged.sentiment?.length) filters.sentiment = merged.sentiment;
  if (merged.visual_style?.length) filters.visual_style = merged.visual_style;
  if (merged.date_range) filters.date_range = merged.date_range;

  const plan: QueryPlan = {
    type: 'vector_search', // unused; executeFilteredQuery only reads filters
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  };
  const result = await executeFilteredQuery(plan);
  let campaigns = result.campaigns;
  if (params.has_offer === true) {
    campaigns = campaigns.filter((c) => c.offer != null && String(c.offer).trim() !== '');
  }
  return buildToolResult(campaigns);
}

export async function runFullTextSearch(
  params: FullTextSearchParams,
  baseFilters?: ActiveFilters
): Promise<ToolResult> {
  const filterChannels = params.channel?.length ? params.channel : baseFilters?.channel ?? null;
  const { data, error } = await supabaseAdmin.rpc('search_campaigns_by_text', {
    query_text: params.query,
    limit_count: 50,
    filter_channels: filterChannels,
  });

  if (error) {
    console.warn('Full-text search RPC failed:', error.message);
    return buildToolResult([]);
  }

  const campaigns = (data ?? []) as Campaign[];
  return buildToolResult(campaigns);
}

export function getToolRunner(
  name: string
): (params: Record<string, unknown>, baseFilters?: ActiveFilters) => Promise<ToolResult> {
  switch (name) {
    case 'semantic_search':
      return (params, baseFilters) =>
        runSemanticSearch(params as unknown as SemanticSearchParams, baseFilters);
    case 'filter_campaigns':
      return (params, baseFilters) =>
        runFilterCampaigns(params as unknown as FilterCampaignsParams, baseFilters);
    case 'full_text_search':
      return (params, baseFilters) =>
        runFullTextSearch(params as unknown as FullTextSearchParams, baseFilters);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
