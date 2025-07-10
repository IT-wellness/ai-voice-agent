import dotenv from 'dotenv';
dotenv.config();

export const telnyxConfig = {
  apiKey: process.env.TELNYX_API_KEY,
  connectionId: process.env.TELNYX_CONNECTION_ID,
  callerId: process.env.TELNYX_CALLER_ID,
  publicUrl: process.env.PUBLIC_URL,
  streamUrl: process.env.STREAM_URL,
};