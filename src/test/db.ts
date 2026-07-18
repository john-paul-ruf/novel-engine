import type { Conversation, Message } from '@domain/types';
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
