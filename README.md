# Multimodal Marketing Campaign Intelligence

A web application that analyzes image-based marketing campaigns for credit cards across multiple channels.

## Quick Links

- **[Progress Checklist](docs/PROGRESS.md)** - Track setup progress and see what's next ⭐
- **[Setup Guide](docs/SETUP.md)** - Step-by-step setup instructions
- **[Architecture](docs/ARCHITECTURE.md)** - System design and component overview

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables in .env.local
# (See docs/README.md for required variables)

# Set up database (run lib/supabase/schema.sql in Supabase)

# Run ingestion
npm run ingest

# Start dev server
npm run dev
```

## Project Structure

- `app/` - Next.js App Router (pages, API routes, components)
- `lib/` - Core libraries (Gemini, OpenAI, S3, Supabase, query planning)
- `scripts/` - Ingestion script
- `images/` - Local campaign images (gitignored)
- `docs/` - Documentation

## Tech Stack

- Next.js 14+ (App Router)
- Supabase (PostgreSQL + pgvector)
- AWS S3
- Google Gemini Vision API
- OpenAI Embeddings API
- TypeScript, Tailwind CSS

For detailed documentation, see the [docs/](docs/) folder.
