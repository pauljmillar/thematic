import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

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

  try {
    // Build content array: prompt first, then all images
    const content = [GEMINI_PROMPT, ...imageParts];
    
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

    return analysis;
  } catch (error) {
    console.error('Error analyzing image(s) with Gemini:', error);
    throw new Error(`Failed to analyze image(s): ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
