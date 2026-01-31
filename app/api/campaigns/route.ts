import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { type Campaign } from '@/lib/supabase/client';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const channel = searchParams.get('channel');
    const valueProp = searchParams.get('value_prop');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const page = parseInt(searchParams.get('page') || '1');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam) : null; // null means no limit
    const offset = limit ? (page - 1) * limit : 0;

    let query = supabase.from('campaigns').select('*', { count: 'exact' });

    // Apply filters
    if (channel) {
      query = query.eq('channel', channel);
    }

    if (valueProp) {
      query = query.contains('key_value_props', [valueProp]);
    }

    if (startDate) {
      query = query.gte('capture_date', startDate);
    }

    if (endDate) {
      query = query.lte('capture_date', endDate);
    }

    // Apply pagination only if limit is specified
    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }
    query = query.order('created_at', { ascending: false });

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    return NextResponse.json({
      campaigns: (data || []) as Campaign[],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: limit ? Math.ceil((count || 0) / limit) : 1,
      },
    });
  } catch (error) {
    console.error('Campaigns API error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch campaigns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
