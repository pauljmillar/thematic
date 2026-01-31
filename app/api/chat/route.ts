import { NextRequest, NextResponse } from 'next/server';
import { type ActiveFilters } from '@/lib/filters';
import { CHAT_TOOLS, getToolRunner, type ToolResult } from '@/lib/chat-tools';
import OpenAI from 'openai';

const MAX_AGENT_ITERATIONS = 5;

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openai = new OpenAI({ apiKey });
  }
  return openai;
}

const SYSTEM_MESSAGE = `You are an AI assistant helping analyze marketing campaign data. You have access to four tools. Always use EXACT values from each tool's parameter enums for channel, value_prop, sentiment, and visual_style (e.g. "Aspirational" not "aspirational", "Cash Back / Rewards" not "cash back").

Chaining: When the user says something like "highest value offers from Instagram", call filter_campaigns FIRST (e.g. channel: ["instagram"], has_offer: true), then call search_offers ONCE with a single query (e.g. query: "value", channel: ["instagram"]). Do NOT call search_offers multiple times with different keywords — use one query string per question.

Tools:
- filter_campaigns: Use FIRST when the user names a channel (Instagram, Facebook, etc.), sentiment (aspirational, premium), value prop (Cash Back), or "with an offer". Use exact enum values.
- search_offers: Search within offer and incentives text. Call ONCE per question with ONE query (e.g. "value" or "highest value"), not multiple times with "highest", "value", "bonus", "offer" separately. Chain after filter_campaigns with the same filters.
- semantic_search: Search by meaning/theme when the user describes a concept without naming a filter, or to rank by relevance within a filtered set (pass same filters).
- full_text_search: Search exact wording in campaign COPY only (not offer field). Use when the user cares about specific words in the ad body.

After each tool result you can call another tool or provide your final answer. Use the summary_for_llm in the tool result to answer. Be concise and cite the data. If no campaigns were found, say so and suggest alternatives.`;

export async function POST(request: NextRequest) {
  try {
    const { message, activeFilters = {} } = await request.json();

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const baseFilters: ActiveFilters = activeFilters as ActiveFilters;

    const client = getOpenAIClient();
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_MESSAGE },
      { role: 'user', content: message },
    ];

    let finalAnswer = '';
    let lastToolResult: ToolResult | null = null;
    const detectedFilters: ActiveFilters = {};
    const debugSteps: string[] = [];

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      debugSteps.push(`[Iteration ${i + 1}] Calling LLM...`);
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools: CHAT_TOOLS as OpenAI.Chat.Completions.ChatCompletionTool[],
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1024,
      });

      const msg = completion.choices[0]?.message;
      if (!msg) {
        finalAnswer = "I couldn't generate a response. Please try again.";
        break;
      }

      if (!msg.tool_calls?.length) {
        debugSteps.push(`[Iteration ${i + 1}] No tool calls — returning final answer.`);
        finalAnswer = (msg.content ?? '').trim() || "I don't have enough data to answer. Try asking to search or filter campaigns.";
        break;
      }

      debugSteps.push(`[Iteration ${i + 1}] Tool calls: ${msg.tool_calls.map((tc) => ('function' in tc ? tc.function?.name : '?')).join(', ')}`);
      messages.push({
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const tc of msg.tool_calls) {
        const fn = 'function' in tc ? tc.function : undefined;
        const name = fn?.name ?? '';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn?.arguments ?? '{}');
        } catch {
          args = {};
        }

        try {
          debugSteps.push(`  → Calling tool: ${name}(${JSON.stringify(args)})`);
          const runner = getToolRunner(name);
          const result = await runner(args, baseFilters);
          lastToolResult = result;
          debugSteps.push(`  ← Result: count=${result.count}`);

          if (name === 'filter_campaigns' || name === 'search_offers') {
            if (args.channel && Array.isArray(args.channel)) detectedFilters.channel = args.channel as string[];
            if (args.value_prop && Array.isArray(args.value_prop)) detectedFilters.value_prop = args.value_prop as string[];
            if (args.sentiment && Array.isArray(args.sentiment)) detectedFilters.sentiment = args.sentiment as string[];
            if (args.visual_style && Array.isArray(args.visual_style)) detectedFilters.visual_style = args.visual_style as string[];
          }

          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result.summary_for_llm,
          });
        } catch (err) {
          console.error(`Tool ${name} error:`, err);
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          debugSteps.push(`  ← Error: ${errMsg}`);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `Error running ${name}: ${errMsg}.`,
          });
        }
      }
    }

    const suggestions = generateSuggestions(finalAnswer, lastToolResult);

    return NextResponse.json({
      response: finalAnswer,
      campaigns: lastToolResult?.campaigns ?? [],
      total: lastToolResult?.count ?? 0,
      suggestions,
      detectedFilters: Object.keys(detectedFilters).length > 0 ? detectedFilters : undefined,
      debugSteps,
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

function generateSuggestions(_response: string, lastResult: ToolResult | null): string[] {
  const suggestions: string[] = [];
  if (lastResult && lastResult.count > 0) {
    suggestions.push('Show me the most common value propositions');
    suggestions.push('Compare campaigns across different channels');
    suggestions.push('What visual styles are trending?');
  } else {
    suggestions.push('Show me campaigns emphasizing travel benefits');
    suggestions.push('What are the offers from Cash Back campaigns?');
    suggestions.push('Find aspirational campaigns on Instagram');
  }
  return suggestions.slice(0, 3);
}
