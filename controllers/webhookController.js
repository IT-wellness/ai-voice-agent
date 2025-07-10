import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';
import fs from 'fs-extra';
import path from 'path';

export const handleTelnyxWebhook = async (req, res) => {
  try {
    const event = req.body?.data?.event_type;
    const payload = req.body?.data?.payload;

    console.log(`➡️ Webhook Received: ${event}`);

    switch (event) {
      case 'call.initiated':
        console.log(`📞 Call initiated: ${payload.call_control_id}`);
        break;

      case 'call.answered':
        console.log(`✅ Call answered: ${payload.call_control_id}`);

        // Send welcome message
        await axios.post(
          `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/speak`,
          {
            payload: 'Hello! Welcome to our voice assistant. Please say something after the beep.',
            voice: 'female',
            language: 'en-US',
          },
          {
            headers: {
              Authorization: `Bearer ${telnyxConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        break;

      case 'call.speak.started':
        console.log(`🗣️ Speak started for call ${payload.call_control_id}`);
        break;

      case 'call.speak.ended':
        console.log(`🔇 Speak ended for call ${payload.call_control_id}`);

        // Start Telnyx call recording
        await axios.post(
          `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/record_start`,
          {
            format: 'wav',
            channels: 'single',
            client_state: Buffer.from('recording').toString('base64'),
          },
          {
            headers: {
              Authorization: `Bearer ${telnyxConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log('🎙️ Recording started');
        break;

      case 'call.recording.saved':
        const recordingUrl = payload.recording_urls?.[0];
        const callId = payload.call_control_id;

        if (recordingUrl) {
          console.log(`📥 Recording ready: ${recordingUrl}`);
          await downloadRecording(recordingUrl, callId);
        } else {
          console.warn('⚠️ No recording URL found in payload.');
        }
        break;

      case 'call.hangup':
        console.log(`📴 Call hung up: ${payload.call_control_id}`);
        break;

      default:
        console.log(`ℹ️ Unhandled event: ${event}`);
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('❌ Webhook handler error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const downloadRecording = async (url, callId) => {
  try {
    const recordingsDir = path.resolve('recordings');
    await fs.ensureDir(recordingsDir);

    const filePath = path.join(recordingsDir, `${callId}.wav`);
    const response = await axios.get(url, { responseType: 'stream' });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`✅ Saved recording locally: ${filePath}`);
  } catch (error) {
    console.error('❌ Failed to download recording:', error.message);
  }
};