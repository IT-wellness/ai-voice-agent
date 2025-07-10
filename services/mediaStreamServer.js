import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

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

    const callId = uuidv4(); // unique ID per call
    const filePath = path.join('recordings', `${callId}.ogg`);
    const writeStream = fs.createWriteStream(filePath);
    activeRecordings.set(ws, { writeStream, filePath });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'media') {
          const audio = Buffer.from(data.media.payload, 'base64');
          const recording = activeRecordings.get(ws);
          if (recording) recording.writeStream.write(audio);
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
        recording.writeStream.end();
        console.log(`✅ Recording saved at: ${recording.filePath}`);
        activeRecordings.delete(ws);
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err.message);
    });
  });

  console.log('🟢 WebSocket Media Server ready at /media-stream');
};