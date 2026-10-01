import type { RequestHandler } from 'express';

const apiKey = process.env.API_KEY ?? 'sk-live-FALLBACK_SENTINEL_VALUE';

export const requireAuth: RequestHandler = (req, res, next) =>
  req.header('x-api-key') === apiKey ? next() : res.sendStatus(401);
