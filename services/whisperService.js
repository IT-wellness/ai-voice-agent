import fs from 'fs';
import fsPromises from 'fs/promises';
// import path from 'path';
// import os from 'os';
// import crypto from 'crypto';
// import { fileTypeFromBuffer } from 'file-type';
import openai from './openaiClient.js';
// import ffmpeg from 'fluent-ffmpeg';
// import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
// import { Readable } from 'stream';


const MAX_FILE_SIZE_MB = 25;

async function runWhisper(fileOrBuffer) {
  const response = await openai.audio.transcriptions.create({
    file: fileOrBuffer,
    model: 'whisper-1',
    response_format: 'text',
  });

  return (response || '').trim();
}

export const transcribeAudio = async (inputPath) => {
//   const wavPath = inputPath.replace(path.extname(inputPath), '.wav');

  try {
    // 🚫 Check file size before conversion
    const stats = await fsPromises.stat(inputPath);
    const sizeMB = (stats.size / 1048576).toFixed(2);
    console.log(`📦 Uploaded file size: ${sizeMB} MB`);

    if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`Audio file too large (${sizeMB} MB)`);
    }

    // 🎙️ Convert to WAV (mono, 16kHz)
    // await new Promise((resolve, reject) => {
    //   ffmpeg(inputPath)
    //     .audioFrequency(16000)
    //     .audioChannels(1)
    //     .format('wav')
    //     .on('end', () => {
    //       console.log(`✅ Converted audio to WAV: ${wavPath}`);
    //       resolve();
    //     })
    //     .on('error', (err) => {
    //       console.error('❌ FFmpeg conversion failed:', err.message);
    //       reject(new Error('Audio conversion failed.'));
    //     })
    //     .save(wavPath);
    // });

    // 🧠 Transcribe using Whisper
    const transcript = await runWhisper(fs.createReadStream(inputPath));
    console.log('📝 Transcription successful:', transcript);

    return transcript;
  } catch (err) {
    console.error('🔥 Failed to transcribe audio:', err.message);
    throw new Error('Transcription failed: ' + err.message);
//   } finally {
//     try {
//       await fsPromises.unlink(inputPath);
//       await fsPromises.unlink(wavPath);
//       console.log('🧼 Cleaned up temp audio files.');
//     } catch (cleanupErr) {
//       console.warn('⚠️ Failed to delete temp files:', cleanupErr.message);
//     }
  }
};

// export const transcribeAudioBuffer = async (buffer) => {
//   const tempInputPath = path.join(os.tmpdir(), `input-${crypto.randomUUID()}.raw`);
//   const tempWavPath = tempInputPath.replace('.raw', '.wav');

//   try {
//     // 1️⃣ Write buffer to temp input.raw
//     // console.log("MESSAGE: ", buffer);	    
//     // await fsPromises.writeFile(tempInputPath, buffer);
//     // const stats = await fsPromises.stat(tempInputPath);
//     // const sizeMB = (stats.size / 1048576).toFixed(2);

//     // if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
//     //   throw new Error(`Audio buffer too large (${sizeMB} MB)`);
//     // }

//     let resultStream = bufferToStream(buffer);

//     // 2️⃣ Convert raw PCM to wav (mono, 16kHz)
//     await new Promise((resolve, reject) => {
//       ffmpeg(resultStream)
//          .inputFormat('opus') // Important for Telnyx audio!
//         .audioFrequency(16000)
//         .audioChannels(1)
//         .audioCodec('pcm_s16le')
//         .format('wav')
//         .on('end', () => {
//           console.log(`✅ Buffer converted to WAV: ${tempWavPath}`);
//           resolve();
//         })
//         .on('error', (err) => {
//           console.error('❌ FFmpeg buffer conversion failed:', err.message);
//           reject(err);
//         })
//         .save(tempWavPath);
//     });

//     // 3️⃣ Transcribe with Whisper
//     const transcript = await runWhisper(fs.createReadStream(tempWavPath));
//     console.log('📝 Buffer transcription successful:', transcript);
//     return transcript;
//   } catch (err) {
//     console.error('🔥 Buffer transcription failed:', err.message);
//     throw new Error('Transcription failed: ' + err.message);
//   // } finally {
//   //   // 🧼 Clean temp files
//   //   try {
//   //     await fsPromises.unlink(tempInputPath);
//   //     await fsPromises.unlink(tempWavPath);
//   //   } catch (cleanupErr) {
//   //     console.warn('⚠️ Temp cleanup failed:', cleanupErr.message);
//   //   }
//   }
// };
