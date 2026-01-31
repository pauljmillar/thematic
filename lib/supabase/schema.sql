-- Enable pgvector extension
create extension if not exists vector;

-- Campaigns table (structured analytics)
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),

  company text,
  brand text,
  channel text check (channel in (
    'facebook',
    'instagram',
    'twitter',
    'email',
    'direct_mail'
  )),

  primary_product text,
  offer text,

  incentives text[],
  key_value_props text[],

  campaign_text text,
  full_campaign_text text,

  imagery_sentiment text,
  imagery_visual_style text,
  imagery_primary_subject text,
  imagery_demographics text[],

  volume integer,
  spend numeric(12,2),

  capture_date date,
  image_s3_urls text[],

  created_at timestamptz default now()
);

-- Campaign vectors table (semantic retrieval)
create table if not exists campaign_vectors (
  campaign_id uuid references campaigns(id) on delete cascade,

  value_prop_embedding vector(1536),
  copy_embedding vector(1536),
  visual_embedding vector(1536),

  primary key (campaign_id)
);

-- Full-text search: generated column and GIN index for campaign copy
alter table campaigns
  add column if not exists text_search_vector tsvector
  generated always as (
    to_tsvector('english', coalesce(campaign_text, '') || ' ' || coalesce(full_campaign_text, ''))
  ) stored;
create index if not exists idx_campaigns_text_search on campaigns using gin(text_search_vector);

-- Indexes for performance
create index if not exists idx_campaigns_channel on campaigns(channel);
create index if not exists idx_campaigns_capture_date on campaigns(capture_date);
create index if not exists idx_campaigns_company on campaigns(company);
create index if not exists idx_campaigns_key_value_props on campaigns using gin(key_value_props);

-- Vector similarity indexes (using HNSW for better performance)
create index if not exists idx_campaign_vectors_value_prop on campaign_vectors 
  using hnsw (value_prop_embedding vector_cosine_ops);
create index if not exists idx_campaign_vectors_copy on campaign_vectors 
  using hnsw (copy_embedding vector_cosine_ops);
create index if not exists idx_campaign_vectors_visual on campaign_vectors 
  using hnsw (visual_embedding vector_cosine_ops);

-- Vector search function for semantic similarity queries
create or replace function search_campaigns(
  query_embedding vector(1536),
  embedding_field text default 'value_prop_embedding',
  match_threshold float default 0.7,
  match_count int default 20,
  filter_channels text[] default null,
  filter_value_props text[] default null
)
returns table (
  campaign_id uuid,
  similarity float,
  campaigns jsonb
)
language plpgsql
as $$
begin
  return query
  select
    cv.campaign_id,
    case embedding_field
      when 'value_prop_embedding' then 1 - (cv.value_prop_embedding <=> query_embedding)
      when 'copy_embedding' then 1 - (cv.copy_embedding <=> query_embedding)
      when 'visual_embedding' then 1 - (cv.visual_embedding <=> query_embedding)
      else 1 - (cv.value_prop_embedding <=> query_embedding)
    end as similarity,
    row_to_json(c.*)::jsonb as campaigns
  from campaign_vectors cv
  join campaigns c on c.id = cv.campaign_id
  where
    case embedding_field
      when 'value_prop_embedding' then cv.value_prop_embedding is not null and 1 - (cv.value_prop_embedding <=> query_embedding) > match_threshold
      when 'copy_embedding' then cv.copy_embedding is not null and 1 - (cv.copy_embedding <=> query_embedding) > match_threshold
      when 'visual_embedding' then cv.visual_embedding is not null and 1 - (cv.visual_embedding <=> query_embedding) > match_threshold
      else cv.value_prop_embedding is not null and 1 - (cv.value_prop_embedding <=> query_embedding) > match_threshold
    end
    and (filter_channels is null or c.channel = any(filter_channels))
    and (filter_value_props is null or c.key_value_props && filter_value_props)
  order by similarity desc
  limit match_count;
end;
$$;

-- Full-text search: search campaign copy by words/phrases
create or replace function search_campaigns_by_text(
  query_text text,
  limit_count int default 50,
  filter_channels text[] default null
)
returns setof campaigns
language plpgsql
as $$
begin
  return query
  select c.*
  from campaigns c
  where
    c.text_search_vector @@ plainto_tsquery('english', query_text)
    and (filter_channels is null or c.channel = any(filter_channels))
  order by ts_rank(c.text_search_vector, plainto_tsquery('english', query_text)) desc
  limit limit_count;
end;
$$;
