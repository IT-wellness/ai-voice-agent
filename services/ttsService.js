// Import the configured OpenAI client
import openai from './openaiClient.js';

/**
 * cleanAssistantResponse
 * -----------------------------------
 * Removes special formatting tags or references like 【...】 or [†...]
 * from the assistant's text before speech synthesis to improve TTS quality.
 *
 * @param {string} text - The raw response text from the assistant.
 * @returns {string} - Cleaned text ready for TTS.
 */
function cleanAssistantResponse(text) {
  return text.replace(/【[^】]+】|\[\*?†[^\]]*\]/g, '').trim();
}

/**
 * synthesizeSpeech
 * -----------------------------------
 * Converts cleaned assistant text into speech using OpenAI's TTS API (tts-1).
 * Returns MP3 audio as a binary buffer.
 *
 * @param {string} text - The assistant’s reply (cleaned or raw).
 * @returns {Promise<Buffer>} - Audio content in MP3 format.
 */
export const synthesizeSpeech = async (text) => {
  try {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('❌ Invalid or empty input text for TTS.');
    }

    const cleanedText = cleanAssistantResponse(text);
    // console.log('🧹 Cleaned TTS input:', cleanedText);

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: cleanedText,
      format: 'mp3',
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // console.log(`🔊 TTS synthesis complete. Audio size: ${audioBuffer.length} bytes`);
    return audioBuffer;

  } catch (err) {
    const errorDetail = err?.response?.data || err.message || err;
    console.error('❌ TTS synthesis failed:', errorDetail);
    throw new Error('Failed to synthesize speech.');
  }
};