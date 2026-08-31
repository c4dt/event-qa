import type { ChatFeedItem } from './types.js';

export type ChatBadge = { label: string; classes: string };

export function chatFeedKey(item: ChatFeedItem): string {
  return `${item.source}:${item.id}`;
}

// One badge per origin so a scanning eye can tell apart a brand-new
// question, a Q&A reply bubbled up from a thread, a talk's own chat, and a
// plain general-chat message. `onColor` is for badges sitting on a solid
// (e.g. "my message") background, where a saturated pill of its own would
// clash — those get a plain translucent chip instead.
export function chatFeedBadge(item: ChatFeedItem, onColor = false): ChatBadge {
  if (onColor) {
    return { label: chatFeedBadgeLabel(item), classes: 'bg-white/20 text-white' };
  }
  switch (item.source) {
    case 'question_new':
      return { label: 'New question', classes: 'bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300' };
    case 'question':
      return { label: 'Q&A reply', classes: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300' };
    case 'talk':
      return { label: 'Talk chat', classes: 'bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300' };
    case 'general':
      return { label: 'General', classes: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  }
}

function chatFeedBadgeLabel(item: ChatFeedItem): string {
  switch (item.source) {
    case 'question_new':
      return 'New question';
    case 'question':
      return 'Q&A reply';
    case 'talk':
      return 'Talk chat';
    case 'general':
      return 'General';
  }
}
