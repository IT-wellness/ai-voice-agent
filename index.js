import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import http from 'http';

import callRoutes from './routes/callRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { startMediaWebSocketServer } from './services/mediaStreamServer.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const audioPath = path.join('/var/www/frontend/dist/audio');
if (fs.existsSync(audioPath)) {
  // console.log('📁 Serving static audio from:', audioPath);
  app.use('/audio', express.static(audioPath));
} else {
  console.warn('⚠️ Audio path not found:', audioPath);
}

// Routes
app.use('/api/call', callRoutes);
app.use('/api/telnyx', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Telnyx Voice Backend is Running');
});

const server = http.createServer(app);

// Start WebSocket server on `/media-stream`
startMediaWebSocketServer(server);

// Start HTTP server
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}.`);
});