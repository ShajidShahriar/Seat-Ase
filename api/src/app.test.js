import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { listenOnLoopback, closeLoopbackServers } from './test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

describe('security headers and cross-site access', () => {
  it('sends helmet headers on every response', async () => {
    const res = await request(api).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['strict-transport-security']).toBeTruthy();
    expect(res.headers['content-security-policy']).toBeTruthy();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('never tells a browser that another website may read its answers', async () => {
    const res = await request(api).get('/health').set('Origin', 'https://someone-else.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();

    const preflight = await request(api)
      .options('/auth/login')
      .set('Origin', 'https://someone-else.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the login cookie out of reach of scripts and cross-site requests', async () => {
    const res = await request(api).post('/auth/logout');
    const cookie = res.headers['set-cookie'].join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe('GET /health', () => {
  it('reports ok when the database answers', async () => {
    // Assumes docker compose up db is running with DATABASE_URL pointed at it (see .env.example).
    const res = await request(api).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404 in our error shape', async () => {
    const res = await request(api).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
