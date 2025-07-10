import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import wav from 'wav';

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
        console.log(`✅ Saved stream recording at: ${recording.filePath}`);
        activeRecordings.delete(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};