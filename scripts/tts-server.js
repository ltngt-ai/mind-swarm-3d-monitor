#!/usr/bin/env node
// Minimal TTS HTTP server for macOS using the built-in `say` command.
// No external dependencies. Serves AIFF audio for POST /tts { text }
// ESM module (package.json has "type": "module")

import http from 'http';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5002;

function sendCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function parseJSONBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function speakToFile(text, outPath, voice = '', rate = '') {
  return new Promise((resolve, reject) => {
    // Minimal, most compatible usage on macOS Big Sur:
    //   say -o out.aiff "text"
    // (avoid --data-format here; it causes failures on some versions)
    // You can adjust voice/rate with: -v "Samantha" -r 190
    const args = ['-o', outPath];
    if (voice) args.push('-v', voice);
    if (rate) args.push('-r', rate);
    args.push(text);
    const proc = spawn('say', args);
    let stderr = '';
    proc.stderr.on('data', d => (stderr += d.toString()));
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`say exited with code ${code}: ${stderr}`));
    });
    proc.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    sendCORS(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    if ((req.method === 'POST' || req.method === 'GET') && req.url && req.url.startsWith('/tts')) {
      let text = '';
      let voice = '';
      let rate = '';
      if (req.method === 'POST') {
        const body = await parseJSONBody(req).catch(() => ({}));
        text = (body && typeof body.text === 'string') ? body.text.trim() : '';
        voice = (body && typeof body.voice === 'string') ? body.voice.trim() : '';
        rate = (body && (typeof body.rate === 'number' || typeof body.rate === 'string')) ? String(body.rate) : '';
      } else {
        try {
          const u = new URL(req.url, 'http://localhost');
          text = (u.searchParams.get('text') || '').trim();
          voice = (u.searchParams.get('voice') || '').trim();
          rate = (u.searchParams.get('rate') || '').trim();
        } catch {}
      }
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Missing text' }));
      }
      // Safety: limit length
      const safeText = text.slice(0, 4000);
      const tmp = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.aiff`);
      const tmpWav = tmp.replace(/\.aiff?$/i, '.wav');
      try {
        await speakToFile(safeText, tmp, voice, rate);
        // Try to convert AIFF -> WAV for better Chromium/OBS compatibility
        try {
          await new Promise((resolve, reject) => {
            const proc = spawn('afconvert', ['-f', 'WAVE', '-d', 'LEI16', tmp, tmpWav]);
            let stderr = '';
            proc.stderr.on('data', d => (stderr += d.toString()));
            proc.on('close', code => {
              if (code === 0) resolve(); else reject(new Error(`afconvert exit ${code}: ${stderr}`));
            });
            proc.on('error', reject);
          });
        } catch (e) {
          // If afconvert not available, we will serve AIFF directly
        }

        let outPath = fs.existsSync(tmpWav) ? tmpWav : tmp;
        const buf = fs.readFileSync(outPath);
        const ctype = outPath.endsWith('.wav') ? 'audio/wav' : 'audio/aiff';
        res.writeHead(200, {
          'Content-Type': ctype,
          'Content-Length': buf.length,
          'Cache-Control': 'no-store'
        });
        res.end(buf);
      } finally {
        try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch {}
        try { fs.existsSync(tmpWav) && fs.unlinkSync(tmpWav); } catch {}
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  } catch (e) {
    try {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e && e.message || e) }));
    } catch {}
  }
});

server.listen(PORT, () => {
  console.log(`TTS server listening on http://127.0.0.1:${PORT}/tts`);
  console.log('POST { "text": "Hello world" } => audio/aiff');
});
