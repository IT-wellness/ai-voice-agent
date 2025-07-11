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

// Voice Activity Detection Configuration
const SILENCE_THRESHOLD = 500; // RMS threshold for silence detection
const SILENCE_DURATION_MS = 1000; // 1 second of silence to consider speech ended
const MIN_SPEECH_DURATION_MS = 500; // Minimum speech duration to process

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

    // Voice Activity Detection State
    let audioBuffer = [];
    let isSpeaking = false;
    let lastActiveTime = Date.now();
    let currentPlaybackId = null;
    let threadId = null;
    let callId = null;
    let lastTranscript = '';

    // Conversation state
    const conversationState = {
      history: [],
      lastInteraction: Date.now(),
      isAIResponding: false
    };

    const isValidTranscript = (text) => {
      if (!text || text.trim().length < 3) return false;
      if (text.trim() === '.' || text.trim() === '..' || text.trim() === '...') return false;
      if (text.trim() === lastTranscript) return false;
      return true;
    };

    const calculateAudioLevel = (chunk) => {
      let sum = 0;
      for (let i = 0; i < chunk.length; i += 2) { // 16-bit audio (2 bytes per sample)
        const sample = chunk.readInt16LE(i);
        sum += sample * sample;
      }
      return Math.sqrt(sum / (chunk.length / 2)); // RMS value
    };

    const processAudioChunk = (chunk) => {
      const now = Date.now();
      const audioLevel = calculateAudioLevel(chunk);
      
      if (audioLevel > SILENCE_THRESHOLD) {
        lastActiveTime = now;
        if (!isSpeaking) {
          isSpeaking = true;
          console.log('🎤 Speech detected');
        }
        audioBuffer.push(chunk);
        return false; // Not ready to transcribe yet
      } else if (isSpeaking && (now - lastActiveTime) > SILENCE_DURATION_MS) {
        // End of speech detected
        isSpeaking = false;
        if ((now - lastActiveTime + audioBuffer.length * 20) > MIN_SPEECH_DURATION_MS) {
          // Only process if speech was long enough
          return true; // Ready to transcribe
        }
        audioBuffer = []; // Reset if too short
      }
      return false;
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

            // Add to conversation history
            conversationState.history.push({ role: 'user', content: transcript });
            conversationState.lastInteraction = Date.now();

            // If AI is currently responding, interrupt it
            if (conversationState.isAIResponding && currentPlaybackId) {
              console.log('⏸️ Interrupting current AI response');
              await stopCurrentPlayback();
            }

            // Get AI response
            conversationState.isAIResponding = true;
            const { replyText, threadId: newThreadId } = await askAssistant(
              transcript, 
              threadId,
              conversationState.history
            );
            threadId = newThreadId || threadId;
            console.log('🤖 Assistant reply:', replyText);

            // Add AI response to history
            conversationState.history.push({ role: 'assistant', content: replyText });

            // Generate and play TTS
            const playbackId = Date.now().toString();
            currentPlaybackId = playbackId;
            await playTTS(replyText, playbackId);
            
          }
        } catch (err) {
          console.error('❌ Voice loop error:', err.response?.data || err.message);
        } finally {
          // Clean up
          fs.unlinkSync(rawChunkPath);
          fs.unlinkSync(wavPath);
          audioBuffer = [];
        }
      });
    };

    const stopCurrentPlayback = async () => {
      if (!callId || !currentPlaybackId) return;
      
      try {
        await axios.post(
          `https://api.telnyx.com/v2/calls/${callId}/actions/playback_stop`,
          { playback_id: currentPlaybackId },
          {
            headers: {
              Authorization: `Bearer ${process.env.TELNYX_API_KEY}`
            }
          }
        );
        console.log('⏹ Stopped current playback');
      } catch (err) {
        console.error('❌ Failed to stop playback:', err.message);
      }
    };

    const playTTS = async (text, playbackId) => {
      try {
        const responseBuffer = await synthesizeSpeech(text);
        if (!responseBuffer) throw new Error('TTS failed');

        const filename = `speech_${playbackId}.mp3`;
        const filepath = path.join(AUDIO_DIR, filename);
        fs.writeFileSync(filepath, responseBuffer);

        const audioUrl = `${AUDIO_BASE_URL}/${filename}`;

        if (callId) {
          console.log('📤 Sending audio to Telnyx for call:', callId);
          await axios.post(
            `https://api.telnyx.com/v2/calls/${callId}/actions/playback_start`,
            { 
              audio_url: audioUrl,
              playback_id: playbackId
            },
            {
              headers: {
                Authorization: `Bearer ${process.env.TELNYX_API_KEY}`
              }
            }
          );
        }
      } catch (err) {
        console.error('❌ TTS playback error:', err.message);
      } finally {
        conversationState.isAIResponding = false;
      }
    };

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.event === 'start') {
          callId = data.start.call_control_id;
          console.log('🎙️ Telnyx started streaming audio for call:', callId);
        } 
        else if (data.event === 'media') {
          const base64Payload = data.media.payload;
          const audio = Buffer.from(base64Payload, 'base64');
          
          // Process with VAD
          const shouldTranscribe = processAudioChunk(audio);
          if (shouldTranscribe) {
            await flushAndTranscribe();
          }
        } 
        else if (data.event === 'stop') {
          console.log('⛔ Telnyx stopped streaming for call:', callId);
          await flushAndTranscribe(); // Process any remaining audio
        } 
        else if (data.event === 'playback_ended') {
          if (data.playback_id === currentPlaybackId) {
            console.log('✅ Playback completed:', data.playback_id);
            currentPlaybackId = null;
            conversationState.isAIResponding = false;
          }
        }
        else {
          console.log('🔹 Other event:', data.event);
        }
      } catch (err) {
        console.error('⚠️ Failed to process WebSocket message:', err.message);
      }
    });

    ws.on('close', async () => {
      console.log('🔌 WebSocket disconnected for call:', callId);
      await flushAndTranscribe();
      if (currentPlaybackId) {
        await stopCurrentPlayback();
      }
    });

    ws.on('error', (err) => {
      console.error('❌ WebSocket error:', err.message);
    });
  });

  console.log('🟢 Media WebSocket server ready at /media-stream');
};