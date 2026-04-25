'use strict';

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'data.json');

// Tracks running cloudflare tunnel processes per section
const runningTunnels = {};
// Tracks last successful generation timestamp globally
let lastGeneratedGlobal = undefined;

function readData() {
  let data = {};
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  }
  // Ensure every page from config has an entry
  let changed = false;
  for (const key of Object.keys(config.PAGES)) {
    if (!data[key]) {
      data[key] = [];
      changed = true;
    }
  }
  if (changed) writeData(data);
  return data;
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/pages — return all page configs merged with persisted segments
app.get('/api/pages', (req, res) => {
  const data = readData();
  const result = {};
  for (const [key, pageConfig] of Object.entries(config.PAGES)) {
    result[key] = {
      ...pageConfig,
      section: key,
      segments: data[key] || [],
    };
  }
  res.json(result);
});

// GET /api/pages/:section/generate — SSE stream of tunnel progress + URL
app.get('/api/pages/:section/generate', (req, res) => {
  const { section } = req.params;
  const page = config.PAGES[section];
  if (!page) { res.status(404).json({ error: 'Page not found' }); return; }

  // Cooldown check — send as SSE so EventSource handles it
  const cooldown = config.COOLDOWN_MS ?? 3600000;
  const last = lastGeneratedGlobal;
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < cooldown) {
      const remaining = Math.ceil((cooldown - elapsed) / 1000);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Cooldown active — wait ${remaining}s before generating again.` })}

`);
      res.end();
      return;
    }
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (obj) => {
    if (res.writableEnded) return;
    const line = `data: ${JSON.stringify(obj)}\n\n`;
    process.stdout.write(`[SSE→${section}] ${JSON.stringify(obj)}\n`);
    res.write(line);
  };

  // Kill any existing tunnel for this section
  if (runningTunnels[section]) {
    try { runningTunnels[section].kill(); } catch (_) {}
    delete runningTunnels[section];
    send({ type: 'log', text: 'Killed previous tunnel process.' });
  }

  // 'cloudflared' is the actual binary name for Cloudflare Tunnel
  const cmd = 'cloudflared';
  const args = ['tunnel', '--url', `localhost:${page.port}`];
  console.log(`[${section}] Spawning: ${cmd} ${args.join(' ')}`);
  send({ type: 'log', text: `Spawning: ${cmd} ${args.join(' ')}` });

  let proc;
  try {
    proc = spawn(cmd, args, { shell: true });
  } catch (err) {
    send({ type: 'error', message: `Failed to spawn process: ${err.message}` });
    res.end();
    return;
  }

  runningTunnels[section] = proc;

  let urlFound = false;
  const urlRegex = /https:\/\/[\w-]+\.trycloudflare\.com/;

  const handleOutput = (chunk) => {
    const text = chunk.toString().trim();
    if (!text) return;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      console.log(`[${section}] ${line}`);
      send({ type: 'log', text: line });
      if (!urlFound) {
        const match = line.match(urlRegex);
        if (match) {
          urlFound = true;
          const url = match[0];
          const stored = readData();
          if (!stored[section]) stored[section] = [];
          stored[section].push({ id: Date.now(), url, label: new Date().toLocaleString() });
          writeData(stored);
          lastGeneratedGlobal = Date.now();
          console.log(`[${section}] URL found: ${url}`);
          send({ type: 'url', url });
          res.end();
        }
      }
    }
  };

  proc.stdout.on('data', handleOutput);
  proc.stderr.on('data', handleOutput);

  proc.on('error', (err) => {
    console.error(`[${section}] Error: ${err.message}`);
    send({ type: 'error', message: `Failed to start tunnel: ${err.message}` });
    res.end();
  });

  proc.on('close', (code) => {
    clearTimeout(timer);
    if (!urlFound) {
      console.log(`[${section}] Process closed (code ${code}) without URL`);
      send({ type: 'error', message: `Process exited (code ${code}) without producing a tunnel URL` });
      res.end();
    }
  });

  const timer = setTimeout(() => {
    if (!urlFound) {
      console.log(`[${section}] Timed out after 30s`);
      send({ type: 'error', message: 'Timed out waiting for tunnel URL (30s)' });
      res.end();
      try { proc.kill(); } catch (_) {}
    }
  }, 30000);

  res.on('close', () => {
    clearTimeout(timer);
    if (!urlFound) {
      try { proc.kill(); } catch (_) {}
      delete runningTunnels[section];
    }
  });
});

// DELETE /api/pages/:section/segments/:id — remove a segment
app.delete('/api/pages/:section/segments/:id', (req, res) => {
  const { section, id } = req.params;
  const data = readData();
  if (!data[section]) return res.status(404).json({ error: 'Page not found' });
  data[section] = data[section].filter(s => s.id !== Number(id));
  writeData(data);
  res.json({ ok: true });
});

// In production (after `npm run build`), serve the built frontend
const distDir = path.join(__dirname, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(config.PORT, () => {
  // Clear all segments on startup
  const empty = {};
  for (const key of Object.keys(config.PAGES)) empty[key] = [];
  writeData(empty);
  console.log('Segments cleared on startup.');
  console.log(`API server running on http://localhost:${config.PORT}`);
});
