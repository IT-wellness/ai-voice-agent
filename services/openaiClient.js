// Import OpenAI Node.js SDK
import OpenAI from 'openai';

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

/**
 * Validate required environment variable before initializing the OpenAI client.
 * Throws an error during startup if the key is missing.
 */
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error('❌ OPENAI_API_KEY is not set in your .env file.');
  throw new Error('Environment variable OPENAI_API_KEY is required to initialize OpenAI.');
}

// Create the OpenAI client
const openai = new OpenAI({ apiKey });

console.log('✅ OpenAI client initialized successfully.');

// Optional: Attach version info for logging/debug purposes
openai._meta = {
  initializedAt: new Date().toISOString(),
  sdk: 'openai-node',
  version: OpenAI.version || 'unknown',
};

// Export the configured client for reuse in services
export default openai;