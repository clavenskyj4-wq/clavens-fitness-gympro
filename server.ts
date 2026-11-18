import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function getBuildVersionToken(): string {
  if (!isProduction) return 'dev';
  try {
    const indexHtml = path.resolve(__dirname, 'dist', 'index.html');
    if (fs.existsSync(indexHtml)) {
      const content = fs.readFileSync(indexHtml);
      return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    }
  } catch {
    // ignore read error
  }
  return 'prod';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/app-version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ ok: true, version: getBuildVersionToken() });
  });

  /**
   * Proxy serveur pour Google Apps Script Web App.
   * Permet d'éviter les blocages CORS / redirections 302 cross-origin dans les navigateurs et iframes,
   * et de diagnostiquer précisément si Google renvoie une page de connexion HTML ("Qui a accès" != "Tout le monde").
   */
  app.post('/api/sheets-proxy', async (req, res) => {
    try {
      const targetUrl = String(req.body?.targetUrl || '').trim();
      const method = req.body?.method === 'POST' ? 'POST' : 'GET';
      const payloadBody = req.body?.body;

      if (
        !targetUrl ||
        (!/^https:\/\/script\.google\.com\//i.test(targetUrl) &&
          !/^https:\/\/script\.googleusercontent\.com\//i.test(targetUrl))
      ) {
        res.status(400).json({
          ok: false,
          error: 'URL Google Apps Script invalide (doit commencer par https://script.google.com/).',
        });
        return;
      }

      const fetchInit: RequestInit = {
        method,
        redirect: 'follow',
      };

      if (method === 'POST') {
        fetchInit.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
        fetchInit.body =
          typeof payloadBody === 'string'
            ? payloadBody
            : JSON.stringify(payloadBody ?? {});
      }

      const upstream = await fetch(targetUrl, fetchInit);
      const rawText = await upstream.text();
      const contentType = upstream.headers.get('content-type') || '';
      const isHtml =
        /^\s*</.test(rawText) ||
        contentType.includes('text/html') ||
        upstream.url.includes('accounts.google.com');

      res.json({
        ok: true,
        status: upstream.status,
        finalUrl: upstream.url,
        isHtml,
        body: rawText,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error:
          err instanceof Error
            ? `Erreur proxy vers Google Apps Script : ${err.message}`
            : 'Erreur proxy vers Google Apps Script.',
      });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build introuvable.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GymPro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
