/**
 * Filter types and utilities for campaign filtering
 */

export interface ActiveFilters {
  channel?: string[];
  value_prop?: string[];
  sentiment?: string[];
  visual_style?: string[];
  date_range?: { start?: string; end?: string };
}

// Available filter options
export const CHANNEL_OPTIONS = [
  'facebook',
  'instagram',
  'twitter',
  'email',
  'direct_mail',
] as const;

export const VALUE_PROP_OPTIONS = [
  'No Fee / No Minimum',
  'Cash Back / Rewards',
  'Travel Benefits',
  'High-Yield Savings',
  'Credit Building',
  'Security / Fraud Protection',
] as const;

export const SENTIMENT_OPTIONS = [
  'Aspirational',
  'Trust-Building',
  'Urgent',
  'Playful',
  'Premium',
] as const;

export const VISUAL_STYLE_OPTIONS = [
  'Lifestyle Photography',
  'Minimalist Graphic',
  'Illustration',
  'Product-Centric',
  'Text-Heavy',
  'Abstract / Conceptual',
] as const;

/**
 * Check if a campaign matches the active filters
 */
export function matchesFilters(campaign: any, filters: ActiveFilters): boolean {
  // Channel filter
  if (filters.channel && filters.channel.length > 0) {
    if (!campaign.channel || !filters.channel.includes(campaign.channel)) {
      return false;
    }
  }

  // Value prop filter
  if (filters.value_prop && filters.value_prop.length > 0) {
    const campaignValueProps = campaign.key_value_props || [];
    const hasMatchingValueProp = filters.value_prop.some((vp) =>
      campaignValueProps.includes(vp)
    );
    if (!hasMatchingValueProp) {
      return false;
    }
  }

  // Sentiment filter
  if (filters.sentiment && filters.sentiment.length > 0) {
    if (
      !campaign.imagery_sentiment ||
      !filters.sentiment.includes(campaign.imagery_sentiment)
    ) {
      return false;
    }
  }

  // Visual style filter
  if (filters.visual_style && filters.visual_style.length > 0) {
    if (
      !campaign.imagery_visual_style ||
      !filters.visual_style.includes(campaign.imagery_visual_style)
    ) {
      return false;
    }
  }

  // Date range filter
  if (filters.date_range) {
    const campaignDate = campaign.capture_date;
    if (campaignDate) {
      if (filters.date_range.start && campaignDate < filters.date_range.start) {
        return false;
      }
      if (filters.date_range.end && campaignDate > filters.date_range.end) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Apply filters to a list of campaigns
 */
export function applyFilters(
  campaigns: any[],
  filters: ActiveFilters
): any[] {
  if (!filters || Object.keys(filters).length === 0) {
    return campaigns;
  }

  return campaigns.filter((campaign) => matchesFilters(campaign, filters));
}

/**
 * Merge two filter objects, with newFilters taking precedence for filter types they specify.
 * If newFilters doesn't specify a filter type, keep the base filter for that type.
 * This allows chat queries to add additional filters while preserving existing ones.
 */
export function mergeFilters(
  baseFilters: ActiveFilters,
  newFilters: ActiveFilters
): ActiveFilters {
  const merged: ActiveFilters = { ...baseFilters };

  // For array filters, new filters replace the same type, but preserve other types
  // This means if chat says "Facebook", it replaces channel filter, but keeps value_prop filter
  if (newFilters.channel !== undefined) {
    merged.channel = newFilters.channel.length > 0 ? newFilters.channel : undefined;
  }
  if (newFilters.value_prop !== undefined) {
    merged.value_prop = newFilters.value_prop.length > 0 ? newFilters.value_prop : undefined;
  }
  if (newFilters.sentiment !== undefined) {
    merged.sentiment = newFilters.sentiment.length > 0 ? newFilters.sentiment : undefined;
  }
  if (newFilters.visual_style !== undefined) {
    merged.visual_style = newFilters.visual_style.length > 0 ? newFilters.visual_style : undefined;
  }
  if (newFilters.date_range !== undefined) {
    merged.date_range = newFilters.date_range;
  }

  // Clean up undefined values
  Object.keys(merged).forEach((key) => {
    const value = merged[key as keyof ActiveFilters];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete merged[key as keyof ActiveFilters];
    }
  });

  return merged;
}
