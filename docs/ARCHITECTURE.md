# Architecture Overview

## System Architecture

```
Local Images
   ↓
Ingestion Script (Node.js)
   - Gemini Vision API
   - OpenAI Embeddings API
   - S3 Upload
   ↓
AWS S3 (Images)
Supabase (PostgreSQL + pgvector)
   - campaigns table (structured data)
   - campaign_vectors table (embeddings)
   ↓
Next.js UI
   - Chat panel (left)
   - Results / Charts / Tables (right)
```

## Key Components

### Data Flow

1. **Ingestion** (`scripts/ingest.ts`)
   - Reads images from `./images` directory
   - Analyzes with Gemini Vision → structured JSON
   - Uploads to S3 → returns public URL
   - Generates 3 embeddings (value_prop, copy, visual)
   - Stores in Supabase (campaigns + campaign_vectors)

2. **Query Processing** (`lib/query-planner.ts` + `lib/query-executor.ts`)
   - User message → query planner → detects intent
   - Routes to: vector search, SQL aggregation, or hybrid
   - Executes query → returns campaigns + metadata

3. **UI** (`app/page.tsx` + components)
   - Chat interface sends messages to `/api/chat`
   - Results panel displays campaigns with filters/aggregations

## Database Schema

### campaigns table
- Structured metadata extracted from images
- Fields: company, brand, channel, offer, value_props, imagery data, etc.

### campaign_vectors table
- Three embedding types (1536 dimensions each):
  - `value_prop_embedding`: Value propositions + offers
  - `copy_embedding`: Campaign text/messaging
  - `visual_embedding`: Visual style + sentiment

### Vector Search Function
- `search_campaigns()`: PostgreSQL function for cosine similarity search
- Supports filtering by channel, value_props
- Returns similarity scores

## Query Types

| User Intent | Strategy | Example |
|------------|----------|---------|
| "show me / find" | Vector search | "Show me campaigns with no fee offers" |
| "most prevalent" | SQL aggregation | "What value props dominate Instagram?" |
| "trend / over time" | Time-based grouping | "What visual styles are trending?" |
| "compare channels" | Filter + aggregation | "Compare Facebook vs Instagram" |

## File Structure

```
thematic/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── chat/          # Chat endpoint with query planning
│   │   └── campaigns/     # Campaign retrieval
│   ├── components/       # React components
│   │   ├── ChatPanel.tsx
│   │   ├── ResultsPanel.tsx
│   │   └── CampaignCard.tsx
│   └── page.tsx           # Main page (split-screen layout)
├── lib/                   # Core libraries
│   ├── gemini.ts          # Gemini Vision client
│   ├── embeddings.ts      # OpenAI embeddings
│   ├── s3.ts              # AWS S3 upload
│   ├── query-planner.ts   # Query intent detection
│   ├── query-executor.ts  # Query execution
│   └── supabase/
│       ├── client.ts      # Supabase client + types
│       └── schema.sql     # Database schema
├── scripts/
│   └── ingest.ts          # Image ingestion pipeline
├── images/                # Local images (gitignored)
└── docs/                  # Documentation
    ├── README.md
    └── ARCHITECTURE.md
```

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `AWS_S3_BUCKET_NAME`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

## Controlled Vocabularies

### Key Value Propositions
- No Fee / No Minimum
- Cash Back / Rewards
- Travel Benefits
- High-Yield Savings
- Credit Building
- Security / Fraud Protection

### Visual Styles
- Lifestyle Photography
- Minimalist Graphic
- Illustration
- Product-Centric
- Text-Heavy
- Abstract / Conceptual

### Sentiment
- Aspirational
- Trust-Building
- Urgent
- Playful
- Premium

## API Endpoints

### POST /api/chat
- Input: `{ message: string }`
- Output: `{ response: string, campaigns: Campaign[], aggregation?: Record<string, number>, suggestions: string[] }`
- Uses query planner to route to appropriate query strategy

### GET /api/campaigns
- Query params: `channel`, `value_prop`, `start_date`, `end_date`, `page`, `limit`
- Returns paginated campaign results

## Deployment

- **Local**: `npm run dev`
- **Production**: Deploy to Vercel
- **Ingestion**: Run `npm run ingest` locally (or set up scheduled job)

## Next Steps (Post-POC)

- Add confidence scores to Gemini extraction
- Implement charts (recharts)
- Add saved views/filters
- Batch ingestion optimization
- Caching layer for embeddings
