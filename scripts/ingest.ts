// Load environment variables from .env.local
import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import fs from 'fs';
import path from 'path';
import { analyzeImage, type GeminiAnalysis } from '../lib/gemini';
import { uploadToS3 } from '../lib/s3';
import { embedText } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase/client';

// Get directory from command line argument, default to test directory for safety
const args = process.argv.slice(2);
const IMAGE_DIR = args[0] || './images/test';

interface ImageFile {
  name: string;
  path: string;
}

interface ImageGroup {
  baseName: string;
  images: ImageFile[];
}

function getImageFiles(dir: string): ImageFile[] {
  const files = fs.readdirSync(dir);
  return files
    .filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
    })
    .map((file) => ({
      name: file,
      path: path.join(dir, file),
    }));
}

/**
 * Groups images by their base name. Images like:
 * - imgXXX-0.jpeg, imgXXX-1.jpeg, imgXXX-2.jpeg → grouped as "imgXXX"
 * - imgYYY_0.png, imgYYY_1.png → grouped as "imgYYY"
 * 
 * Images without a sequence number (no dash/underscore + number) are treated as single-image campaigns.
 */
function groupImagesByBaseName(imageFiles: ImageFile[]): ImageGroup[] {
  const groups = new Map<string, ImageFile[]>();

  for (const imageFile of imageFiles) {
    const nameWithoutExt = path.basename(imageFile.name, path.extname(imageFile.name));
    
    // Try to match pattern: baseName-dash/underscore-number
    // Examples: "imgXXX-0", "imgYYY_1", "campaign-2"
    const match = nameWithoutExt.match(/^(.+)[-_](\d+)$/);
    
    if (match) {
      // Has sequence number - group by base name
      const baseName = match[1];
      if (!groups.has(baseName)) {
        groups.set(baseName, []);
      }
      groups.get(baseName)!.push(imageFile);
    } else {
      // No sequence number - treat as single-image campaign
      // Use the full name as the base name
      if (!groups.has(nameWithoutExt)) {
        groups.set(nameWithoutExt, []);
      }
      groups.get(nameWithoutExt)!.push(imageFile);
    }
  }

  // Sort images within each group by sequence number (if present)
  const result: ImageGroup[] = [];
  for (const [baseName, images] of groups.entries()) {
    // Sort by filename to ensure consistent order (imgXXX-0 before imgXXX-1)
    images.sort((a, b) => a.name.localeCompare(b.name));
    result.push({ baseName, images });
  }

  return result;
}

function mapAnalysisToCampaign(analysis: GeminiAnalysis, s3Urls: string[]) {
  return {
    company: analysis.company,
    brand: analysis.brand,
    channel: analysis.channel,
    primary_product: analysis.primary_product,
    offer: analysis.offer,
    incentives: analysis.incentives,
    key_value_props: analysis.key_value_props,
    campaign_text: analysis.campaign_text,
    full_campaign_text: analysis.full_campaign_text,
    imagery_sentiment: analysis.imagery.sentiment,
    imagery_visual_style: analysis.imagery.visual_style,
    imagery_primary_subject: analysis.imagery.primary_subject,
    imagery_demographics: analysis.imagery.demographics,
    image_s3_urls: s3Urls,
    capture_date: new Date().toISOString().split('T')[0], // Today's date as default
  };
}

async function processImageGroup(imageGroup: ImageGroup) {
  const imageNames = imageGroup.images.map(img => img.name).join(', ');
  console.log(`\nProcessing campaign group "${imageGroup.baseName}" (${imageGroup.images.length} image(s)): ${imageNames}`);

  try {
    // Step 1: Analyze all images together with Gemini
    console.log('  → Analyzing images with Gemini...');
    const imagePaths = imageGroup.images.map(img => img.path);
    const analysis = await analyzeImage(imagePaths);

    // Step 2: Upload all images to S3
    console.log('  → Uploading images to S3...');
    const s3Urls = await Promise.all(
      imageGroup.images.map(img => uploadToS3(img.path))
    );

    // Step 3: Insert campaign into database
    console.log('  → Inserting campaign into database...');
    const campaignData = mapAnalysisToCampaign(analysis, s3Urls);

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .insert(campaignData)
      .select()
      .single();

    if (campaignError) {
      throw new Error(`Failed to insert campaign: ${campaignError.message}`);
    }

    if (!campaign) {
      throw new Error('Campaign insert returned no data');
    }

    // Step 4: Generate embeddings
    console.log('  → Generating embeddings...');
    const valuePropText = `${analysis.key_value_props.join(', ')} ${analysis.offer}`;
    const copyText = `${analysis.campaign_text} ${analysis.full_campaign_text}`;
    const visualText = `${analysis.imagery.visual_style}. ${analysis.imagery.primary_subject}. ${analysis.imagery.sentiment}`;

    const [valuePropEmbedding, copyEmbedding, visualEmbedding] = await Promise.all([
      embedText(valuePropText),
      embedText(copyText),
      embedText(visualText),
    ]);

    // Step 5: Insert vectors
    console.log('  → Inserting vectors...');
    const { error: vectorError } = await supabaseAdmin.from('campaign_vectors').insert({
      campaign_id: campaign.id,
      value_prop_embedding: valuePropEmbedding,
      copy_embedding: copyEmbedding,
      visual_embedding: visualEmbedding,
    });

    if (vectorError) {
      throw new Error(`Failed to insert vectors: ${vectorError.message}`);
    }

    console.log(`  ✓ Successfully processed campaign "${imageGroup.baseName}" with ${imageGroup.images.length} image(s)`);
    return { success: true, campaignId: campaign.id, imageCount: imageGroup.images.length };
  } catch (error) {
    console.error(`  ✗ Error processing campaign "${imageGroup.baseName}":`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function run() {
  console.log('Starting image ingestion...\n');
  console.log(`📁 Processing directory: ${IMAGE_DIR}\n`);

  // Check if images directory exists
  if (!fs.existsSync(IMAGE_DIR)) {
    console.error(`Error: Images directory "${IMAGE_DIR}" does not exist.`);
    console.error(`\nUsage: npm run ingest [directory]`);
    console.error(`Example: npm run ingest images/test`);
    console.error(`Example: npm run ingest images`);
    process.exit(1);
  }

  // Get all image files
  const imageFiles = getImageFiles(IMAGE_DIR);

  if (imageFiles.length === 0) {
    console.log(`No image files found in "${IMAGE_DIR}".`);
    console.log('Supported formats: .jpg, .jpeg, .png, .gif, .webp');
    process.exit(0);
  }

  console.log(`Found ${imageFiles.length} image file(s) to process.\n`);

  // Group images by base name
  const imageGroups = groupImagesByBaseName(imageFiles);
  console.log(`Grouped into ${imageGroups.length} campaign(s).\n`);

  // Process each image group
  const results = [];
  for (const imageGroup of imageGroups) {
    const result = await processImageGroup(imageGroup);
    results.push({ 
      baseName: imageGroup.baseName, 
      imageCount: imageGroup.images.length,
      images: imageGroup.images.map(img => img.name),
      ...result 
    });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Ingestion Summary');
  console.log('='.repeat(50));
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalImages = results.reduce((sum, r) => sum + (r.imageCount || 0), 0);
  console.log(`Total campaigns: ${results.length}`);
  console.log(`Total images: ${totalImages}`);
  console.log(`Successful campaigns: ${successful}`);
  console.log(`Failed campaigns: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed campaigns:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.baseName} (${r.imageCount} image(s)): ${r.error}`);
      });
  }

  console.log('\nDone!');
}

// Run the script
run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
