import { Router } from 'express';

const router = Router();

router.get('/orders', (_req, res) => res.json([]));
router.get('/orders/:id', (req, res) => res.json({ id: req.params.id }));

export default router;
