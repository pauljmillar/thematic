# Setup Guide

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   - Copy `.env.local.example` to `.env.local` (if it exists)
   - Fill in all required environment variables (see README.md)

3. **Set up database**
   - Go to Supabase SQL Editor
   - Run the contents of `lib/supabase/schema.sql`
   - Verify tables and function are created

4. **Prepare images**
   - Place campaign images in `images/` directory
   - Supported formats: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`

5. **Run ingestion**
   ```bash
   npm run ingest
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

## Database Setup Details

### Supabase Configuration

1. Create a new Supabase project
2. Go to SQL Editor
3. Enable pgvector extension:
   ```sql
   create extension if not exists vector;
   ```
4. Run the complete schema from `lib/supabase/schema.sql`
5. Verify:
   - `campaigns` table exists
   - `campaign_vectors` table exists
   - `search_campaigns` function exists
   - All indexes are created

### AWS S3 Setup

1. Create an S3 bucket
2. Configure bucket for public read access (for images)
3. Create IAM user with S3 upload permissions
4. Add credentials to `.env.local`

## Troubleshooting

### Ingestion fails
- Check API keys are valid
- Verify S3 bucket permissions
- Ensure database schema is set up correctly

### Vector search not working
- Verify `search_campaigns` function exists in Supabase
- Check that embeddings are being generated (1536 dimensions)
- Ensure pgvector extension is enabled

### Images not displaying
- Verify S3 bucket has public read access
- Check that `image_s3_url` is populated in database
- Verify CORS settings if needed

## Development Commands

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run ingest` - Run image ingestion script
