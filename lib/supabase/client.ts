import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazy-load clients to ensure env vars are loaded first
let supabaseClient: SupabaseClient | null = null;
let supabaseAdminClient: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
  }
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable is not set');
  }
  return key;
}

function getSupabaseServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  }
  return key;
}

// Client for client-side operations
function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  }
  return supabaseClient;
}

// Admin client for server-side operations (bypasses RLS)
function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(getSupabaseUrl(), getSupabaseServiceKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdminClient;
}

// Export with Proxy to intercept all property access and lazy-initialize
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop];
  },
});

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdminClient() as any)[prop];
  },
});

// Database types
export interface Campaign {
  id: string;
  company: string | null;
  brand: string | null;
  channel: 'facebook' | 'instagram' | 'twitter' | 'email' | 'direct_mail' | null;
  primary_product: string | null;
  offer: string | null;
  incentives: string[] | null;
  key_value_props: string[] | null;
  campaign_text: string | null;
  full_campaign_text: string | null;
  imagery_sentiment: string | null;
  imagery_visual_style: string | null;
  imagery_primary_subject: string | null;
  imagery_demographics: string[] | null;
  volume: number | null;
  spend: number | null;
  capture_date: string | null;
  image_s3_urls: string[] | null;
  created_at: string;
}

export interface CampaignVector {
  campaign_id: string;
  value_prop_embedding: number[] | null;
  copy_embedding: number[] | null;
  visual_embedding: number[] | null;
}
