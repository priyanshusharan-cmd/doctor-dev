import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { startAnalysis } from './services/analysisService';

vi.mock('./services/analysisService', () => ({ startAnalysis: vi.fn().mockResolvedValue('test-analysis') }));

const html = '<!doctype html><html><body>Doctor Dev test frontend</body></html>';
let fixture: string;
let server: Server;
let base: string;

beforeAll(async () => {
  fixture = mkdtempSync(path.join(tmpdir(), 'doctor-dev-web-'));
  mkdirSync(path.join(fixture, 'assets'));
  writeFileSync(path.join(fixture, 'index.html'), html);
  writeFileSync(path.join(fixture, 'assets/app.js'), 'export const ready = true;');
  writeFileSync(path.join(fixture, '.env'), 'SECRET=never-serve-this');
  server = createApp(fixture).listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server.listening) {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  rmSync(fixture, { recursive: true, force: true });
});

describe('combined website and API', () => {
  it('serves the homepage and client-side navigation', async () => {
    for (const route of ['/', '/report']) {
      const response = await fetch(`${base}${route}`, { headers: { Accept: 'text/html' } });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toBe(html);
    }
  });

  it('serves the frontend assets', async () => {
    const response = await fetch(`${base}/assets/app.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('export const ready');
  });

  it('serves API health from the same origin', async () => {
    const response = await fetch(`${base}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', version: '1.0.0' });
  });

  it('starts an analysis through the same origin', async () => {
    const response = await fetch(`${base}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repositoryPath: './demo-repository' }),
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ analysisId: 'test-analysis', status: 'pending' });
    expect(startAnalysis).toHaveBeenCalledWith('./demo-repository', { runTests: false, generateTests: true });
  });

  it('keeps invalid API requests as JSON errors', async () => {
    const response = await fetch(`${base}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid request body' });
  });

  it('rejects malformed JSON as a client error', async () => {
    const response = await fetch(`${base}/api/analyze`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json',
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it('keeps unknown APIs and missing analyses out of the SPA fallback', async () => {
    for (const route of ['/api/missing', '/api/analysis/missing']) {
      const response = await fetch(`${base}${route}`, { headers: { Accept: 'text/html' } });
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(await response.json()).toHaveProperty('error');
    }
  });

  it('does not serve HTML for missing assets or expose dotfiles', async () => {
    for (const route of ['/assets/missing.js', '/assets/missing', '/missing.svg', '/.env']) {
      const response = await fetch(`${base}${route}`);
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain('never-serve-this');
    }
  });

  it('still supports backend-only local development', async () => {
    const localServer = createApp(path.join(fixture, 'unbuilt')).listen(0, '127.0.0.1');
    await new Promise<void>(resolve => localServer.once('listening', resolve));
    try {
      const address = localServer.address();
      if (!address || typeof address === 'string') throw new Error('Missing local server address');
      const response = await fetch(`http://127.0.0.1:${address.port}/`);
      expect(await response.json()).toMatchObject({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) => localServer.close(error => error ? reject(error) : resolve()));
    }
  });
});
