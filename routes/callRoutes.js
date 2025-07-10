import express from 'express';
import { initiateOutboundCall } from '../controllers/callController.js';

const router = express.Router();

router.post('/outbound', initiateOutboundCall);

export default router;