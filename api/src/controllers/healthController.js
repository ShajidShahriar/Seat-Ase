import { isDatabaseUp } from '../db/pool.js';

// 200 only when the API *and* its database work, so Docker/Render don't route traffic to a half-alive app.
export async function health(req, res) {
  const dbUp = await isDatabaseUp();
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
}
