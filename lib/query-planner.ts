import { embedText } from './embeddings';
import { type ActiveFilters, mergeFilters } from './filters';

export type QueryType = 'vector_search' | 'aggregation' | 'time_trend' | 'channel_comparison' | 'hybrid';

export interface QueryPlan {
  type: QueryType;
  vectorField?: 'value_prop_embedding' | 'copy_embedding' | 'visual_embedding';
  queryEmbedding?: number[];
  filters?: {
    channel?: string[];
    value_prop?: string[];
    sentiment?: string[];
    visual_style?: string[];
    date_range?: { start?: string; end?: string };
  };
  aggregation?: {
    groupBy?: 'channel' | 'value_prop' | 'sentiment' | 'visual_style' | 'date';
    metric?: 'count' | 'avg_spend' | 'total_spend';
  };
}

// Keywords that indicate different query types
const VECTOR_SEARCH_KEYWORDS = ['show me', 'find', 'search', 'similar', 'like', 'matching', 'with'];
const AGGREGATION_KEYWORDS = ['most', 'dominant', 'prevalent', 'common', 'top', 'highest', 'lowest', 'average'];
const TREND_KEYWORDS = ['trend', 'over time', 'over the years', 'evolution', 'change', 'growth', 'decline'];
const COMPARISON_KEYWORDS = ['compare', 'comparison', 'versus', 'vs', 'across', 'by channel', 'by platform'];

// Value prop keywords
const VALUE_PROP_KEYWORDS = {
  'No Fee / No Minimum': ['no fee', 'no minimum', 'fee-free', 'minimum'],
  'Cash Back / Rewards': ['cash back', 'rewards', 'points', 'cashback'],
  'Travel Benefits': ['travel', 'miles', 'airline', 'hotel'],
  'High-Yield Savings': ['high yield', 'savings', 'interest rate', 'apy'],
  'Credit Building': ['credit building', 'build credit', 'credit score'],
  'Security / Fraud Protection': ['security', 'fraud', 'protection', 'secure'],
};

// Channel keywords
const CHANNEL_KEYWORDS = {
  facebook: ['facebook', 'fb'],
  instagram: ['instagram', 'ig'],
  twitter: ['twitter', 'x.com', 'tweet'],
  email: ['email', 'mail'],
  direct_mail: ['direct mail', 'mail', 'postal'],
};

export async function planQuery(
  userMessage: string,
  baseFilters: ActiveFilters = {}
): Promise<QueryPlan> {
  const lowerMessage = userMessage.toLowerCase();

  // Detect query type based on keywords
  const isVectorSearch = VECTOR_SEARCH_KEYWORDS.some((kw) => lowerMessage.includes(kw));
  const isAggregation = AGGREGATION_KEYWORDS.some((kw) => lowerMessage.includes(kw));
  const isTrend = TREND_KEYWORDS.some((kw) => lowerMessage.includes(kw));
  const isComparison = COMPARISON_KEYWORDS.some((kw) => lowerMessage.includes(kw));

  // Extract filters from chat message
  const chatFilters: QueryPlan['filters'] = {};

  // Detect channel filters from chat
  const detectedChannels: string[] = [];
  for (const [channel, keywords] of Object.entries(CHANNEL_KEYWORDS)) {
    if (keywords.some((kw) => lowerMessage.includes(kw))) {
      detectedChannels.push(channel);
    }
  }
  if (detectedChannels.length > 0) {
    chatFilters.channel = detectedChannels;
  }

  // Detect value prop filters from chat
  const detectedValueProps: string[] = [];
  for (const [valueProp, keywords] of Object.entries(VALUE_PROP_KEYWORDS)) {
    if (keywords.some((kw) => lowerMessage.includes(kw))) {
      detectedValueProps.push(valueProp);
    }
  }
  if (detectedValueProps.length > 0) {
    chatFilters.value_prop = detectedValueProps;
  }

  // Merge chat-detected filters with base filters
  // Chat filters take precedence (override base filters for the same type)
  const mergedFilters = mergeFilters(baseFilters, chatFilters);
  
  // Convert to QueryPlan filters format
  const filters: QueryPlan['filters'] = {};
  if (mergedFilters.channel && mergedFilters.channel.length > 0) {
    filters.channel = mergedFilters.channel;
  }
  if (mergedFilters.value_prop && mergedFilters.value_prop.length > 0) {
    filters.value_prop = mergedFilters.value_prop;
  }
  if (mergedFilters.sentiment && mergedFilters.sentiment.length > 0) {
    filters.sentiment = mergedFilters.sentiment;
  }
  if (mergedFilters.visual_style && mergedFilters.visual_style.length > 0) {
    filters.visual_style = mergedFilters.visual_style;
  }
  if (mergedFilters.date_range) {
    filters.date_range = mergedFilters.date_range;
  }

  // Determine which embedding field to use
  let vectorField: QueryPlan['vectorField'] = 'value_prop_embedding';
  if (lowerMessage.includes('visual') || lowerMessage.includes('style') || lowerMessage.includes('image')) {
    vectorField = 'visual_embedding';
  } else if (lowerMessage.includes('text') || lowerMessage.includes('copy') || lowerMessage.includes('message')) {
    vectorField = 'copy_embedding';
  }

  // Determine query type
  let queryType: QueryType = 'vector_search';
  let aggregation: QueryPlan['aggregation'] | undefined;

  if (isTrend) {
    queryType = 'time_trend';
    aggregation = {
      groupBy: 'date',
      metric: 'count',
    };
  } else if (isComparison) {
    queryType = 'channel_comparison';
    aggregation = {
      groupBy: 'channel',
      metric: 'count',
    };
  } else if (isAggregation) {
    queryType = 'aggregation';
    // Determine what to aggregate by
    if (lowerMessage.includes('channel') || lowerMessage.includes('platform')) {
      aggregation = { groupBy: 'channel', metric: 'count' };
    } else if (lowerMessage.includes('value prop') || lowerMessage.includes('value proposition')) {
      aggregation = { groupBy: 'value_prop', metric: 'count' };
    } else if (lowerMessage.includes('sentiment')) {
      aggregation = { groupBy: 'sentiment', metric: 'count' };
    } else if (lowerMessage.includes('style') || lowerMessage.includes('visual')) {
      aggregation = { groupBy: 'visual_style', metric: 'count' };
    } else {
      aggregation = { groupBy: 'channel', metric: 'count' }; // Default
    }
  }

  // If we have filters and vector search, it's a hybrid query
  if (isVectorSearch && (Object.keys(filters).length > 0 || isAggregation)) {
    queryType = 'hybrid';
  }

  // Note: The filters object now contains merged filters (base + chat-detected)

  // Generate embedding for vector search
  let queryEmbedding: number[] | undefined;
  if (queryType === 'vector_search' || queryType === 'hybrid') {
    queryEmbedding = await embedText(userMessage);
  }

  return {
    type: queryType,
    vectorField,
    queryEmbedding,
    filters: Object.keys(filters).length > 0 ? filters : undefined,
    aggregation,
  };
}
