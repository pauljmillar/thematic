import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export const GEMINI_PROMPT = `
You are analyzing a marketing campaign image for a credit card.

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

export async function analyzeImage(imagePath: string): Promise<GeminiAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

  // Read image file
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString('base64');

  // Get file extension
  const ext = imagePath.split('.').pop()?.toLowerCase() || 'png';
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  try {
    const result = await model.generateContent([
      GEMINI_PROMPT,
      {
        inlineData: {
          data: base64Image,
          mimeType,
        },
      },
    ]);

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
    console.error('Error analyzing image with Gemini:', error);
    throw new Error(`Failed to analyze image: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
