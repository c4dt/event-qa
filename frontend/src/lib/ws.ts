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

export function connectWs(token: string): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
    connected.set(true);
  });
  ws.addEventListener('message', (ev) => {
    try {
      const data = JSON.parse(ev.data as string) as WsEvent;
      for (const h of handlers) h(data);
    } catch {
      // ignore malformed
    }
  });
  ws.addEventListener('close', () => {
    connected.set(false);
    socket = null;
  });
  socket = ws;
  return ws;
}

export function subscribeChannel(channel: string): void {
  socket?.send(JSON.stringify({ type: 'subscribe', channel }));
}

export function unsubscribeChannel(channel: string): void {
  socket?.send(JSON.stringify({ type: 'unsubscribe', channel }));
}

export function disconnectWs(): void {
  socket?.close();
  socket = null;
}
