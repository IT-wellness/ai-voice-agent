import axios from 'axios';
import { telnyxConfig } from '../config/telnyx.js';

export const initiateOutboundCall = async (req, res) => {
  try {
    const { to } = req.body;

    const response = await axios.post(
      'https://api.telnyx.com/v2/calls',
      {
        connection_id: telnyxConfig.connectionId,
        to: to,
        from: telnyxConfig.callerId,
        webhook_url: `${telnyxConfig.publicUrl}/api/telnyx/webhook`,
        client_state: 'ai-call-session',
      },
      {
        headers: {
          Authorization: `Bearer ${telnyxConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    res.status(200).json({ message: 'Call initiated successfully', data: response.data.data });
  } catch (error) {
    console.error('Error initiating call:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
};