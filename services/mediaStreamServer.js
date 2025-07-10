import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import wav from 'wav';

import { callSessionMap } from '../utils/sessionMap.js';
import { whisperService } from './whisperService.js';
import { assistantService } from './assistantService.js';
import { ttsService } from './ttsService.js';
import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';

const activeRecordings = new Map();

export const startMediaWebSocketServer = (server) => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/media-stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    console.log('🔌 WebSocket connected for media stream');

    const callId = uuidv4();
    const recordingsDir = path.resolve('recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

    const filePath = path.join(recordingsDir, `${callId}.wav`);
    const fileStream = fs.createWriteStream(filePath);

    // WAV Writer config for Telnyx PCM: 8kHz, mono, 16-bit
    const wavWriter = new wav.Writer({
      sampleRate: 8000,
      channels: 1,
      bitDepth: 16,
    });

    wavWriter.pipe(fileStream);
    activeRecordings.set(ws, { wavWriter, filePath, callControlId: null });

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

         if (data.event === 'start') {
          const clientState = Buffer.from(data.start.client_state, 'base64').toString();
          const session = callSessionMap.get(clientState);
          if (session?.callControlId) {
            const recording = activeRecordings.get(ws);
            if (recording) recording.callControlId = session.callControlId;
            console.log(`🔗 Linked callControlId ${session.callControlId} to stream`);
          }
          console.log('🎙️ Telnyx started streaming audio.');
        } else if (data.event === 'media') {
          const audio = Buffer.from(data.media.payload, 'base64');
          const recording = activeRecordings.get(ws);
          if (recording) {
            recording.wavWriter.write(audio);
          }
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
        } else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ Failed to process WebSocket message:', err.message);
      }
    });

    ws.on('close', async () => {
  const recording = activeRecordings.get(ws);
  if (recording) {
    recording.wavWriter.end();
    activeRecordings.delete(ws);

    const { filePath, callControlId } = recording;
        console.log(`✅ Stream saved: ${filePath}`);

    // try {
      // 1. Transcribe
      const transcript = await whisperService.transcribeAudio(filePath);
      console.log(`📝 Transcript: ${transcript}`);

      // 2. Assistant Response
    //   const assistantReply = await assistantService.askAssistant(transcript);
    //   console.log(`🤖 Assistant: ${assistantReply.replyText}`);

      // 3. TTS
    //   const audioBuffer = await ttsService.synthesizeSpeech(assistantReply.replyText);

      // 4. Save MP3 to public folder
    //   const outputName = `response-${Date.now()}.mp3`;
    //   const outputPath = path.join('public/audio', outputName);
    //   await fs.ensureDir(path.dirname(outputPath));
    //   await fs.promises.writeFile(outputPath, audioBuffer);

      // 5. Playback to Telnyx
    //   const audioUrl = `https://${telnyxConfig.domain}/audio/${outputName}`;
    //   const callControlId = recording.callControlId; // Save this earlier from webhook

    //   if (callControlId) {
    //     await axios.post(
    //       `https://api.telnyx.com/v2/calls/${callControlId}/actions/playback_start`,
    //       { audio_url: audioUrl },
    //       {
    //         headers: {
    //           Authorization: `Bearer ${telnyxConfig.apiKey}`,
    //           'Content-Type': 'application/json',
    //         },
    //       }
    //     );

    //     console.log(`📢 Playing assistant reply to call: ${callControlId}`);
    //   } else {
    //     console.warn('⚠️ No callControlId found for playback.');
    //   }
    // } catch (err) {
    //   console.error('❌ Error during STT → Assistant → TTS pipeline:', err.message);
    // }
  }
});

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};