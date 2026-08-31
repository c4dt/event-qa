import type { ChatFeedItem } from './types.js';

export type ChatBadge = { label: string; classes: string };

export function chatFeedKey(item: ChatFeedItem): string {
  return `${item.source}:${item.id}`;
}

// A chat window shows either loose messages or bundles belonging to one
// "source": a question plus its Q&A replies, or (only where multiple talks'
// chats are mixed together, i.e. the general feed) one talk's own chat.
export type ChatFeedGroup =
  | { kind: 'message'; item: ChatFeedItem; latest: number }
  | {
      kind: 'question';
      questionId: number;
      questionTitle: string;
      talkId?: string;
      talkTitle?: string;
      // Only known when the group's feed includes the question_new item
      // (the general feed does; a single talk's feed only carries replies).
      askedAt?: number;
      items: ChatFeedItem[];
      latest: number;
    }
  | { kind: 'talk'; talkId: string; talkTitle: string; items: ChatFeedItem[]; latest: number };

export function chatGroupKey(group: ChatFeedGroup): string {
  switch (group.kind) {
    case 'message':
      return chatFeedKey(group.item);
    case 'question':
      return `question-group:${group.questionId}`;
    case 'talk':
      return `talk-group:${group.talkId}`;
  }
}

// Bundles question/question_new items by question_id, and (when groupTalks
// is set — only the general feed mixes several talks' chats together) talk
// items by talk_id. Everything else stays standalone. Groups and standalone
// messages are then ordered by their latest message's timestamp, so a
// bundle moves to the bottom of the feed the moment a new reply lands in it.
export function groupChatFeed(items: ChatFeedItem[], opts: { groupTalks: boolean } = { groupTalks: false }): ChatFeedGroup[] {
  const questionGroups = new Map<number, ChatFeedGroup & { kind: 'question' }>();
  const talkGroups = new Map<string, ChatFeedGroup & { kind: 'talk' }>();
  const groups: ChatFeedGroup[] = [];

  for (const item of items) {
    if (item.source === 'question' || item.source === 'question_new') {
      const questionId = item.question_id!;
      let group = questionGroups.get(questionId);
      if (!group) {
        group = {
          kind: 'question',
          questionId,
          questionTitle: item.question_title ?? '',
          talkId: item.talk_id,
          talkTitle: item.talk_title,
          items: [],
          latest: item.created_at,
        };
        questionGroups.set(questionId, group);
        groups.push(group);
      }
      group.items.push(item);
      group.latest = Math.max(group.latest, item.created_at);
      if (item.source === 'question_new') {
        group.questionTitle = item.question_title ?? group.questionTitle;
        group.askedAt = item.created_at;
      }
      continue;
    }

    if (item.source === 'talk' && opts.groupTalks) {
      const talkId = item.talk_id!;
      let group = talkGroups.get(talkId);
      if (!group) {
        group = { kind: 'talk', talkId, talkTitle: item.talk_title ?? talkId, items: [], latest: item.created_at };
        talkGroups.set(talkId, group);
        groups.push(group);
      }
      group.items.push(item);
      group.latest = Math.max(group.latest, item.created_at);
      continue;
    }

    groups.push({ kind: 'message', item, latest: item.created_at });
  }

  for (const group of groups) {
    if (group.kind !== 'message') group.items.sort((a, b) => a.created_at - b.created_at);
  }

  return groups.sort((a, b) => a.latest - b.latest);
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
