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
    let chunkInterval = null;
    let threadId = null;
    let callId = null;
    let lastTranscript = '';

    const isValidTranscript = (text) => {
        if (!text || text.trim().length < 3) return false;
        if (text.trim() === '.' || text.trim() === '..' || text.trim() === '...') return false;
        if (text.trim() === lastTranscript) return false;
        return true;
    };

    const flushAndTranscribe = async () => {
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
          if (isValidTranscript(transcript)) {
            console.log(`📝 [Transcript]: ${transcript}`);
            lastTranscript = transcript;

            const { replyText, threadId: newThreadId } = await askAssistant(transcript, threadId);
            threadId = newThreadId || threadId;
            console.log('🤖 Assistant reply:', replyText);

            const responseBuffer = await synthesizeSpeech(replyText);
            if (!responseBuffer) throw new Error('TTS failed');

            const filename = `speech_${Date.now()}.mp3`;
            const filepath = path.join(AUDIO_DIR, filename);
            fs.writeFileSync(filepath, responseBuffer);

            const audioUrl = `${AUDIO_BASE_URL}/${filename}`;
        
            if (callId) {
                console.log('📤 Sending audio to Telnyx for call:', callId);
                await axios.post(
                    `https://api.telnyx.com/v2/calls/${callId}/actions/playback_start`,
                    { audio_url: audioUrl },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.TELNYX_API_KEY}`
                        }
                    }
                );
                // console.log('✅ TTS audio sent to Telnyx');
            } else {
                console.warn('⚠️ Missing callId. Skipping Telnyx send_audio.');
            }
        }
        } catch (err) {
            console.error('❌ Voice loop error:', err.response?.data || err.message);
        }
    
        // Clean up
        fs.unlinkSync(rawChunkPath);
        fs.unlinkSync(wavPath);
    });

      audioBuffer = []; // Reset
    };

  ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
            callId = data.start.call_control_id;
          console.log('🎙️ Telnyx started streaming audio.');
          chunkInterval = setInterval(() => flushAndTranscribe(), 6000); // Every 6 seconds
        } else if (data.event === 'media') {
            console.log("MEDIA EVENT: ", data);
            const base64Payload = data.media.payload;
            const audio = Buffer.from(base64Payload, 'base64');
            audioBuffer.push(audio);
        } else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming.');
          clearInterval(chunkInterval);
          await flushAndTranscribe();
        } else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ Failed to process WebSocket message:', err.message);
      }
    });

 ws.on('close', async () => {
      clearInterval(chunkInterval);
      await flushAndTranscribe();
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
});
 console.log('🟢 Media WebSocket server ready at /media-stream');
}