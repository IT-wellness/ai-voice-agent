import express from 'express';
import { handleTelnyxWebhook } from '../controllers/webhookController.js';

const router = express.Router();

// Telnyx will POST call events here
router.post('/webhook', handleTelnyxWebhook);

export default router;