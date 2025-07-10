import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Writable } from 'stream';
import { FileWriter } from 'wav';

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
    const filePath = path.join('recordings', `${callId}.wav`);
    const fileStream = fs.createWriteStream(filePath);

    // WAV writer config: 16-bit PCM mono at 16000 Hz
    const wavWriter = new FileWriter(fileStream, {
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16,
    });

    activeRecordings.set(ws, { wavWriter, filePath });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'media') {
          const audio = Buffer.from(data.media.payload, 'base64');
          const recording = activeRecordings.get(ws);
         if (recording) {
            recording.wavWriter.write(audio);
          }
        } else if (data.event === 'start') {
          console.log('🎙️ Telnyx started streaming audio.');
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
        } else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ Failed to process WebSocket message:', err.message);
      }
    });

    ws.on('close', () => {
      const recording = activeRecordings.get(ws);
      if (recording) {
        recording.wavWriter.end();
        console.log(`✅ Recording saved as WAV at: ${recording.filePath}`);
        activeRecordings.delete(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  console.log('🟢 WebSocket Media Server ready at /media-stream');
};