import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

// Lazy-load the Gemini client to ensure env vars are loaded first
let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set. Please check your .env.local file.');
    }
    if (apiKey.trim().length === 0) {
      throw new Error('GEMINI_API_KEY is empty. Please check your .env.local file.');
    }
    // Log first few characters to verify key is loaded (for debugging)
    console.log(`  → Using Gemini API key: ${apiKey.substring(0, 10)}... (length: ${apiKey.length})`);
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Lists available Gemini models for debugging
 */
export async function listAvailableModels(): Promise<void> {
  try {
    const client = getGeminiClient();
    // Note: The SDK doesn't have a direct listModels method, but we can try to infer from errors
    console.log('Attempting to list available models...');
    console.log('Note: You may need to check Google Cloud Console for available models.');
  } catch (error) {
    console.error('Error getting Gemini client:', error);
  }
}

export const GEMINI_PROMPT = `
You are analyzing marketing campaign images for a credit card. These images form a single campaign and should be analyzed together as a cohesive unit.

Return ONLY valid JSON matching the schema below.

Schema:
{
  "company": string,
  "brand": string,
  "channel": "facebook" | "instagram" | "twitter" | "email" | "direct_mail",
  "primary_product": string,
  "offer": string,
  "incentives": string[],
  "key_value_props": (
    "No Fee / No Minimum" |
    "Cash Back / Rewards" |
    "Travel Benefits" |
    "High-Yield Savings" |
    "Credit Building" |
    "Security / Fraud Protection"
  )[],
  "campaign_text": string,
  "full_campaign_text": string,
  "imagery": {
    "sentiment": "Aspirational" | "Trust-Building" | "Urgent" | "Playful" | "Premium",
    "visual_style": "Lifestyle Photography" | "Minimalist Graphic" | "Illustration" | "Product-Centric" | "Text-Heavy" | "Abstract / Conceptual",
    "primary_subject": string,
    "demographics": string[]
  }
}

Rules:
- Use the closest enum value
- Do not invent offers
- Be concise but accurate
- Return ONLY the JSON object, no markdown formatting or code blocks
`;

export interface GeminiAnalysis {
  company: string;
  brand: string;
  channel: 'facebook' | 'instagram' | 'twitter' | 'email' | 'direct_mail';
  primary_product: string;
  offer: string;
  incentives: string[];
  key_value_props: (
    | 'No Fee / No Minimum'
    | 'Cash Back / Rewards'
    | 'Travel Benefits'
    | 'High-Yield Savings'
    | 'Credit Building'
    | 'Security / Fraud Protection'
  )[];
  campaign_text: string;
  full_campaign_text: string;
  imagery: {
    sentiment: 'Aspirational' | 'Trust-Building' | 'Urgent' | 'Playful' | 'Premium';
    visual_style:
      | 'Lifestyle Photography'
      | 'Minimalist Graphic'
      | 'Illustration'
      | 'Product-Centric'
      | 'Text-Heavy'
      | 'Abstract / Conceptual';
    primary_subject: string;
    demographics: string[];
  };
}

/**
 * Analyzes a single image or multiple images that form a single campaign.
 * When multiple images are provided, they are analyzed together as a cohesive unit.
 */
export async function analyzeImage(imagePath: string | string[]): Promise<GeminiAnalysis> {
  const client = getGeminiClient();
  
  // Try models in order: newer stable models first, then experimental
  // Based on available models from API (as of 2025)
  const modelNames = [
    'gemini-2.5-flash',        // Stable, fast, multimodal
    'gemini-2.0-flash',        // Stable alternative
    'gemini-2.0-flash-exp',    // Experimental (works per test)
    'gemini-2.5-pro',          // More capable, stable
    'gemini-flash-latest',     // Always latest flash
    'gemini-pro-latest',       // Always latest pro
  ];

  const imagePaths = Array.isArray(imagePath) ? imagePath : [imagePath];

  // Prepare image data for all images
  const imageParts = imagePaths.map((path) => {
    const imageData = fs.readFileSync(path);
    const base64Image = imageData.toString('base64');
    const ext = path.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    
    return {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    };
  });

  // Build content array: prompt first, then all images
  const content = [GEMINI_PROMPT, ...imageParts];
  
  // Try each model until one works
  let lastError: Error | null = null;
  for (const modelName of modelNames) {
    try {
      console.log(`  → Trying model: ${modelName}...`);
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(content);
      const response = result.response;
      const text = response.text();

      // Parse JSON response (handle markdown code blocks if present)
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '');
      }

      const analysis = JSON.parse(jsonText) as GeminiAnalysis;

      // Validate required fields
      if (!analysis.company || !analysis.brand || !analysis.channel) {
        throw new Error('Missing required fields in Gemini response');
      }

      console.log(`  ✓ Successfully used model: ${modelName}`);
      return analysis;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      // If it's a model not found error, try the next model
      if (error instanceof Error && 
          (error.message.includes('not found') || 
           error.message.includes('404') ||
           error.message.includes('is not supported'))) {
        console.log(`  → Model ${modelName} not available, trying next...`);
        continue;
      }
      // For other errors (API key, parsing, etc.), throw immediately
      throw error;
    }
  }
  
  // If we get here, all models failed
  const errorMessage = `None of the Gemini models are available. Tried: ${modelNames.join(', ')}. ` +
    `Last error: ${lastError?.message || 'Unknown error'}. ` +
    `\n\nPossible solutions:\n` +
    `  1. Enable Gemini API in Google Cloud Console:\n` +
    `     - Go to https://console.cloud.google.com/apis/library\n` +
    `     - Search for "Generative Language API" or "Gemini API"\n` +
    `     - Click "Enable" for your project\n` +
    `  2. Check API key permissions:\n` +
    `     - Ensure your API key has access to Gemini API\n` +
    `     - Verify the API key is not restricted to specific APIs\n` +
    `  3. Verify model availability:\n` +
    `     - Some models may require specific access levels\n` +
    `     - Check if your project has access to the models you're trying to use\n` +
    `  4. Try creating a new API key:\n` +
    `     - Go to https://console.cloud.google.com/apis/credentials\n` +
    `     - Create a new API key with Generative Language API enabled\n` +
    `  5. Check API quotas and billing:\n` +
    `     - Ensure billing is enabled if required\n` +
    `     - Check if you've exceeded any quotas`;
  
  throw new Error(errorMessage);
}
