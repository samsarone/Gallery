import type { VideoComment } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const valueAtPath = (source: unknown, path: string[]): unknown => {
  let current: unknown = source;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
};

const pickString = (source: unknown, paths: string[][]): string | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${value}`;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
  }

  return null;
};

const pickNumber = (source: unknown, paths: string[][]): number | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const sanitized = value.replace(/,/g, '');
      const parsed = Number.parseFloat(sanitized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const pickBoolean = (source: unknown, paths: string[][]): boolean | null => {
  for (const path of paths) {
    const value = valueAtPath(source, path);
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'yes', '1', 'y'].includes(normalized)) {
        return true;
      }
      if (['false', 'no', '0', 'n'].includes(normalized)) {
        return false;
      }
    }
    if (typeof value === 'number') {
      if (value === 1) {
        return true;
      }
      if (value === 0) {
        return false;
      }
    }
  }

  return null;
};

const pickStringFromSources = (
  sources: unknown[],
  paths: string[][]
): string | null => {
  for (const source of sources) {
    const result = pickString(source, paths);
    if (result) {
      return result;
    }
  }

  return null;
};

const pickBooleanFromSources = (
  sources: unknown[],
  paths: string[][]
): boolean | null => {
  for (const source of sources) {
    const result = pickBoolean(source, paths);
    if (result !== null) {
      return result;
    }
  }

  return null;
};

const expandCommentEntry = (entry: unknown): Record<string, unknown> | null => {
  if (!isRecord(entry)) {
    return null;
  }

  const merged: Record<string, unknown> = { ...entry };
  const nestedKeys = ['node', 'comment', 'value', 'payload', 'data'];

  nestedKeys.forEach((key) => {
    const nested = merged[key];
    if (isRecord(nested)) {
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        const hasOwn = Object.prototype.hasOwnProperty.call(merged, nestedKey);
        const existing = merged[nestedKey];
        const shouldOverride =
          !hasOwn ||
          existing === undefined ||
          existing === null ||
          (typeof existing === 'string' &&
            existing.trim().length === 0 &&
            typeof nestedValue === 'string' &&
            nestedValue.trim().length > 0);

        if (shouldOverride) {
          merged[nestedKey] = nestedValue;
        }
      }
    }
  });

  return merged;
};

const COMMENT_COLLECTION_KEYS: readonly string[] = [
  'items',
  'comments',
  'data',
  'results',
  'records',
  'collection',
  'list',
  'edges',
  'nodes',
  'docs',
  'entries',
  'values',
  'payload',
  'response',
  'children',
  'elements',
  'rows'
];

const MAX_COLLECTION_DEPTH = 4;

const findFirstArray = (value: unknown, depth = 0): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value) || depth >= MAX_COLLECTION_DEPTH) {
    return [];
  }

  for (const key of COMMENT_COLLECTION_KEYS) {
    const candidate = value[key];
    const result = findFirstArray(candidate, depth + 1);
    if (result.length > 0) {
      return result;
    }
  }

  for (const [key, candidate] of Object.entries(value)) {
    if (COMMENT_COLLECTION_KEYS.includes(key)) {
      continue;
    }

    const result = findFirstArray(candidate, depth + 1);
    if (result.length > 0) {
      return result;
    }
  }

  return [];
};

const gatherMetadataSources = (value: unknown): Record<string, unknown>[] => {
  const sources: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  const queue: unknown[] = [];

  if (isRecord(value)) {
    queue.push(value);
    seen.add(value);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isRecord(current)) {
      continue;
    }

    sources.push(current);

    const nestedKeys = [
      'comments',
      'data',
      'results',
      'collection',
      'records',
      'list',
      'pagination',
      'pageInfo',
      'page_info',
      'meta',
      'metadata',
      'info',
      'links'
    ];

    for (const key of nestedKeys) {
      const nested = current[key];
      if (nested && isRecord(nested) && !seen.has(nested)) {
        seen.add(nested);
        queue.push(nested);
      }
    }
  }

  return sources;
};

export const normalizeComment = (payload: unknown): VideoComment | null => {
  const record =
    expandCommentEntry(payload) ??
    (isRecord(payload) ? (payload as Record<string, unknown>) : null);

  if (!record) {
    return null;
  }

  const id =
    pickString(record, [
      ['id'],
      ['_id'],
      ['commentId'],
      ['comment_id'],
      ['commentID'],
      ['uuid'],
      ['uid'],
      ['externalId'],
      ['external_id'],
      ['nodeId'],
      ['comment', 'id'],
      ['comment', '_id'],
      ['node', 'id'],
      ['node', '_id'],
      ['value', 'id'],
      ['value', '_id']
    ]) ?? '';

  const rawTextSource =
    pickString(record, [
      ['text'],
      ['body'],
      ['content'],
      ['message'],
      ['comment'],
      ['value'],
      ['bodyHtml'],
      ['body_html'],
      ['textHtml'],
      ['text_html'],
      ['rendered', 'text'],
      ['rendered', 'body'],
      ['commentText'],
      ['comment_text'],
      ['bodyText'],
      ['body_text'],
      ['textContent'],
      ['text_content'],
      ['payload', 'text'],
      ['payload', 'content'],
      ['payload', 'body'],
      ['node', 'text'],
      ['node', 'body'],
      ['node', 'content'],
      ['node', 'message'],
      ['comment', 'text'],
      ['comment', 'body'],
      ['comment', 'content'],
      ['comment', 'message'],
      ['data', 'text'],
      ['data', 'content'],
      ['attributes', 'text'],
      ['attributes', 'content'],
      ['attributes', 'body'],
      ['meta', 'text'],
      ['meta', 'body'],
      ['meta', 'text']
    ]) ?? '';

  let text = rawTextSource.trim();
  if (text.includes('<') && text.includes('>')) {
    text = text.replace(/<[^>]*>/g, '').trim();
  }
  if (!id || !text) {
    return null;
  }

  const creatorHandle =
    pickString(record, [
      ['creatorHandle'],
      ['creator_handle'],
      ['creator', 'handle'],
      ['creator', 'username'],
      ['creator', 'name'],
      ['user', 'handle'],
      ['user', 'username'],
      ['user', 'name'],
      ['author', 'handle'],
      ['author', 'username'],
      ['author', 'name'],
      ['owner', 'handle'],
      ['owner', 'username'],
      ['owner', 'name'],
      ['profile', 'handle'],
      ['profile', 'username'],
      ['profile', 'name'],
      ['createdBy', 'handle'],
      ['createdBy', 'username'],
      ['created_by', 'handle'],
      ['created_by', 'username'],
      ['account', 'handle'],
      ['account', 'username'],
      ['account', 'name'],
      ['attributes', 'author'],
      ['attributes', 'username']
    ]) ?? 'User';

  const createdBy =
    pickString(record, [
      ['createdBy'],
      ['created_by'],
      ['createdById'],
      ['creatorId'],
      ['creator_id'],
      ['userId'],
      ['user_id'],
      ['authorId'],
      ['author_id'],
      ['ownerId'],
      ['owner_id'],
      ['profile', 'id'],
      ['creator', 'id'],
      ['creator', '_id'],
      ['user', 'id'],
      ['user', '_id'],
      ['author', 'id'],
      ['author', '_id'],
      ['comment', 'createdBy'],
      ['comment', 'created_by']
    ]) ?? '';

  const createdAtCandidate =
    pickString(record, [
      ['createdAt'],
      ['created_at'],
      ['created'],
      ['createdOn'],
      ['created_on'],
      ['timestamp'],
      ['publishedAt'],
      ['published_at'],
      ['insertedAt'],
      ['inserted_at'],
      ['dateCreated'],
      ['date_created'],
      ['node', 'createdAt'],
      ['node', 'created_at'],
      ['comment', 'createdAt'],
      ['comment', 'created_at'],
      ['meta', 'createdAt'],
      ['meta', 'created_at']
    ]) ?? null;

  let createdAt = new Date().toISOString();
  if (createdAtCandidate) {
    const numericValue = Number(createdAtCandidate);
    if (!Number.isNaN(numericValue) && Number.isFinite(numericValue)) {
      createdAt = new Date(numericValue).toISOString();
    } else if (!Number.isNaN(Date.parse(createdAtCandidate))) {
      createdAt = new Date(createdAtCandidate).toISOString();
    }
  }

  const likesValue =
    pickNumber(record, [
      ['likes'],
      ['likesCount'],
      ['likes_count'],
      ['likesTotal'],
      ['likes', 'count'],
      ['likes', 'total'],
      ['stats', 'likes'],
      ['metrics', 'likes'],
      ['interactions', 'likes'],
      ['engagement', 'likes'],
      ['node', 'likes'],
      ['comment', 'likes'],
      ['comment', 'likesCount'],
      ['meta', 'likes']
    ]) ?? 0;

  const isBotUser =
    pickBoolean(record, [
      ['isBotUser'],
      ['isBot'],
      ['bot'],
      ['creator', 'isBot'],
      ['creator', 'isBotUser'],
      ['user', 'isBot'],
      ['user', 'isBotUser'],
      ['author', 'isBot'],
      ['author', 'isBotUser'],
      ['comment', 'isBot'],
      ['comment', 'isBotUser']
    ]) ?? false;

  return {
    id,
    text,
    creatorHandle,
    createdBy,
    createdAt,
    likes: Math.max(0, Math.round(likesValue)),
    isBotUser
  };
};

export interface ParsedCommentsPayload {
  items: VideoComment[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const parseCommentsPayload = (
  payload: unknown
): ParsedCommentsPayload => {
  let rawItems = findFirstArray(payload);

  if (rawItems.length === 0 && Array.isArray(payload)) {
    rawItems = payload;
  }

  if (rawItems.length === 0 && isRecord(payload)) {
    const direct = normalizeComment(payload);
    if (direct) {
      rawItems = [payload];
    }
  }

  const normalizedItems = rawItems
    .map((item) => expandCommentEntry(item) ?? item)
    .map((item) => normalizeComment(item))
    .filter((item): item is VideoComment => Boolean(item));

  const metadataSources = gatherMetadataSources(payload);

  const nextCursor =
    pickStringFromSources(metadataSources, [
      ['nextCursor'],
      ['next', 'cursor'],
      ['cursor'],
      ['pagination', 'nextCursor'],
      ['pagination', 'cursor'],
      ['pagination', 'next'],
      ['pagination', 'nextToken'],
      ['pagination', 'next_token'],
      ['pageInfo', 'endCursor'],
      ['pageInfo', 'end_cursor'],
      ['meta', 'nextCursor'],
      ['meta', 'next_cursor'],
      ['meta', 'nextToken'],
      ['meta', 'next_token'],
      ['comments', 'nextCursor'],
      ['comments', 'cursor'],
      ['comments', 'next', 'cursor'],
      ['comments', 'pagination', 'nextCursor'],
      ['data', 'nextCursor'],
      ['data', 'cursor'],
      ['data', 'pagination', 'nextCursor']
    ]) ?? null;

  const hasMoreFlag =
    pickBooleanFromSources(metadataSources, [
      ['hasMore'],
      ['has_more'],
      ['hasNext'],
      ['hasNextPage'],
      ['pagination', 'hasMore'],
      ['pagination', 'has_more'],
      ['pagination', 'hasNext'],
      ['pagination', 'hasNextPage'],
      ['pageInfo', 'hasNextPage'],
      ['pageInfo', 'has_next_page'],
      ['meta', 'hasMore'],
      ['meta', 'has_more'],
      ['meta', 'hasNext'],
      ['comments', 'hasMore'],
      ['comments', 'has_more'],
      ['data', 'hasMore'],
      ['data', 'has_more']
    ]);

  return {
    items: normalizedItems,
    nextCursor,
    hasMore: hasMoreFlag ?? Boolean(nextCursor)
  };
};
