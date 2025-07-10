import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';
import fs from 'fs-extra';

export const handleTelnyxWebhook = async (req, res) => {
  try {
    const event = req.body?.data?.event_type;
    const payload = req.body?.data?.payload;

    console.log(`➡️ Webhook Received: ${event}`);

    switch (event) {
      case 'call.initiated':
        console.log(`Call initiated: Call Control ID ${payload.call_control_id}`);
        break;

      case 'call.answered':
        console.log(`Call answered: ${payload.call_control_id}`);

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
        console.log(`Speak ended for call ${payload.call_control_id}`);

        // Start media streaming
        await axios.post(
          `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/streaming_start`,
          {
            stream_url: `${telnyxConfig.streamUrl}/media-stream`, // Will be handled by websocket server
            stream_track: 'both_tracks',
            client_state: Buffer.from('start-streaming').toString('base64'),
          },
          {
            headers: {
              Authorization: `Bearer ${telnyxConfig.apiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        break;

      case 'call.stream.started':
        console.log(`Media stream started for ${payload.call_control_id}`);
        break;

      case 'call.hangup':
        console.log(`Call hung up: ${payload.call_control_id}`);
        break;

      default:
        console.log(`Unhandled event type: ${event}`);
        break;
    }

    // Respond with 200 to acknowledge webhook
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};