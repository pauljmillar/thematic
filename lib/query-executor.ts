import { supabaseAdmin, type Campaign } from './supabase/client';
import { type QueryPlan } from './query-planner';

export interface QueryResult {
  campaigns: Campaign[];
  aggregation?: Record<string, number>;
  total?: number;
}

export async function executeQuery(plan: QueryPlan): Promise<QueryResult> {
  const { type, vectorField, queryEmbedding, filters, aggregation } = plan;

  if (type === 'vector_search' || type === 'hybrid') {
    return executeVectorSearch(plan);
  } else if (type === 'aggregation' || type === 'channel_comparison' || type === 'time_trend') {
    return executeAggregation(plan);
  } else {
    // Fallback: simple filtered query
    return executeFilteredQuery(plan);
  }
}

async function executeVectorSearch(plan: QueryPlan): Promise<QueryResult> {
  const { vectorField = 'value_prop_embedding', queryEmbedding, filters } = plan;

  if (!queryEmbedding) {
    throw new Error('Query embedding is required for vector search');
  }

  // Build the vector search query
  let query = supabaseAdmin
    .from('campaign_vectors')
    .select(
      `
      campaign_id,
      ${vectorField},
      campaigns (*)
    `
    )
    .order(vectorField, { ascending: false, nullsFirst: false })
    .limit(20);

  // Apply filters if any
  if (filters) {
    if (filters.channel && filters.channel.length > 0) {
      query = query.in('campaigns.channel', filters.channel);
    }
    if (filters.value_prop && filters.value_prop.length > 0) {
      query = query.overlaps('campaigns.key_value_props', filters.value_prop);
    }
    if (filters.sentiment && filters.sentiment.length > 0) {
      query = query.in('campaigns.imagery_sentiment', filters.sentiment);
    }
    if (filters.visual_style && filters.visual_style.length > 0) {
      query = query.in('campaigns.imagery_visual_style', filters.visual_style);
    }
  }

  // For vector search, we need to use raw SQL with cosine similarity
  // Use RPC function for proper vector similarity search
  // Convert array to PostgreSQL vector format string
  const embeddingStr = `[${queryEmbedding.join(',')}]`;
  
  const { data, error } = await supabaseAdmin.rpc('search_campaigns', {
    query_embedding: embeddingStr,
    embedding_field: vectorField,
    match_threshold: 0.7,
    match_count: 20,
    filter_channels: filters?.channel || null,
    filter_value_props: filters?.value_prop || null,
  });

  if (error) {
    // Fallback to simple filtered query if RPC doesn't exist or fails
    console.warn('Vector search RPC failed, falling back to filtered query:', error.message);
    return executeFilteredQuery(plan);
  }

  // Transform RPC result to campaigns
  const campaigns = (data || [])
    .map((item: any) => {
      if (item.campaigns && typeof item.campaigns === 'object') {
        return item.campaigns as Campaign;
      }
      return null;
    })
    .filter(Boolean) as Campaign[];

  return {
    campaigns,
  };
}

async function executeAggregation(plan: QueryPlan): Promise<QueryResult> {
  const { aggregation, filters } = plan;

  if (!aggregation) {
    return executeFilteredQuery(plan);
  }

  // Build base query
  let query = supabaseAdmin.from('campaigns').select('*');

  // Apply filters
  if (filters) {
    if (filters.channel && filters.channel.length > 0) {
      query = query.in('channel', filters.channel);
    }
    if (filters.value_prop && filters.value_prop.length > 0) {
      query = query.overlaps('key_value_props', filters.value_prop);
    }
    if (filters.sentiment && filters.sentiment.length > 0) {
      query = query.in('imagery_sentiment', filters.sentiment);
    }
    if (filters.visual_style && filters.visual_style.length > 0) {
      query = query.in('imagery_visual_style', filters.visual_style);
    }
    if (filters.date_range) {
      if (filters.date_range.start) {
        query = query.gte('capture_date', filters.date_range.start);
      }
      if (filters.date_range.end) {
        query = query.lte('capture_date', filters.date_range.end);
      }
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  const campaigns = (data || []) as Campaign[];

  // Perform aggregation in memory (for POC)
  const aggregationResult: Record<string, number> = {};

  if (aggregation.groupBy === 'channel') {
    campaigns.forEach((campaign) => {
      const key = campaign.channel || 'unknown';
      aggregationResult[key] = (aggregationResult[key] || 0) + 1;
    });
  } else if (aggregation.groupBy === 'value_prop') {
    campaigns.forEach((campaign) => {
      campaign.key_value_props?.forEach((vp) => {
        aggregationResult[vp] = (aggregationResult[vp] || 0) + 1;
      });
    });
  } else if (aggregation.groupBy === 'sentiment') {
    campaigns.forEach((campaign) => {
      const key = campaign.imagery_sentiment || 'unknown';
      aggregationResult[key] = (aggregationResult[key] || 0) + 1;
    });
  } else if (aggregation.groupBy === 'visual_style') {
    campaigns.forEach((campaign) => {
      const key = campaign.imagery_visual_style || 'unknown';
      aggregationResult[key] = (aggregationResult[key] || 0) + 1;
    });
  } else if (aggregation.groupBy === 'date') {
    campaigns.forEach((campaign) => {
      const key = campaign.capture_date || 'unknown';
      aggregationResult[key] = (aggregationResult[key] || 0) + 1;
    });
  }

  return {
    campaigns: campaigns.slice(0, 20), // Return top 20 for display
    aggregation: aggregationResult,
    total: campaigns.length,
  };
}

async function executeFilteredQuery(plan: QueryPlan): Promise<QueryResult> {
  const { filters } = plan;

  let query = supabaseAdmin.from('campaigns').select('*').limit(50);

  if (filters) {
    if (filters.channel && filters.channel.length > 0) {
      query = query.in('channel', filters.channel);
    }
    if (filters.value_prop && filters.value_prop.length > 0) {
      query = query.overlaps('key_value_props', filters.value_prop);
    }
    if (filters.sentiment && filters.sentiment.length > 0) {
      query = query.in('imagery_sentiment', filters.sentiment);
    }
    if (filters.visual_style && filters.visual_style.length > 0) {
      query = query.in('imagery_visual_style', filters.visual_style);
    }
    if (filters.date_range) {
      if (filters.date_range.start) {
        query = query.gte('capture_date', filters.date_range.start);
      }
      if (filters.date_range.end) {
        query = query.lte('capture_date', filters.date_range.end);
      }
    }
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  return {
    campaigns: (data || []) as Campaign[],
  };
}
