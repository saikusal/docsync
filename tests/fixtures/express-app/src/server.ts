import express from 'express';
import orders from './routes/orders.js';
import { requireAuth } from './middleware/auth.js';

const app = express();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

app.get('/health', (_req, res) => res.send('ok'));
app.use('/api', requireAuth, orders);

const port = Number(process.env.PORT) || 3000;
app.listen(port);
