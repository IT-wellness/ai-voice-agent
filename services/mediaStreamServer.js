import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { transcribeAudio } from './whisperService.js';
import askAssistant from './assistantService.js';
import { synthesizeSpeech } from './ttsService.js';
import axios from 'axios';

const AUDIO_DIR = '/var/www/frontend/dist/audio';
const AUDIO_BASE_URL = 'https://wellvoice.wellnessextract.com/audio';
const RMS_THRESHOLD = 10;
const MIN_CHUNK_MS = 300;
const MAX_SILENCE_MS = 1500;

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
    let vadTimer = null;
    let recordingStart = null;
    let threadId = null;
    let callId = null;
    let lastTranscript = '';

    const isValidTranscript = (text) => {
      if (!text || text.trim().length < 3) return false;
      if (/^\.+$/.test(text.trim())) return false;
      if (text.trim() === lastTranscript) return false;
      return true;
    };

    const flushAndTranscribe = async () => {
      if (audioBuffer.length === 0) return;

      const rawChunkPath = path.join(recordingsDir, `chunk-${Date.now()}.raw`);
      fs.writeFileSync(rawChunkPath, Buffer.concat(audioBuffer));
      audioBuffer = [];

      const wavPath = rawChunkPath.replace('.raw', '.wav');
      const ffmpegCommand = `ffmpeg -f mulaw -ar 8000 -ac 1 -i ${rawChunkPath} ${wavPath}`;

      exec(ffmpegCommand, async (error) => {
        if (error) return console.error('❌ FFmpeg error:', error.message);

        try {
          const transcript = await transcribeAudio(wavPath);
          if (!isValidTranscript(transcript)) return;

          console.log(`📝 Transcript: ${transcript}`);
          lastTranscript = transcript;

          const { replyText, threadId: newThreadId } = await askAssistant(transcript, threadId);
          threadId = newThreadId || threadId;

          console.log('🤖 Assistant reply:', replyText);
          const ttsBuffer = await synthesizeSpeech(replyText);

          const filename = `speech_${Date.now()}.mp3`;
          const filepath = path.join(AUDIO_DIR, filename);
          fs.writeFileSync(filepath, ttsBuffer);

          const audioUrl = `${AUDIO_BASE_URL}/${filename}`;

          if (callId) {
            await axios.post(
              `https://api.telnyx.com/v2/calls/${callId}/actions/playback_stop`,
              {},
              { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
            );

            await axios.post(
              `https://api.telnyx.com/v2/calls/${callId}/actions/playback_start`,
              { audio_url: audioUrl },
              { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` } }
            );
          }
        } catch (err) {
          console.error('❌ Voice loop error:', err.response?.data || err.message);
        } finally {
          fs.unlinkSync(rawChunkPath);
          fs.unlinkSync(wavPath);
        }
      });
    };

    const resetVAD = () => {
      if (vadTimer) clearTimeout(vadTimer);
      vadTimer = setTimeout(() => {
        console.log('🕳️ Silence detected, flushing audio...');
        flushAndTranscribe();
      }, MAX_SILENCE_MS);
    };

    const rms = (buffer) => {
      const view = new Int8Array(buffer);
      const squareSum = view.reduce((sum, val) => sum + val * val, 0);
      return Math.sqrt(squareSum / view.length);
    };

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
          callId = data.start.call_control_id;
          console.log('🎙️ Telnyx started streaming for call:', callId);
        } else if (data.event === 'media') {
          const chunk = Buffer.from(data.media.payload, 'base64');
          audioBuffer.push(chunk);
          const level = rms(chunk);
          if (level > RMS_THRESHOLD) {
            resetVAD();
          }
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
          if (vadTimer) clearTimeout(vadTimer);
          flushAndTranscribe();
        }
      } catch (err) {
        console.error('⚠️ Message parse error:', err.message);
      }
    });

    ws.on('close', () => {
      if (vadTimer) clearTimeout(vadTimer);
      flushAndTranscribe();
    });
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};
