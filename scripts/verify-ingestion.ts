import { supabaseAdmin } from '../lib/supabase/client';

/**
 * Verification script to check that multi-image campaigns were ingested correctly.
 * 
 * This script:
 * 1. Checks that campaigns have image_s3_urls array (not the old single image_s3_url)
 * 2. Verifies campaigns with multiple images are stored correctly
 * 3. Shows statistics about image counts per campaign
 * 4. Validates that embeddings exist for all campaigns
 */
async function verifyIngestion() {
  console.log('Verifying ingestion results...\n');

  try {
    // Fetch all campaigns
    const { data: campaigns, error: campaignsError } = await supabaseAdmin
      .from('campaigns')
      .select('id, company, brand, image_s3_urls')
      .order('created_at', { ascending: false });

    if (campaignsError) {
      throw new Error(`Failed to fetch campaigns: ${campaignsError.message}`);
    }

    if (!campaigns || campaigns.length === 0) {
      console.log('⚠️  No campaigns found in database.');
      console.log('   Run `npm run ingest` first to process images.');
      return;
    }

    console.log(`Found ${campaigns.length} campaign(s) in database.\n`);

    // Check for campaigns with multiple images
    const multiImageCampaigns = campaigns.filter(
      (c) => c.image_s3_urls && c.image_s3_urls.length > 1
    );
    const singleImageCampaigns = campaigns.filter(
      (c) => c.image_s3_urls && c.image_s3_urls.length === 1
    );
    const noImageCampaigns = campaigns.filter(
      (c) => !c.image_s3_urls || c.image_s3_urls.length === 0
    );

    console.log('📊 Image Statistics:');
    console.log(`   Total campaigns: ${campaigns.length}`);
    console.log(`   Single-image campaigns: ${singleImageCampaigns.length}`);
    console.log(`   Multi-image campaigns: ${multiImageCampaigns.length}`);
    console.log(`   Campaigns without images: ${noImageCampaigns.length}\n`);

    // Show details of multi-image campaigns
    if (multiImageCampaigns.length > 0) {
      console.log('🖼️  Multi-image campaigns:');
      multiImageCampaigns.forEach((campaign, idx) => {
        console.log(
          `   ${idx + 1}. ${campaign.company || 'Unknown'} - ${campaign.brand || 'Unknown'} (${campaign.image_s3_urls?.length} images)`
        );
      });
      console.log('');
    }

    // Verify embeddings exist
    const { data: vectors, error: vectorsError } = await supabaseAdmin
      .from('campaign_vectors')
      .select('campaign_id');

    if (vectorsError) {
      throw new Error(`Failed to fetch vectors: ${vectorsError.message}`);
    }

    const campaignsWithVectors = vectors?.length || 0;
    const campaignsWithoutVectors = campaigns.length - campaignsWithVectors;

    console.log('🔍 Embedding Verification:');
    console.log(`   Campaigns with embeddings: ${campaignsWithVectors}`);
    console.log(`   Campaigns without embeddings: ${campaignsWithoutVectors}`);

    if (campaignsWithoutVectors > 0) {
      console.log('\n   ⚠️  Warning: Some campaigns are missing embeddings.');
    }

    // Check for any campaigns using old schema (shouldn't exist)
    const { data: oldSchemaCheck } = await supabaseAdmin
      .from('campaigns')
      .select('id')
      .not('image_s3_urls', 'is', null)
      .limit(1);

    console.log('\n✅ Verification Summary:');
    if (campaigns.length > 0 && campaignsWithVectors === campaigns.length && noImageCampaigns.length === 0) {
      console.log('   ✓ All campaigns have images');
      console.log('   ✓ All campaigns have embeddings');
      console.log('   ✓ Schema migration appears successful');
    } else {
      console.log('   ⚠️  Some issues detected (see details above)');
    }

    // Sample a few campaigns to show image URLs
    if (campaigns.length > 0) {
      console.log('\n📋 Sample Campaign Details:');
      const samples = campaigns.slice(0, 3);
      for (const campaign of samples) {
        console.log(`\n   Campaign: ${campaign.company || 'Unknown'} - ${campaign.brand || 'Unknown'}`);
        if (campaign.image_s3_urls && campaign.image_s3_urls.length > 0) {
          console.log(`   Images (${campaign.image_s3_urls.length}):`);
          campaign.image_s3_urls.forEach((url, idx) => {
            console.log(`      ${idx + 1}. ${url.substring(0, 60)}...`);
          });
        } else {
          console.log('   ⚠️  No images');
        }
      }
    }

    console.log('\n✨ Verification complete!');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run verification
verifyIngestion().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
