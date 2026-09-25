// ---- Open SSE connections, grouped by user ----

const connections = new Map();

export function addConnection(userId, res) {
  let userConnections = connections.get(userId);
  if (!userConnections) {
    userConnections = new Set();
    connections.set(userId, userConnections);
  }
  userConnections.add(res);

  return function removeConnection() {
    userConnections.delete(res);
    if (userConnections.size === 0 && connections.get(userId) === userConnections) {
      connections.delete(userId);
    }
  };
}

export function connectionCount(userId) {
  return connections.get(userId)?.size ?? 0;
}

export function closeAllConnections() {
  for (const userConnections of connections.values()) {
    for (const res of userConnections) res.end();
  }
  connections.clear();
}

// ---- Sending nudges ----

export function send(res, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function notify(userIds, payload) {
  for (const userId of new Set(userIds)) {
    const userConnections = connections.get(userId);
    if (!userConnections) continue;
    for (const res of userConnections) send(res, payload);
  }
}
