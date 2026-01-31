# Agentic Chat: Full Replacement Plan

## Goal

Replace the current single-shot flow (planQuery → executeQuery → generateLLMResponse) with an agent loop. No feature flag: all chat requests use the agent. Max 5 tool-call iterations. Tool result format must support both:

- **"Show me campaigns that..."** — Return campaigns for UI display (cards).
- **"What are the offers from recent Cash Back, Premium campaigns?"** — Filter first, then return enough structured detail (e.g. offer, key_value_props, sentiment) so the agent can analyze the filtered set and answer with a short summary (e.g. "Here are the main offers: X, Y, Z").

---

## Current vs New Flow

**Current:** User message → planQuery (keyword logic) → executeQuery (one path) → generateLLMResponse → return.

**New:** User message → agent loop (max 5 iterations): LLM chooses tool → backend runs tool → tool result (count + summary for LLM + full campaigns) appended to conversation → LLM either calls another tool or returns final answer → return response + campaigns from last/best tool.

---

## Tool Result Format (supports "show me" and "analyze details")

Every tool returns a **consistent shape** so the agent and API can handle both question types:

1. **count** (number) — How many campaigns matched.
2. **summary_for_llm** (string) — A text block the LLM reads to evaluate and answer. Include fields the user might ask about: company, brand, offer, key_value_props, imagery_sentiment, imagery_visual_style, capture_date, and a short campaign_text/full_campaign_text snippet. Format for readability, e.g. one line per campaign:  
   `"Campaign 1: Company A | Offer: Get 5% back | Value props: Cash Back, Premium | Sentiment: Aspirational | ..."`
   So for "what are the offers?", the agent gets the offer values in the tool result and can answer "The offers are: ..." without a second tool.
3. **campaigns** (array) — Full campaign objects for the API response. The UI uses this to render cards when the user said "show me campaigns"; for "what are the offers?" the UI can still show the filtered set or hide it depending on design.

**Example:** User asks "What are the offers from recent Cash Back, Premium campaigns?"

- Agent calls `filter_campaigns({ value_prop: ["Cash Back / Rewards"], sentiment: ["Premium"], date_range: recent })`.  
- Tool returns count, summary_for_llm (each campaign's offer, company, etc.), and campaigns.  
- Agent reads summary_for_llm and replies with a short list of offers. API returns that response plus the campaigns array for the UI.

---

## Tools (three)

| Tool | Purpose | Result shape |
|------|----------|--------------|
| **semantic_search** | Find by meaning (e.g. "travel benefits", "no fee"). | count, summary_for_llm, campaigns |
| **filter_campaigns** | Filter by channel, sentiment, value_prop, visual_style, offer, date_range. | count, summary_for_llm, campaigns |
| **full_text_search** | Search for words/phrases in campaign copy (new: PostgreSQL FTS). | count, summary_for_llm, campaigns |

All three return the same shape so the agent loop and API response handling stay simple.

---

## Implementation Outline

### 1. Shared tool result builder

Add a small helper (e.g. in `lib/chat-tools.ts`) that, given a list of campaigns, builds:

- `count = campaigns.length`
- `summary_for_llm` = string from campaigns (company, brand, offer, key_value_props, imagery_sentiment, imagery_visual_style, capture_date, and a short text snippet). Cap total length (e.g. first 20 campaigns, 2–3 lines each) to avoid blowing context.
- `campaigns` = full array

Every tool implementation calls this helper and returns that object.

### 2. Tool definitions (OpenAI function-calling)

In `lib/chat-tools.ts` (or equivalent), define the three tools in OpenAI format: name, description, parameters (JSON schema). Descriptions should clarify when to use each and that filter_campaigns is for "specific dimensions (channel, sentiment, value prop, visual style, offer, date)" and for questions like "what are the offers from X campaigns" (filter first, then answer from the result).

### 3. Tool implementations

- **semantic_search**: Use existing embed + `search_campaigns` RPC. Params: query, optional channel/value_prop/sentiment/visual_style, optional embedding_field. Apply base filters (activeFilters) when applyFiltersToQuery is true. Build tool result via the shared helper.
- **filter_campaigns**: Use existing filtered query (and optional aggregation). Params: channel, value_prop, sentiment, visual_style, date_range, has_offer. Build tool result via the shared helper. Ensure offer is included in summary_for_llm.
- **full_text_search**: New. Add PostgreSQL FTS (e.g. `to_tsvector` on campaign_text/full_campaign_text, GIN index) and RPC or Supabase query. Params: query, optional filters. Build tool result via the shared helper.

### 4. Agent loop

In `app/api/chat/route.ts` (or `lib/agent.ts` called from the route):

- Replace the current planQuery → executeQuery → generateLLMResponse flow entirely.
- Messages = [system, user]. System explains the three tools and that the agent can call them to answer; it should use filter_campaigns when the user asks about specific dimensions or "what are the offers/value props from X"; it should use semantic_search for concept-based search and full_text_search for "mentions X" or "says Y".
- Loop (max **5** iterations):
- Call OpenAI `chat.completions.create` with messages and tools.
- If response has no tool_calls: treat content as final answer; break.
- If response has tool_calls: for each, resolve to semantic_search / filter_campaigns / full_text_search, run with parsed args, build tool result (count, summary_for_llm, campaigns) with the shared helper. Append assistant message (with tool_calls) and each tool result as a tool message. Continue.
- After loop: return final answer. Set API response `campaigns` from the last tool result that returned campaigns (or merge from multiple if desired). Keep existing response shape: `{ response, campaigns, aggregation?, total?, suggestions?, detectedFilters? }`. detectedFilters can be derived from the tool calls (e.g. filter_campaigns params). suggestions: keep heuristic or generate from final answer.

### 5. Full-text search (DB)

In `lib/supabase/schema.sql`: add FTS (e.g. generated column or expression with `to_tsvector('english', coalesce(campaign_text,'') || ' ' || coalesce(full_campaign_text,''))`, GIN index). Add RPC `search_campaigns_by_text(query text, limit int, filter_channels text[], ...)` returning campaigns. Implement the tool in Node that calls this RPC and uses the shared tool-result helper.

### 6. Remove old path

Remove or bypass planQuery/executeQuery from the chat route; remove any code that branches on "use agent vs old flow". All requests go through the agent loop.

---

## Key Files

- `app/api/chat/route.ts` — Replace with agent loop; keep POST contract (message, activeFilters, applyFiltersToQuery) and response shape.
- **lib/chat-tools.ts** — Tool definitions (OpenAI format), shared tool-result builder, and the three tool runner functions (semantic_search, filter_campaigns, full_text_search).
- `lib/query-executor.ts` — Reuse executeVectorSearch, executeFilteredQuery, executeAggregation (or their internals) from within the tool runners; do not call planQuery.
- `lib/supabase/schema.sql` — Add FTS column/index and search_campaigns_by_text RPC.
- `lib/embeddings.ts` — Unchanged; used by semantic_search tool.

---

## Summary

- **Full replacement**: No feature flag; all chat uses the agent loop.
- **Max 5 iterations**: Cap tool-call loop at 5.
- **Tool result format**: Every tool returns count, summary_for_llm (rich text with offer, value props, sentiment, etc.), and campaigns. This supports "show me campaigns" (UI uses campaigns) and "what are the offers from X?" (agent reads summary_for_llm and answers; UI can still show campaigns).
- **Flow**: Filter first for "offers from Cash Back, Premium" via filter_campaigns → tool returns filtered set with offer details in summary_for_llm → agent analyzes and returns a short list of offers; API returns that response plus the campaigns array.
