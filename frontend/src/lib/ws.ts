// WebSocket client stub. The realtime hub is fully wired on the
// backend but the frontend slice does not yet subscribe to events;
// this module exposes the connect() function so future work can
// dispatch into stores from a single place.
import { writable } from 'svelte/store';

export type WsEvent =
  | { type: 'question.new'; talkId: string; question: unknown }
  | { type: 'question.update'; question: unknown }
  | { type: 'question.message'; questionId: number; message: unknown }
  | { type: 'dm.new'; peerAlias: string; message: unknown }
  | { type: 'user.update'; user: unknown }
  | { type: 'presence'; alias: string; online: boolean };

export const connected = writable(false);

let socket: WebSocket | null = null;

export function connectWs(token: string): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/ws`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
    connected.set(true);
  });
  ws.addEventListener('close', () => {
    connected.set(false);
    socket = null;
  });
  socket = ws;
  return ws;
}

export function disconnectWs(): void {
  socket?.close();
  socket = null;
}
