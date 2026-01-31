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

const SYSTEM_MESSAGE = `You are an AI assistant helping analyze marketing campaign data. You have access to tools to search and filter campaigns.

Tools:
- semantic_search: Search campaigns by meaning (e.g. "travel benefits", "no fee offers"). Use for concept-based queries.
- filter_campaigns: Filter by structured fields (channel, sentiment, value prop, visual style, date range, has_offer). Use when the user asks for specific dimensions (e.g. "Instagram campaigns", "aspirational", "Cash Back") or "what are the offers from recent Cash Back, Premium campaigns" (filter first, then answer from the result).
- full_text_search: Search for exact words or phrases in campaign copy. Use when the user asks for campaigns that "mention X" or "say Y".

Call one or more tools to answer the user. After each tool result you can call another tool or provide your final answer. Use the summary_for_llm in the tool result to answer. Be concise and cite the data. If no campaigns were found, say so and suggest alternatives.`;

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

          if (name === 'filter_campaigns') {
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
