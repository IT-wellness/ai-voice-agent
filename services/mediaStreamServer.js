import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { transcribeAudio } from './whisperService.js';

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

    const recordingsDir = path.resolve('recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

    let audioBuffer = [];
    let silenceTimer = null;
    let recentAmplitudes = [];

    const handleSilence = async () => {
      if (audioBuffer.length === 0) return;

      console.log('🕳️ handleSilence() triggered - chunking & transcribing...');

      const rawChunkPath = path.join(recordingsDir, `chunk-${Date.now()}.raw`);
      fs.writeFileSync(rawChunkPath, Buffer.concat(audioBuffer));

      const wavPath = rawChunkPath.replace('.raw', '.wav');

      const ffmpegCommand = `ffmpeg -f mulaw -ar 8000 -ac 1 -i ${rawChunkPath} ${wavPath}`;
      exec(ffmpegCommand, async (error) => {
        if (error) {
          console.error('❌ FFmpeg conversion error:', error.message);
          return;
        }

        try {
          const transcript = await transcribeAudio(wavPath);
          console.log(`📝 [Chunk Transcript]: ${transcript}`);
        } catch (err) {
          console.error('❌ Failed to transcribe chunk:', err.message);
        }

        // Clean up
        fs.unlinkSync(rawChunkPath);
        // fs.unlinkSync(wavPath);
      });

      audioBuffer = [];
      recentAmplitudes = [];
    };

    const avgAmplitude = (buf) => {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        sum += Math.abs(buf[i] - 128);
      }
      return sum / buf.length;
    };

  ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
          console.log('🎙️ Telnyx started streaming audio.');
        } else if (data.event === 'media') {
          const base64Payload = data.media.payload;
          const audio = Buffer.from(base64Payload, 'base64');
            const amp = avgAmplitude(audio);
          recentAmplitudes.push(amp);
          if (recentAmplitudes.length > 20) recentAmplitudes.shift();

          const maxAmp = Math.max(...recentAmplitudes);
          console.log(`🔊 Avg: ${amp.toFixed(2)}, RecentMax: ${maxAmp.toFixed(2)}`);

          audioBuffer.push(audio);

          if (recentAmplitudes.every((a) => a < 35)) {
            if (!silenceTimer) {
              silenceTimer = setTimeout(handleSilence, 1000);
            }
          } else {
            if (silenceTimer) {
              clearTimeout(silenceTimer);
              silenceTimer = null;
            }
          }
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
          await handleSilence();
        } else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ Failed to process WebSocket message:', err.message);
      }
    });

 ws.on('close', async () => {
      await handleSilence();
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
});

console.log('🟢 Media WebSocket server ready at /media-stream');
}