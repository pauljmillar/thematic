'use client';

import { type Campaign } from '@/lib/supabase/client';
import { getProxyImageUrl } from '@/lib/image-proxy';

interface CampaignDetailModalProps {
  campaign: Campaign | null;
  onClose: () => void;
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

export default function CampaignDetailModal({ campaign, onClose }: CampaignDetailModalProps) {
  if (!campaign) return null;

  const imageUrls = campaign.image_s3_urls || [];
  const proxyImageUrls = imageUrls
    .map((url) => getProxyImageUrl(url))
    .filter((url): url is string => url !== null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {campaign.company || 'Unknown Company'}
            </h2>
            {campaign.brand && (
              <p className="text-sm text-gray-600 mt-1">{campaign.brand}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Images Section */}
        {proxyImageUrls.length > 0 && (
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Campaign Images ({proxyImageUrls.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proxyImageUrls.map((url, idx) => (
                <div
                  key={idx}
                  className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden"
                >
                  <img
                    src={url}
                    alt={`Campaign image ${idx + 1}`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error('Image failed to load:', url);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaign Details */}
        <div className="px-6 py-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaign.channel && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Channel</span>
                  <div className="mt-1">
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                        CHANNEL_COLORS[campaign.channel] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {campaign.channel}
                    </span>
                  </div>
                </div>
              )}
              {campaign.primary_product && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Primary Product</span>
                  <p className="mt-1 text-gray-900">{campaign.primary_product}</p>
                </div>
              )}
              {campaign.capture_date && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Capture Date</span>
                  <p className="mt-1 text-gray-900">
                    {new Date(campaign.capture_date).toLocaleDateString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Offer */}
          {campaign.offer && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Offer</h3>
              <p className="text-gray-700">{campaign.offer}</p>
            </div>
          )}

          {/* Value Propositions */}
          {campaign.key_value_props && campaign.key_value_props.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Key Value Propositions</h3>
              <div className="flex flex-wrap gap-2">
                {campaign.key_value_props.map((prop, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm rounded-full font-medium"
                  >
                    {prop}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Incentives */}
          {campaign.incentives && campaign.incentives.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Incentives</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {campaign.incentives.map((incentive, idx) => (
                  <li key={idx}>{incentive}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Campaign Text */}
          {campaign.campaign_text && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Campaign Text</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{campaign.campaign_text}</p>
            </div>
          )}

          {/* Full Campaign Text */}
          {campaign.full_campaign_text && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Full Campaign Text</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{campaign.full_campaign_text}</p>
            </div>
          )}

          {/* Imagery Analysis */}
          {(campaign.imagery_sentiment ||
            campaign.imagery_visual_style ||
            campaign.imagery_primary_subject ||
            campaign.imagery_demographics) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Imagery Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaign.imagery_sentiment && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Sentiment</span>
                    <div className="mt-1">
                      <span
                        className={`inline-block px-3 py-1 rounded text-sm font-medium ${
                          SENTIMENT_COLORS[campaign.imagery_sentiment] ||
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {campaign.imagery_sentiment}
                      </span>
                    </div>
                  </div>
                )}
                {campaign.imagery_visual_style && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Visual Style</span>
                    <p className="mt-1 text-gray-900">{campaign.imagery_visual_style}</p>
                  </div>
                )}
                {campaign.imagery_primary_subject && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Primary Subject</span>
                    <p className="mt-1 text-gray-900">{campaign.imagery_primary_subject}</p>
                  </div>
                )}
                {campaign.imagery_demographics &&
                  campaign.imagery_demographics.length > 0 && (
                    <div>
                      <span className="text-sm font-medium text-gray-500">Demographics</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {campaign.imagery_demographics.map((demo, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                          >
                            {demo}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Additional Metrics */}
          {(campaign.volume || campaign.spend) && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaign.volume && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Volume</span>
                    <p className="mt-1 text-gray-900">{campaign.volume.toLocaleString()}</p>
                  </div>
                )}
                {campaign.spend && (
                  <div>
                    <span className="text-sm font-medium text-gray-500">Spend</span>
                    <p className="mt-1 text-gray-900">
                      ${campaign.spend.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
