import fs from 'fs';
import path from 'path';
import { analyzeImage, type GeminiAnalysis } from '../lib/gemini';
import { uploadToS3 } from '../lib/s3';
import { embedText } from '../lib/embeddings';
import { supabaseAdmin } from '../lib/supabase/client';

const IMAGE_DIR = './images';

interface ImageFile {
  name: string;
  path: string;
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

function mapAnalysisToCampaign(analysis: GeminiAnalysis, s3Url: string) {
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
    image_s3_url: s3Url,
    capture_date: new Date().toISOString().split('T')[0], // Today's date as default
  };
}

async function processImage(imageFile: ImageFile) {
  console.log(`\nProcessing ${imageFile.name}...`);

  try {
    // Step 1: Analyze image with Gemini
    console.log('  → Analyzing image with Gemini...');
    const analysis = await analyzeImage(imageFile.path);

    // Step 2: Upload to S3
    console.log('  → Uploading to S3...');
    const s3Url = await uploadToS3(imageFile.path);

    // Step 3: Insert campaign into database
    console.log('  → Inserting campaign into database...');
    const campaignData = mapAnalysisToCampaign(analysis, s3Url);

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

    console.log(`  ✓ Successfully processed ${imageFile.name}`);
    return { success: true, campaignId: campaign.id };
  } catch (error) {
    console.error(`  ✗ Error processing ${imageFile.name}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function run() {
  console.log('Starting image ingestion...\n');

  // Check if images directory exists
  if (!fs.existsSync(IMAGE_DIR)) {
    console.error(`Error: Images directory "${IMAGE_DIR}" does not exist.`);
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

  // Process each image
  const results = [];
  for (const imageFile of imageFiles) {
    const result = await processImage(imageFile);
    results.push({ file: imageFile.name, ...result });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Ingestion Summary');
  console.log('='.repeat(50));
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed files:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.file}: ${r.error}`);
      });
  }

  console.log('\nDone!');
}

// Run the script
run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
