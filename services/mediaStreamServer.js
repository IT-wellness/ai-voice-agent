import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import wav from 'wav';

import { callSessionMap } from '../utils/sessionMap.js';
import { transcribeAudio } from './whisperService.js';
// import { assistantService } from './assistantService.js';
// import { ttsService } from './ttsService.js';
// import axios from 'axios';
// import { telnyxConfig } from '../config/telnyx.js';

// const activeRecordings = new Map();

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

//   const callId = uuidv4();
//   const recordingsDir = path.resolve('recordings');
//   if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

//   const filePath = path.join(recordingsDir, `${callId}.wav`);
//   const fileStream = fs.createWriteStream(filePath);

//   const wavWriter = new wav.Writer({
//     sampleRate: 8000,
//     channels: 1,
//     bitDepth: 16,
//   });

//   wavWriter.pipe(fileStream);
//   activeRecordings.set(ws, { wavWriter, filePath, callControlId: null });

  // 🔄 New buffer and timer setup for pause-based chunking
  let audioBuffer = [];
  let silenceTimer = null;
  const silenceTimeout = 1500; // 1.5s pause triggers transcription

  // Helper to reset the silence timer
  const resetSilenceTimer = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(handleSilence, silenceTimeout);
  };

  // Transcribe buffer and reset
  const handleSilence = async () => {
    if (audioBuffer.length === 0) return;

    const chunkFile = path.join(recordingsDir, `chunk-${Date.now()}.wav`);
    const chunkStream = fs.createWriteStream(chunkFile);
    const chunkWriter = new wav.Writer({
      sampleRate: 8000,
      channels: 1,
      bitDepth: 16,
    });

    chunkWriter.pipe(chunkStream);
    audioBuffer.forEach(buf => chunkWriter.write(buf));
    chunkWriter.end();

    await new Promise((res) => chunkStream.on('finish', res));

    try {
      const transcript = await transcribeAudio(chunkFile);
      console.log(`📝 [Chunk Transcript]: ${transcript}`);
      // TODO: Use Assistant + TTS if needed
    } catch (err) {
      console.error('❌ Failed to transcribe chunk:', err.message);
    }

    audioBuffer = []; // Reset for next chunk
  };

  ws.on('message', async (message) => {
    try {
        // console.log("MESSAGE: ", message);
      const data = JSON.parse(message);

      if (data.event === 'start') {
        // const clientState = Buffer.from(data.start.client_state, 'base64').toString();
        // const session = callSessionMap.get(clientState);
        // if (session?.callControlId) {
        //   const recording = activeRecordings.get(ws);
        //   if (recording) recording.callControlId = session.callControlId;
        //   console.log(`🔗 Linked callControlId ${session.callControlId} to stream`);
        // }
        console.log('🎙️ Telnyx started streaming audio.');
      } else if (data.event === 'media') {
        // const audio = data.media.payload;
        // console.log("AUDIO: ", data);
       const audio = Buffer.from(data.media.payload, 'base64');

        // Append to .wav writer (permanent full stream)
        // const recording = activeRecordings.get(ws);
        // if (recording) {
        //   recording.wavWriter.write(audio);
        // }

        // Add to temporary buffer for live transcription
        audioBuffer.push(audio);
        resetSilenceTimer();
      } else if (data.event === 'stop') {
        console.log('⛔ Telnyx stopped streaming.');
        await handleSilence(); // Final chunk
      } else {
        console.log('🔹 Other event:', data.event);
      }
    } catch (err) {
      console.error('⚠️ Failed to process WebSocket message:', err.message);
    }
  });

  ws.on('close', async () => {
    // const recording = activeRecordings.get(ws);
    // if (recording) {
    //   recording.wavWriter.end();
    //   activeRecordings.delete(ws);

    //   console.log(`✅ Full stream saved: ${recording.filePath}`);
    // }

    // Final transcription flush
    await handleSilence();
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket error:', err.message);
  });

});

}