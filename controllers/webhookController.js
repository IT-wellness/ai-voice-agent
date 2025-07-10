import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';
import fs from 'fs-extra';
import path from 'path';
// import { callSessionMap } from '../utils/sessionMap.js';

// import { transcribeAudio } from '../services/whisperService.js';

export const handleTelnyxWebhook = async (req, res) => {
  try {
    console.log("Request Body: ", req.body);
    const event = req.body?.data?.event_type;
    const payload = req.body?.data?.payload;
    const callId = payload.call_control_id;
    let clientState = null;

    console.log(`➡️ Webhook Received: ${event}`);

    // const processedRecordings = new Set();

    switch (event) {
      case 'call.initiated':
        console.log(`📞 Call initiated: ${callId}`);
        break;

      case 'call.answered':
        console.log(`✅ Call answered: ${callId}`);
        clientState = payload.client_state;
        // callSessionMap.set(callId, { callControlId: callId });
        await axios.post(
            `https://api.telnyx.com/v2/calls/${callId}/actions/speak`,
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

        case 'streaming.started':
            console.log("Streaming started bhai..");
            console.log("Data: ", payload.stream_params);
        break;

        case 'streaming.stopped':
            console.log("Streaming stopped bhai..");
            console.log("Data: ", payload.stream_params);
        break;

      case 'call.speak.ended':
        // callId = payload.call_control_id;
        console.log(`🔇 Speak ended for call ${callId}`);
//          await axios.post(
//     `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/record_start`,
//     {
//       channels: 'single', // or 'dual' if you want both parties separately
//       format: 'wav',
//     },
//     {
//       headers: {
//         Authorization: `Bearer ${telnyxConfig.apiKey}`,
//         'Content-Type': 'application/json',
//       },
//     }
//   );
//   console.log('🎙️ Recording started');
// const clientState = Buffer.from(callId).toString('base64');
   await axios.post(
    `https://api.telnyx.com/v2/calls/${payload.call_control_id}/actions/streaming_start`,
    {
      stream_url: `${telnyxConfig.streamUrl}/media-stream`,
      stream_track: 'inbound_track', // caller audio only
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

     case 'call.recording.saved':
//   const recordingId = payload.recording_id; // <-- Unique ID for recording
//   const recordingUrl = payload.recording_urls?.wav;
//   callId = payload.call_control_id;

//   if (processedRecordings.has(recordingId)) {
//     console.log(`⏭️ Skipping duplicate recording: ${recordingId}`);
//     break;
//   }

//   processedRecordings.add(recordingId);

//   if (recordingUrl) {
//     await downloadRecording(recordingUrl, callId);
//   } else {
//     console.warn('⚠️ No recording URL found in payload.');
//   }
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

// const downloadRecording = async (url) => {
//   try {
//     const recordingsDir = path.resolve('recordings');
//     await fs.ensureDir(recordingsDir);

//     const filePath = path.join(recordingsDir, `${Date.now()}.wav`);
//     const response = await axios.get(url, { responseType: 'stream' });

//     const writer = fs.createWriteStream(filePath);
//     response.data.pipe(writer);

//     await new Promise((resolve, reject) => {
//       writer.on('finish', resolve);
//       writer.on('error', reject);
//     });

//     console.log(`✅ Saved recording locally: ${filePath}`);

//     const transcript = await transcribeAudio(filePath);
//       console.log(`📝 Transcript: ${transcript}`);

//   } catch (error) {
//     console.error('❌ Failed to download recording:', error.message);
//   }
// };