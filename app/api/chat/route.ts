import { NextRequest, NextResponse } from 'next/server';
import { planQuery } from '@/lib/query-planner';
import { executeQuery } from '@/lib/query-executor';

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Plan the query
    const queryPlan = await planQuery(message);

    // Execute the query
    const result = await executeQuery(queryPlan);

    // Generate natural language response
    const response = generateResponse(message, queryPlan, result);

    // Generate suggested follow-up queries
    const suggestions = generateSuggestions(queryPlan, result);

    return NextResponse.json({
      response,
      campaigns: result.campaigns,
      aggregation: result.aggregation,
      total: result.total || result.campaigns.length,
      suggestions,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process query',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateResponse(
  userMessage: string,
  plan: ReturnType<typeof planQuery> extends Promise<infer T> ? T : never,
  result: Awaited<ReturnType<typeof executeQuery>>
): string {
  const { type, aggregation } = plan;
  const { campaigns, aggregation: aggData, total } = result;

  if (type === 'aggregation' || type === 'channel_comparison' || type === 'time_trend') {
    if (aggData && Object.keys(aggData).length > 0) {
      const topItems = Object.entries(aggData)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([key, count]) => `${key}: ${count}`)
        .join(', ');

      return `I found ${total || campaigns.length} campaigns. Here are the top results: ${topItems}.`;
    }
    return `I found ${total || campaigns.length} campaigns matching your query.`;
  }

  if (campaigns.length === 0) {
    return "I couldn't find any campaigns matching your query. Try adjusting your search terms.";
  }

  if (campaigns.length === 1) {
    const campaign = campaigns[0];
    return `I found 1 campaign: ${campaign.company || 'Unknown company'} - ${campaign.offer || 'No offer specified'}.`;
  }

  return `I found ${campaigns.length} campaigns matching your query. Here are the results:`;
}

function generateSuggestions(
  plan: ReturnType<typeof planQuery> extends Promise<infer T> ? T : never,
  result: Awaited<ReturnType<typeof executeQuery>>
): string[] {
  const suggestions: string[] = [];

  if (plan.type === 'vector_search') {
    suggestions.push('Show me the most common value propositions');
    suggestions.push('Compare campaigns across different channels');
    suggestions.push('What visual styles are trending?');
  } else if (plan.type === 'aggregation') {
    if (plan.aggregation?.groupBy === 'channel') {
      suggestions.push('Show me campaigns from Instagram');
      suggestions.push('Find campaigns with cash back offers');
    } else {
      suggestions.push('Show me campaigns by channel');
      suggestions.push('Find campaigns with no fee offers');
    }
  } else {
    suggestions.push('Show me campaigns emphasizing travel benefits');
    suggestions.push('What are the most common value propositions?');
    suggestions.push('Compare Instagram vs Facebook campaigns');
  }

  return suggestions.slice(0, 3);
}
