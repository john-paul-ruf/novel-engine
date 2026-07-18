import type {
  Conversation,
  FileVersion,
  Message,
  PersistedStreamEvent,
  StreamSessionRecord,
  UsageRecord,
} from '@domain/types';
import { DatabaseService } from '@infra/database/DatabaseService';

/** Fresh, isolated in-memory database. Call `db.close()` in afterEach. */
export function makeDb(): DatabaseService {
  return new DatabaseService(':memory:');
}

let seq = 0;

type ConversationInput = Omit<Conversation, 'createdAt' | 'updatedAt'>;

/** Insert a conversation with sensible defaults; override any field. */
export function makeConversation(
  db: DatabaseService,
  overrides: Partial<ConversationInput> = {}
): Conversation {
  seq += 1;
  return db.createConversation({
    id: `conv-${seq}`,
    bookSlug: 'test-book',
    agentName: 'Spark',
    pipelinePhase: 'pitch',
    purpose: 'pipeline',
    title: '',
    ...overrides,
  });
}

type MessageInput = Omit<Message, 'id' | 'timestamp' | 'conversationId'>;

/** Save a message with sensible defaults; override any field. */
export function makeMessage(
  db: DatabaseService,
  conversationId: string,
  overrides: Partial<MessageInput> = {}
): Message {
  return db.saveMessage({
    conversationId,
    role: 'user',
    content: 'hello',
    thinking: '',
    ...overrides,
  });
}

type UsageInput = Omit<UsageRecord, 'timestamp' | 'conversationId'>;

/** Record token usage against a conversation; override any field. */
export function makeUsage(
  db: DatabaseService,
  conversationId: string,
  overrides: Partial<UsageInput> = {}
): void {
  db.recordUsage({
    conversationId,
    inputTokens: 100,
    outputTokens: 50,
    thinkingTokens: 10,
    model: 'test-model',
    ...overrides,
  });
}

/** Create a stream session record (active by default); override any field. */
export function makeStreamSession(
  db: DatabaseService,
  overrides: Partial<StreamSessionRecord> = {}
): StreamSessionRecord {
  seq += 1;
  const session: StreamSessionRecord = {
    id: `session-${seq}`,
    conversationId: `conv-${seq}`,
    agentName: 'Verity',
    model: 'test-model',
    bookSlug: 'test-book',
    startedAt: '2026-01-01 00:00:00',
    endedAt: null,
    finalStage: 'idle',
    filesTouched: {},
    interrupted: false,
    ...overrides,
  };
  db.createStreamSession(session);
  return session;
}

type StreamEventInput = Omit<PersistedStreamEvent, 'id' | 'sessionId'>;

/** Persist a stream event for a session; override any field. */
export function makeStreamEvent(
  db: DatabaseService,
  sessionId: string,
  sequenceNumber: number,
  overrides: Partial<StreamEventInput> = {}
): void {
  db.persistStreamEvent({
    sessionId,
    conversationId: 'conv-x',
    sequenceNumber,
    eventType: 'text',
    payload: '{"type":"text"}',
    timestamp: '2026-01-01 00:00:00',
    ...overrides,
  });
}

type FileVersionInput = Parameters<DatabaseService['insertFileVersion']>[0];

/** Insert a file version snapshot; override any field. */
export function makeFileVersion(
  db: DatabaseService,
  overrides: Partial<FileVersionInput> = {}
): FileVersion {
  const content = overrides.content ?? 'file content';
  return db.insertFileVersion({
    bookSlug: 'test-book',
    filePath: 'source/pitch.md',
    content,
    contentHash: `hash-${content.length}`,
    byteSize: content.length,
    source: 'user',
    ...overrides,
  });
}
