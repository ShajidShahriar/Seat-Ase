import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from './app.js';
import { listenOnLoopback, closeLoopbackServers } from './test/loopback.js';

let api;

beforeAll(async () => {
  api = await listenOnLoopback(app);
});

afterAll(closeLoopbackServers);

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
