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
const recordingsDir = path.resolve('recordings');

if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir);

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

     let chunkBuffer = [];
    let callId = null;
    let threadId = null;
    let isPlaying = false;
    let lastTranscript = '';

    const isValidTranscript = (text) => {
      if (!text || text.trim().length < 3) return false;
      if (/^\.*$/.test(text.trim())) return false;
      if (text.trim() === lastTranscript) return false;
      return true;
    };

     const stopPlayback = async () => {
      if (callId) {
        try {
          await axios.post(`https://api.telnyx.com/v2/calls/${callId}/actions/playback_stop`, {}, {
            headers: {
              Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
            },
          });
          isPlaying = false;
          console.log('⏹️ Playback stopped');
        } catch (err) {
          console.warn('⚠️ Failed to stop playback:', err.response?.data || err.message);
        }
      }
    };

    const processChunk = async (buffer) => {
      const rawPath = path.join(recordingsDir, `chunk-${Date.now()}.raw`);
      const wavPath = rawPath.replace('.raw', '.wav');

      fs.writeFileSync(rawPath, buffer);
      const ffmpegCmd = `ffmpeg -f mulaw -ar 8000 -ac 1 -i ${rawPath} ${wavPath}`;

      exec(ffmpegCmd, async (error) => {
        if (error) {
          console.error('❌ FFmpeg error:', error.message);
          return;
        }

        try {
          const transcript = await transcribeAudio(wavPath);
          if (!isValidTranscript(transcript)) return;

          console.log(`📝 [Transcript]: ${transcript}`);
          lastTranscript = transcript;

          const { replyText, threadId: newThreadId } = await askAssistant(transcript, threadId);
          threadId = newThreadId || threadId;

          const ttsBuffer = await synthesizeSpeech(replyText);
          if (!ttsBuffer) throw new Error('TTS failed');

          const filename = `speech_${Date.now()}.mp3`;
          const filepath = path.join(AUDIO_DIR, filename);
          fs.writeFileSync(filepath, ttsBuffer);

          const audioUrl = `${AUDIO_BASE_URL}/${filename}`;

          if (callId) {
            console.log('📤 Playing audio to Telnyx:', audioUrl);
            isPlaying = true;
            await axios.post(
              `https://api.telnyx.com/v2/calls/${callId}/actions/playback_start`,
              { audio_url: audioUrl },
              {
                headers: {
                  Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
                },
              }
            );
          }
        } catch (err) {
          console.error('💥 Voice loop error:', err.response?.data || err.message);
        } finally {
          fs.unlinkSync(rawPath);
          fs.unlinkSync(wavPath);
        }
      });
    };

  ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
            callId = data.start.call_control_id;
          console.log('🎙️ Telnyx started streaming audio.');
        } else if (data.event === 'media') {
          const audio = Buffer.from(data.media.payload, 'base64');
          chunkBuffer.push(audio);

          if (chunkBuffer.length >= 100) {
            const combined = Buffer.concat(chunkBuffer);
            chunkBuffer = [];

            if (isPlaying) {
              await stopPlayback();
            }

            await processChunk(combined);
          }
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
          if (chunkBuffer.length) {
            await processChunk(Buffer.concat(chunkBuffer));
            chunkBuffer = [];
          }
        } else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ WebSocket message error:', err.message);
      }
    });

 ws.on('close', async () => {
      if (chunkBuffer.length) {
        await processChunk(Buffer.concat(chunkBuffer));
      }
      console.log('🔌 WebSocket disconnected.');
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};
