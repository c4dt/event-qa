import { writable } from 'svelte/store';
import type { Question, QuestionMessage, DmMessage, PublicUser } from './types.js';

export type WsEvent =
  | { type: 'question.new'; talkId: string; question: Question }
  | { type: 'question.update'; question: Question }
  | { type: 'question.message'; questionId: number; message: QuestionMessage }
  | { type: 'dm.new'; peerAlias: string; message: DmMessage }
  | { type: 'user.update'; user: PublicUser }
  | { type: 'presence'; alias: string; online: boolean };

export const connected = writable(false);

// Handlers that feature modules can register
const handlers = new Set<(ev: WsEvent) => void>();

export function addWsHandler(fn: (ev: WsEvent) => void): () => void {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

let socket: WebSocket | null = null;
let authed = false;
// Channels subscribed before auth.ok — flushed once auth is confirmed
const pendingSubscriptions = new Set<string>();

export function connectWs(token: string): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  authed = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
    connected.set(true);
  });
  ws.addEventListener('message', (ev) => {
    try {
      const raw = JSON.parse(ev.data as string) as { type: string };
      if (raw.type === 'auth.ok') {
        authed = true;
        for (const ch of pendingSubscriptions) {
          ws.send(JSON.stringify({ type: 'subscribe', channel: ch }));
        }
        pendingSubscriptions.clear();
        return;
      }
      for (const h of handlers) h(raw as unknown as WsEvent);
    } catch {
      // ignore malformed
    }
  });
  ws.addEventListener('close', () => {
    connected.set(false);
    authed = false;
    socket = null;
  });
  socket = ws;
  return ws;
}

export function subscribeChannel(channel: string): void {
  if (authed && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', channel }));
  } else {
    pendingSubscriptions.add(channel);
  }
}

export function unsubscribeChannel(channel: string): void {
  pendingSubscriptions.delete(channel);
  socket?.send(JSON.stringify({ type: 'unsubscribe', channel }));
}

export function disconnectWs(): void {
  socket?.close();
  authed = false;
  pendingSubscriptions.clear();
  socket = null;
}
