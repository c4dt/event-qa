import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AppCtx } from '../http/context.js';
import { log } from '../util/log.js';

type AuthedSocket = WebSocket & {
  userId?: number;
  channels?: Set<string>;
  lastPong?: number;
};

const HEARTBEAT_INTERVAL_MS = 20_000;
const IDLE_PING_AFTER_MS = 30_000;
const IDLE_KILL_AFTER_MS = 40_000;

// Channels a client may subscribe/unsubscribe to over the wire.
// Per-user channels (dm:<id>, user:<id>) are added server-side at auth time
// so users cannot snoop on other users' streams.
const CLIENT_SUBSCRIBABLE = /^(talk|question):[A-Za-z0-9_-]+$/;

function isClientSubscribable(channel: string): boolean {
  return CLIENT_SUBSCRIBABLE.test(channel);
}

export function attachWsHub(server: Server, ctx: AppCtx): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket: AuthedSocket) => {
    socket.channels = new Set();
    socket.lastPong = Date.now();

    socket.on('message', (raw) => {
      let msg: { type?: string; token?: string; channel?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === 'auth' && typeof msg.token === 'string') {
        const user = ctx.auth.authenticate(msg.token);
        if (!user) {
          socket.send(JSON.stringify({ type: 'auth.error' }));
          socket.close();
          return;
        }
        socket.userId = user.id;
        socket.channels!.add(`user:${user.id}`);
        socket.channels!.add(`dm:${user.id}`);
        socket.send(JSON.stringify({ type: 'auth.ok' }));
        return;
      }
      if (!socket.userId) return;
      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        if (isClientSubscribable(msg.channel)) {
          socket.channels!.add(msg.channel);
        }
      } else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        if (isClientSubscribable(msg.channel)) {
          socket.channels!.delete(msg.channel);
        }
      }
    });

    socket.on('pong', () => {
      socket.lastPong = Date.now();
    });
  });

  const interval = setInterval(() => {
    const now = Date.now();
    for (const client of wss.clients as Set<AuthedSocket>) {
      if (client.readyState !== client.OPEN) continue;
      const since = now - (client.lastPong ?? now);
      if (since > IDLE_KILL_AFTER_MS) {
        client.terminate();
      } else if (since > IDLE_PING_AFTER_MS) {
        try {
          client.ping();
        } catch (err) {
          log.warn({ err }, 'ws ping failed');
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on('close', () => clearInterval(interval));
  return wss;
}
