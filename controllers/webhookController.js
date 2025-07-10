import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';

export const handleTelnyxWebhook = async (req, res) => {
  try {
    const event = req.body?.data?.event_type;
    const payload = req.body?.data?.payload;
    const callId = payload.call_control_id;
    let clientState = null;

    console.log(`➡️ Webhook Received: ${event}`);

    switch (event) {
      case 'call.initiated':
        console.log(`📞 Call initiated: ${callId}`);
        break;

      case 'call.answered':
        console.log(`✅ Call answered: ${callId}`);
        clientState = payload.client_state;
        await axios.post(
            `https://api.telnyx.com/v2/calls/${callId}/actions/speak`,
            {
            payload: 'Hello! Welcome to our voice assistant. Please say something after the beep.',
            voice: 'male',
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

        case 'streaming.started':
            console.log("Streaming started.");
        break;

        case 'streaming.stopped':
            console.log("Streaming stopped.");
        break;

      case 'call.speak.ended':
        console.log(`🔇 Speak ended for call ${callId}`);
        await axios.post(
            `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/streaming_start`,
            {
            stream_url: `${telnyxConfig.streamUrl}/media-stream`,
            stream_track: 'inbound_track',
            client_state: clientState
            },
            {
            headers: {
                Authorization: `Bearer ${telnyxConfig.apiKey}`,
                'Content-Type': 'application/json',
            },
            }
        );
        
        break;

      case 'call.hangup':
        console.log(`📴 Call hung up: ${callId}`);
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