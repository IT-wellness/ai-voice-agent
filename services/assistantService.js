import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = process.env.ASSISTANT_ID;

if (!OPENAI_API_KEY || !ASSISTANT_ID) {
  throw new Error("❌ Missing OPENAI_API_KEY or ASSISTANT_ID in environment variables.");
}

const headers = {
  Authorization: `Bearer ${OPENAI_API_KEY}`,
  'OpenAI-Beta': 'assistants=v2',
  'Content-Type': 'application/json',
};

/**
 * Sends user input to OpenAI's Assistant API using the thread-based v2 system.
 */
const askAssistant = async (userText, existingThreadId = null) => {
  try {
    let threadId = existingThreadId;

    // Step 1: Create thread
    if (!threadId) {
      console.log('🧵 Creating new thread...');
      const threadRes = await axios.post(
        'https://api.openai.com/v1/threads',
        {},
        { headers }
      );
      threadId = threadRes.data.id;
    //   console.log(`✅ Thread created: ${threadId}`);
    } else {
      console.log(`📎 Using existing thread: ${threadId}`);
    }

    // Step 2: Post user message
    // console.log('📩 Sending user message to thread...');
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { role: 'user', content: userText },
      { headers }
    );
    // console.log('✅ Message posted.');

    // Step 3: Start assistant run
    console.log('🏃 Starting assistant run...');
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      { assistant_id: ASSISTANT_ID },
      { headers }
    );
    const runId = runRes.data.id;
    // console.log(`🌀 Run started: ${runId}`);

    // Step 4: Poll for completion
    let attempts = 0;
    const maxAttempts = 15;
    let status = 'queued';

    while (attempts < maxAttempts && status !== 'completed') {
      await new Promise((r) => setTimeout(r, 1000 + attempts * 500));
      const statusRes = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        { headers }
      );
      status = statusRes.data.status;
    //   console.log(`🔁 Polling status [${attempts + 1}/${maxAttempts}]: ${status}`);

      if (status === 'failed') {
        throw new Error('❌ Assistant run failed.');
      }

      attempts++;
    }

    if (status !== 'completed') {
      throw new Error('⏳ Assistant did not respond in time.');
    }

    // Step 5: Retrieve latest assistant message
    // console.log('📨 Retrieving assistant reply...');
    const msgRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { headers }
    );

    const messages = msgRes.data.data;
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    const replyText = assistantMsg?.content?.[0]?.text?.value?.trim();

    if (!replyText) {
      console.warn('⚠️ No reply text from assistant.');
      return { replyText: 'No response received.', threadId };
    }

    // console.log('💬 Assistant replied:', replyText);
    return { replyText, threadId };
  } catch (err) {
    const errorMsg = err?.response?.data || err.message || err;
    console.error('🔥 askAssistant error:', errorMsg);
    throw new Error('Failed to process assistant response.');
  }
};

export default askAssistant;