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

// Exact values the DB accepts (use these in tool enums/descriptions)
const CHANNEL_VALUES = ['facebook', 'instagram', 'twitter', 'email', 'direct_mail'] as const;
const VALUE_PROP_VALUES = [
  'No Fee / No Minimum',
  'Cash Back / Rewards',
  'Travel Benefits',
  'High-Yield Savings',
  'Credit Building',
  'Security / Fraud Protection',
] as const;
const SENTIMENT_VALUES = ['Aspirational', 'Trust-Building', 'Urgent', 'Playful', 'Premium'] as const;
const VISUAL_STYLE_VALUES = [
  'Lifestyle Photography',
  'Minimalist Graphic',
  'Illustration',
  'Product-Centric',
  'Text-Heavy',
  'Abstract / Conceptual',
] as const;

/** OpenAI function-calling tool definitions (compatible with chat.completions.create tools) */
export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'filter_campaigns',
      description:
        'Filter campaigns by structured database fields. PREFER THIS when the user explicitly names a channel (e.g. Instagram, Facebook), sentiment (e.g. aspirational, premium), value prop (e.g. Cash Back), or "with an offer". Use EXACT values from the parameter enums. For questions like "X from Instagram" or "offers from Cash Back campaigns", call this FIRST to narrow by channel/value_prop/sentiment, then call search_offers or semantic_search on the result. Channel, value_prop, sentiment, and visual_style must use the exact strings listed in their enums.',
      parameters: {
        type: 'object',
        properties: {
          channel: {
            type: 'array',
            items: { type: 'string', enum: [...CHANNEL_VALUES] },
            description: 'One or more of: facebook, instagram, twitter, email, direct_mail. Use exact value.',
          },
          value_prop: {
            type: 'array',
            items: { type: 'string', enum: [...VALUE_PROP_VALUES] },
            description: 'One or more of: No Fee / No Minimum, Cash Back / Rewards, Travel Benefits, High-Yield Savings, Credit Building, Security / Fraud Protection. Use exact value.',
          },
          sentiment: {
            type: 'array',
            items: { type: 'string', enum: [...SENTIMENT_VALUES] },
            description: 'One or more of: Aspirational, Trust-Building, Urgent, Playful, Premium. Use exact value.',
          },
          visual_style: {
            type: 'array',
            items: { type: 'string', enum: [...VISUAL_STYLE_VALUES] },
            description: 'One or more of: Lifestyle Photography, Minimalist Graphic, Illustration, Product-Centric, Text-Heavy, Abstract / Conceptual. Use exact value.',
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
      name: 'search_offers',
      description:
        'Search within the offer and incentives fields of campaigns. Use for high-frequency queries about offers or incentives: "highest point offers", "bonus offers", "offers that mention X", "incentives". Prefer this over full_text_search when the user cares specifically about offer text or incentives, not general ad copy. Can be chained after filter_campaigns: e.g. first filter_campaigns(channel: instagram), then search_offers(query: "point", channel: instagram). Use EXACT enum values for channel, value_prop, sentiment, visual_style.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words or phrase to search for in offer text and incentives (case-insensitive)' },
          channel: {
            type: 'array',
            items: { type: 'string', enum: [...CHANNEL_VALUES] },
            description: 'Optional. One or more of: facebook, instagram, twitter, email, direct_mail.',
          },
          value_prop: {
            type: 'array',
            items: { type: 'string', enum: [...VALUE_PROP_VALUES] },
            description: 'Optional. One or more value prop exact values.',
          },
          sentiment: {
            type: 'array',
            items: { type: 'string', enum: [...SENTIMENT_VALUES] },
            description: 'Optional. One or more sentiment exact values.',
          },
          visual_style: {
            type: 'array',
            items: { type: 'string', enum: [...VISUAL_STYLE_VALUES] },
            description: 'Optional. One or more visual style exact values.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'semantic_search',
      description:
        'Search campaigns by meaning (embeddings), not exact words. PREFER this when the user describes a theme or concept (e.g. "travel benefits", "no fee", "rewards") without naming a specific filter value, or when combining a concept with optional filters. Use filter_campaigns FIRST when the user names a channel, sentiment, or value prop; then use semantic_search to rank by meaning within that set (pass the same channel/sentiment/value_prop). Choose embedding_field: value_prop_embedding for value/offers, copy_embedding for ad copy, visual_embedding for imagery/style. Use EXACT enum values for filter parameters.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query (concept or theme)' },
          embedding_field: {
            type: 'string',
            enum: ['value_prop_embedding', 'copy_embedding', 'visual_embedding'],
            description: 'value_prop_embedding for value/offers, copy_embedding for text/copy, visual_embedding for imagery',
          },
          channel: {
            type: 'array',
            items: { type: 'string', enum: [...CHANNEL_VALUES] },
            description: 'Optional. One or more of: facebook, instagram, twitter, email, direct_mail.',
          },
          value_prop: {
            type: 'array',
            items: { type: 'string', enum: [...VALUE_PROP_VALUES] },
            description: 'Optional. One or more value prop exact values.',
          },
          sentiment: {
            type: 'array',
            items: { type: 'string', enum: [...SENTIMENT_VALUES] },
            description: 'Optional. One or more sentiment exact values.',
          },
          visual_style: {
            type: 'array',
            items: { type: 'string', enum: [...VISUAL_STYLE_VALUES] },
            description: 'Optional. One or more visual style exact values.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'full_text_search',
      description:
        'Search for exact words or phrases in campaign COPY (campaign_text, full_campaign_text) — the main ad body text, NOT the offer field. Use when the user cares about specific wording in the ad copy (e.g. "that say APR", "mention limited time"). Use search_offers when they care about offer or incentives text; use semantic_search when they care about meaning/theme, not exact wording. Use EXACT enum value for channel if provided.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Exact words or phrase to search for in campaign copy' },
          channel: {
            type: 'array',
            items: { type: 'string', enum: [...CHANNEL_VALUES] },
            description: 'Optional. One or more of: facebook, instagram, twitter, email, direct_mail.',
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

export interface SearchOffersParams {
  query: string;
  channel?: string[];
  value_prop?: string[];
  sentiment?: string[];
  visual_style?: string[];
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

export async function runSearchOffers(
  params: SearchOffersParams,
  baseFilters?: ActiveFilters
): Promise<ToolResult> {
  const merged = mergeFilters(baseFilters ?? {}, {
    channel: params.channel,
    value_prop: params.value_prop,
    sentiment: params.sentiment,
    visual_style: params.visual_style,
  });

  let query = supabaseAdmin
    .from('campaigns')
    .select('*')
    .not('offer', 'is', null)
    .ilike('offer', `%${params.query}%`)
    .limit(50);

  if (merged.channel?.length) {
    query = query.in('channel', merged.channel);
  }
  if (merged.value_prop?.length) {
    query = query.overlaps('key_value_props', merged.value_prop);
  }
  if (merged.sentiment?.length) {
    query = query.in('imagery_sentiment', merged.sentiment);
  }
  if (merged.visual_style?.length) {
    query = query.in('imagery_visual_style', merged.visual_style);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('Search offers failed:', error.message);
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
    case 'search_offers':
      return (params, baseFilters) =>
        runSearchOffers(params as unknown as SearchOffersParams, baseFilters);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
