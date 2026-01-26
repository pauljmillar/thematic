'use client';

import Image from 'next/image';
import { type Campaign } from '@/lib/supabase/client';

interface CampaignCardProps {
  campaign: Campaign;
}

const CHANNEL_COLORS: Record<string, string> = {
  facebook: 'bg-blue-100 text-blue-800',
  instagram: 'bg-pink-100 text-pink-800',
  twitter: 'bg-sky-100 text-sky-800',
  email: 'bg-gray-100 text-gray-800',
  direct_mail: 'bg-purple-100 text-purple-800',
};

const SENTIMENT_COLORS: Record<string, string> = {
  Aspirational: 'bg-green-100 text-green-800',
  'Trust-Building': 'bg-blue-100 text-blue-800',
  Urgent: 'bg-red-100 text-red-800',
  Playful: 'bg-yellow-100 text-yellow-800',
  Premium: 'bg-purple-100 text-purple-800',
};

export default function CampaignCard({ campaign }: CampaignCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {campaign.image_s3_url && (
        <div className="relative w-full h-48 bg-gray-100">
          <Image
            src={campaign.image_s3_url}
            alt={campaign.offer || 'Campaign image'}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold text-lg text-gray-900">
              {campaign.company || 'Unknown Company'}
            </h3>
            {campaign.brand && (
              <p className="text-sm text-gray-600">{campaign.brand}</p>
            )}
          </div>
          {campaign.channel && (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${
                CHANNEL_COLORS[campaign.channel] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {campaign.channel}
            </span>
          )}
        </div>

        {campaign.offer && (
          <p className="text-sm font-medium text-gray-800 mb-3">{campaign.offer}</p>
        )}

        {campaign.key_value_props && campaign.key_value_props.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {campaign.key_value_props.slice(0, 3).map((prop, idx) => (
              <span
                key={idx}
                className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded"
              >
                {prop}
              </span>
            ))}
            {campaign.key_value_props.length > 3 && (
              <span className="px-2 py-1 bg-gray-50 text-gray-600 text-xs rounded">
                +{campaign.key_value_props.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          {campaign.imagery_sentiment && (
            <span
              className={`px-2 py-1 rounded ${
                SENTIMENT_COLORS[campaign.imagery_sentiment] || 'bg-gray-100 text-gray-800'
              }`}
            >
              {campaign.imagery_sentiment}
            </span>
          )}
          {campaign.imagery_visual_style && (
            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded">
              {campaign.imagery_visual_style}
            </span>
          )}
        </div>

        {campaign.campaign_text && (
          <p className="mt-3 text-sm text-gray-600 line-clamp-2">
            {campaign.campaign_text}
          </p>
        )}
      </div>
    </div>
  );
}
