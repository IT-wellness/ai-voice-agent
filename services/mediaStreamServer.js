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
    const silenceTimeout = 1500; // 1.5s pause triggers transcription

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(handleSilence, silenceTimeout);
    };

    const handleSilence = async () => {
      if (audioBuffer.length === 0) return;

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

      audioBuffer = []; // Reset
    };

  ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
          console.log('🎙️ Telnyx started streaming audio.');
        } else if (data.event === 'media') {
          const base64Payload = data.media.payload;
          const audio = Buffer.from(base64Payload, 'base64');

          if (audio.length > 10) {
            audioBuffer.push(audio);
            resetSilenceTimer();
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
}