import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { addConnection, send } from '../realtime/notify.js';
import * as vehicleService from '../services/vehicleService.js';

export function stream(req, res) {
  const { id: userId, role } = req.user;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const removeConnection = addConnection(userId, res);

  function heartbeat() {
    send(res, { type: 'heartbeat' });
    if (role === 'DRIVER') {
      vehicleService.touchLastSeen(userId).catch((err) => {
        logger.warn('Could not update last_seen_at from heartbeat', { userId, error: err.message });
      });
    }
  }

  heartbeat();
  const timer = setInterval(heartbeat, env.SSE_HEARTBEAT_MS);

  res.on('close', () => {
    clearInterval(timer);
    removeConnection();
  });
}
