import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import callRoutes from './routes/callRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/call', callRoutes);
app.use('/api/telnyx', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Telnyx Voice Backend is Running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on https://localhost:${PORT}`);
});