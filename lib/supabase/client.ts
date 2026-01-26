import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for client-side operations
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
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
  image_s3_url: string | null;
  created_at: string;
}

export interface CampaignVector {
  campaign_id: string;
  value_prop_embedding: number[] | null;
  copy_embedding: number[] | null;
  visual_embedding: number[] | null;
}
