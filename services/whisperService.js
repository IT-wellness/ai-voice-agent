import fs from 'fs';
import fsPromises from 'fs/promises';
import openai from './openaiClient.js';

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
  try {
    const stats = await fsPromises.stat(inputPath);
    const sizeMB = (stats.size / 1048576).toFixed(2);
    console.log(`📦 Uploaded file size: ${sizeMB} MB`);

    if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      throw new Error(`Audio file too large (${sizeMB} MB)`);
    }

    const transcript = await runWhisper(fs.createReadStream(inputPath));
    return transcript;
  } catch (err) {
    console.error('🔥 Failed to transcribe audio:', err.message);
    throw new Error('Transcription failed: ' + err.message);
  }
};