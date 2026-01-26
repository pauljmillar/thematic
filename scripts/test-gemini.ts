// Load environment variables from .env.local FIRST
const dotenv = require('dotenv');
const pathNode = require('path');
const fsNode = require('fs');

const envPath = pathNode.join(process.cwd(), '.env.local');
if (fsNode.existsSync(envPath)) {
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('Error loading .env.local:', result.error);
    process.exit(1);
  }
}

import { GoogleGenerativeAI } from '@google/generative-ai';

async function testGeminiAccess() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in environment');
    process.exit(1);
  }

  console.log('🔍 Testing Gemini API Access...\n');
  console.log(`API Key (first 20 chars): ${apiKey.substring(0, 20)}...`);
  console.log(`API Key length: ${apiKey.length}\n`);

  const genAI = new GoogleGenerativeAI(apiKey);

  // Try to list models using the REST API directly
  console.log('📋 Attempting to fetch available models...\n');
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error fetching models: ${response.status} ${response.statusText}`);
      console.error(`Response: ${errorText}\n`);
      
      if (response.status === 403) {
        console.error('💡 This suggests:');
        console.error('   - API key might not have proper permissions');
        console.error('   - API key might be restricted');
        console.error('   - Generative Language API might not be fully enabled');
      } else if (response.status === 401) {
        console.error('💡 This suggests:');
        console.error('   - API key is invalid or expired');
      }
      
      process.exit(1);
    }

    const data = await response.json();
    
    if (data.models && data.models.length > 0) {
      console.log(`✅ Found ${data.models.length} available model(s):\n`);
      
      // Filter for models that support generateContent
      const generateContentModels = data.models.filter((model: any) => 
        model.supportedGenerationMethods?.includes('generateContent')
      );

      console.log('📝 Models supporting generateContent:');
      generateContentModels.forEach((model: any) => {
        console.log(`   - ${model.name}`);
        if (model.displayName) {
          console.log(`     Display Name: ${model.displayName}`);
        }
        if (model.description) {
          console.log(`     Description: ${model.description}`);
        }
      });

      if (generateContentModels.length === 0) {
        console.log('   ⚠️  No models found that support generateContent');
      }

      console.log('\n💡 Try updating your code to use one of these model names');
    } else {
      console.log('⚠️  No models returned from API');
      console.log('Full response:', JSON.stringify(data, null, 2));
    }

    // Now try to actually use a model
    console.log('\n🧪 Testing model usage...\n');
    
    const testModels = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash-exp'];
    
    for (const modelName of testModels) {
      try {
        console.log(`   Testing ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Say "Hello" in one word');
        const response = result.response;
        const text = response.text();
        console.log(`   ✅ ${modelName} works! Response: "${text}"`);
        break;
      } catch (error: any) {
        if (error.message?.includes('404') || error.message?.includes('not found')) {
          console.log(`   ❌ ${modelName} not available`);
        } else {
          console.log(`   ❌ ${modelName} error: ${error.message}`);
        }
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message?.includes('fetch')) {
      console.error('\n💡 Network error - check your internet connection');
    }
    process.exit(1);
  }
}

testGeminiAccess().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
