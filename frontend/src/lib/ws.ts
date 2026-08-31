import { writable } from 'svelte/store';
import type { Question, QuestionMessage, DmMessage, ChatFeedItem, PublicUser } from './types.js';

export type WsEvent =
  | { type: 'question.new'; talkId: string; question: Question }
  | { type: 'question.update'; question: Question }
  | { type: 'question.message'; questionId: number; message: QuestionMessage }
  | { type: 'dm.new'; peerAlias: string; message: DmMessage }
  | { type: 'room.message'; room: string; message: ChatFeedItem }
  | { type: 'chat.message'; talkId: string; message: ChatFeedItem }
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
let currentToken: string | null = null;
let manualDisconnect = false;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
// Channels that should be subscribed, whether or not auth has completed yet.
// Kept across reconnects so a dropped socket resubscribes automatically.
const activeChannels = new Set<string>();

const MAX_RECONNECT_DELAY_MS = 30_000;

function scheduleReconnect(): void {
  if (manualDisconnect || reconnectTimer || !currentToken) return;
  const delay = Math.min(1000 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS);
  reconnectAttempt++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!manualDisconnect && currentToken) connectWs(currentToken);
  }, delay);
}

// Bypasses the backoff delay: called when we have a strong signal the
// connection may have just become viable again (tab refocused, machine
// woke from sleep, network came back), so waiting out the backoff would
// mean sitting on a dead socket longer than necessary.
function reconnectNow(): void {
  if (manualDisconnect || !currentToken) return;
  if (socket && socket.readyState === WebSocket.OPEN) return;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  connectWs(currentToken);
}

let lifecycleListenersInstalled = false;

// Browsers have no direct "woke from sleep" event; visibilitychange +
// pageshow (bfcache restore) + focus + online together cover the cases
// where a socket died silently while the tab was backgrounded/suspended.
function installLifecycleListeners(): void {
  if (lifecycleListenersInstalled || typeof window === 'undefined') return;
  lifecycleListenersInstalled = true;
  window.addEventListener('online', reconnectNow);
  window.addEventListener('focus', reconnectNow);
  window.addEventListener('pageshow', reconnectNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reconnectNow();
  });
}

export function connectWs(token: string): WebSocket {
  installLifecycleListeners();
  currentToken = token;
  manualDisconnect = false;
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
        reconnectAttempt = 0;
        for (const ch of activeChannels) {
          ws.send(JSON.stringify({ type: 'subscribe', channel: ch }));
        }
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
    scheduleReconnect();
  });
  socket = ws;
  return ws;
}

export function subscribeChannel(channel: string): void {
  activeChannels.add(channel);
  if (authed && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'subscribe', channel }));
  }
}

export function unsubscribeChannel(channel: string): void {
  activeChannels.delete(channel);
  socket?.send(JSON.stringify({ type: 'unsubscribe', channel }));
}

export function disconnectWs(): void {
  manualDisconnect = true;
  currentToken = null;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  socket?.close();
  authed = false;
  activeChannels.clear();
  socket = null;
}
