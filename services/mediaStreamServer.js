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

const SILENCE_THRESHOLD = 8; // RMS silence threshold
const SILENCE_MS = 1500;
const MIN_SPEECH_MS = 300;

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
    let callId = null;
    let threadId = null;

    let silenceTimer = null;
    let minSpeechTimer = null;
    let isRecording = false;
    let lastTranscript = '';

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(handleSilence, SILENCE_MS);
    };


    const isValidTranscript = (text) => {
      if (!text || text.trim().length < 3) return false;
      if (text.trim() === '.' || text.trim() === '..' || text.trim() === '...') return false;
      if (text.trim() === lastTranscript) return false;
      return true;
    };

    const handleSilence = async () => {
      if (audioBuffer.length === 0) return;

      const rawPath = path.join(recordingsDir, `chunk-${Date.now()}.raw`);
      fs.writeFileSync(rawPath, Buffer.concat(audioBuffer));
      const wavPath = rawPath.replace('.raw', '.wav');
      const cmd = `ffmpeg -f mulaw -ar 8000 -ac 1 -i ${rawPath} ${wavPath}`;

      exec(cmd, async (error) => {
        if (error) return console.error('FFmpeg error:', error.message);

        try {
          const transcript = await transcribeAudio(wavPath);
          if (isValidTranscript(transcript)) {
            lastTranscript = transcript;
            console.log(`📝 [Transcript]: ${transcript}`);

            const { replyText, threadId: newThreadId } = await askAssistant(transcript, threadId);
            threadId = newThreadId || threadId;

            const audioBuffer = await synthesizeSpeech(replyText);
            const filename = `speech_${Date.now()}.mp3`;
            const outPath = path.join(AUDIO_DIR, filename);
            fs.writeFileSync(outPath, audioBuffer);

            const audioUrl = `${AUDIO_BASE_URL}/${filename}`;
            if (callId) {
              await axios.post(
                `https://api.telnyx.com/v2/calls/${callId}/actions/playback_start`,
                { audio_url: audioUrl },
                {
                  headers: {
                    Authorization: `Bearer ${telnyxConfig.apiKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              );
            }
          }
        } catch (err) {
          console.error('❌ Voice loop error:', err.message);
        }

        fs.unlinkSync(rawPath);
        fs.unlinkSync(wavPath);
      });

      audioBuffer = [];
      isRecording = false;
      clearTimeout(minSpeechTimer);
    };

    const getRMS = (buffer) => {
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const intVal = buffer[i] - 128;
        sumSquares += intVal * intVal;
      }
      return Math.sqrt(sumSquares / buffer.length);
    };

  ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.event === 'start') {
          callId = data.start.call_control_id;
          console.log(`🎙️ Telnyx started streaming: ${callId}`);
        } else if (data.event === 'media') {
          const buffer = Buffer.from(data.media.payload, 'base64');
          const rms = getRMS(buffer);

          if (rms > SILENCE_THRESHOLD) {
            if (!isRecording) {
              isRecording = true;
              minSpeechTimer = Date.now();
            }
            audioBuffer.push(buffer);
            resetSilenceTimer();
          } else if (isRecording && Date.now() - minSpeechTimer > MIN_SPEECH_MS) {
            resetSilenceTimer();
          }
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming');
          handleSilence();
        }
      } catch (e) {
        console.error('WebSocket message error:', e.message);
      }
    });

 ws.on('close', handleSilence);
    ws.on('error', (e) => console.error('WebSocket error:', e.message));
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};