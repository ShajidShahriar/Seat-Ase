import { once } from 'node:events';

// ---- Test servers bound to 127.0.0.1 only ----

const openServers = [];

export async function listenOnLoopback(handler) {
  const server = handler.listen(0, '127.0.0.1');
  await once(server, 'listening');
  openServers.push(server);
  return server;
}

export async function closeLoopbackServers() {
  const servers = openServers.splice(0);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}
