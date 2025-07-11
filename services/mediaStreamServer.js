import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { transcribeAudio } from './whisperService.js';
import askAssistant from './assistantService.js';


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
          if (transcript.trim()) {
            console.log(`📝 [Transcript]: ${transcript}`);
          }
           const { replyText, threadId: newThreadId } = await askAssistant(transcript, threadId);
            threadId = newThreadId || threadId;

            console.log('🤖 Assistant reply:', replyText);
          
        } catch (err) {
          console.error('❌ Failed to transcribe chunk:', err.message);
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
            callId = data.call_control_id;
          console.log('🎙️ Telnyx started streaming audio.');
          chunkInterval = setInterval(flushAndTranscribe, 4000); // Every 4 seconds
        } else if (data.event === 'media') {
            // console.log("MEDIA EVENT: ", data);
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