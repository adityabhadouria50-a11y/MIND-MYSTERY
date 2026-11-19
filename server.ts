import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { seedDatabaseIfNeeded } from './data/seed/index.ts';
import { rateLimitMiddleware } from './routes/middleware.ts';
import { riddleRouter } from './routes/riddleRoutes.ts';
import { sessionRouter } from './routes/sessionRoutes.ts';
import { userRouter } from './routes/userRoutes.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  // Initialize SQLite and seed verified candidates & riddles
  const seeded = seedDatabaseIfNeeded();
  console.log(
    `[MINDMYSTERY] Database ready: ${seeded.candidatesCount} verified candidates, ${seeded.riddlesCount} verified riddles.`
  );

  const app = express();
  app.use(express.json({ limit: '512kb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, candidates: seeded.candidatesCount, riddles: seeded.riddlesCount });
  });

  // Rate-limited API routes
  app.use('/api', rateLimitMiddleware(240, 60_000));
  app.use('/api/session', sessionRouter);
  app.use('/api/riddle', riddleRouter);
  app.use('/api', userRouter);

  // Unknown API routes return clean JSON 404
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'API route not found.' } });
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MINDMYSTERY] Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[MINDMYSTERY] Fatal startup error:', err);
  process.exit(1);
});
