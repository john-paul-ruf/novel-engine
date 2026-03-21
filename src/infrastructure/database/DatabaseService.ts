import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { IDatabaseService } from '@domain/interfaces';
import type {
  Conversation,
  ConversationPurpose,
  AgentName,
  PipelinePhaseId,
  Message,
  MessageRole,
  UsageRecord,
  UsageSummary,
} from '@domain/types';
import { initializeSchema } from './schema';

export class DatabaseService implements IDatabaseService {
  private db: Database.Database;

  // Prepared statements — initialized once in the constructor
  private stmtInsertConversation: Database.Statement;
  private stmtGetConversation: Database.Statement;
  private stmtListConversations: Database.Statement;
  private stmtDeleteConversation: Database.Statement;
  private stmtInsertMessage: Database.Statement;
  private stmtGetMessages: Database.Statement;
  private stmtUpdateConversationTimestamp: Database.Statement;
  private stmtUpdateConversationTitle: Database.Statement;
  private stmtCountMessages: Database.Statement;
  private stmtInsertUsage: Database.Statement;
  private stmtGetUsageSummaryAll: Database.Statement;
  private stmtGetUsageSummaryByBook: Database.Statement;
  private stmtGetUsageByConversation: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    initializeSchema(this.db);

    this.stmtInsertConversation = this.db.prepare(`
      INSERT INTO conversations (id, book_slug, agent_name, pipeline_phase, purpose, title, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    this.stmtGetConversation = this.db.prepare(`
      SELECT id, book_slug, agent_name, pipeline_phase, purpose, title, created_at, updated_at
      FROM conversations WHERE id = ?
    `);

    this.stmtListConversations = this.db.prepare(`
      SELECT id, book_slug, agent_name, pipeline_phase, purpose, title, created_at, updated_at
      FROM conversations WHERE book_slug = ? ORDER BY updated_at DESC
    `);

    this.stmtDeleteConversation = this.db.prepare(`
      DELETE FROM conversations WHERE id = ?
    `);

    this.stmtInsertMessage = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, thinking, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetMessages = this.db.prepare(`
      SELECT id, conversation_id, role, content, thinking, timestamp
      FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC
    `);

    this.stmtUpdateConversationTimestamp = this.db.prepare(`
      UPDATE conversations SET updated_at = datetime('now') WHERE id = ?
    `);

    this.stmtUpdateConversationTitle = this.db.prepare(`
      UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?
    `);

    this.stmtCountMessages = this.db.prepare(`
      SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND role = 'user'
    `);

    this.stmtInsertUsage = this.db.prepare(`
      INSERT INTO token_usage (conversation_id, input_tokens, output_tokens, thinking_tokens, model, estimated_cost, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetUsageSummaryAll = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0)    AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)   AS total_output_tokens,
        COALESCE(SUM(thinking_tokens), 0) AS total_thinking_tokens,
        COALESCE(SUM(estimated_cost), 0)  AS total_cost,
        COUNT(DISTINCT conversation_id)    AS conversation_count
      FROM token_usage
    `);

    this.stmtGetUsageSummaryByBook = this.db.prepare(`
      SELECT
        COALESCE(SUM(tu.input_tokens), 0)    AS total_input_tokens,
        COALESCE(SUM(tu.output_tokens), 0)   AS total_output_tokens,
        COALESCE(SUM(tu.thinking_tokens), 0) AS total_thinking_tokens,
        COALESCE(SUM(tu.estimated_cost), 0)  AS total_cost,
        COUNT(DISTINCT tu.conversation_id)    AS conversation_count
      FROM token_usage tu
      JOIN conversations c ON c.id = tu.conversation_id
      WHERE c.book_slug = ?
    `);

    this.stmtGetUsageByConversation = this.db.prepare(`
      SELECT conversation_id, input_tokens, output_tokens, thinking_tokens, model, estimated_cost, timestamp
      FROM token_usage WHERE conversation_id = ? ORDER BY timestamp ASC
    `);
  }

  // === Conversations ===

  createConversation(conv: Omit<Conversation, 'createdAt' | 'updatedAt'>): Conversation {
    this.stmtInsertConversation.run(
      conv.id,
      conv.bookSlug,
      conv.agentName,
      conv.pipelinePhase,
      conv.purpose,
      conv.title,
    );

    const row = this.stmtGetConversation.get(conv.id) as ConversationRow;
    return mapConversationRow(row);
  }

  getConversation(id: string): Conversation | null {
    const row = this.stmtGetConversation.get(id) as ConversationRow | undefined;
    return row ? mapConversationRow(row) : null;
  }

  listConversations(bookSlug: string): Conversation[] {
    const rows = this.stmtListConversations.all(bookSlug) as ConversationRow[];
    return rows.map(mapConversationRow);
  }

  deleteConversation(id: string): void {
    this.stmtDeleteConversation.run(id);
  }

  // === Messages ===

  saveMessage(msg: Omit<Message, 'id' | 'timestamp'>): Message {
    const id = nanoid();

    this.stmtInsertMessage.run(
      id,
      msg.conversationId,
      msg.role,
      msg.content,
      msg.thinking,
    );

    // Update parent conversation's updated_at
    this.stmtUpdateConversationTimestamp.run(msg.conversationId);

    // If this is the first user message, set the conversation title
    if (msg.role === 'user') {
      const countRow = this.stmtCountMessages.get(msg.conversationId) as { count: number };
      if (countRow.count === 1) {
        const title = msg.content.slice(0, 80);
        this.stmtUpdateConversationTitle.run(title, msg.conversationId);
      }
    }

    const row = this.db.prepare(
      'SELECT id, conversation_id, role, content, thinking, timestamp FROM messages WHERE id = ?',
    ).get(id) as MessageRow;

    return mapMessageRow(row);
  }

  getMessages(conversationId: string): Message[] {
    const rows = this.stmtGetMessages.all(conversationId) as MessageRow[];
    return rows.map(mapMessageRow);
  }

  // === Usage ===

  recordUsage(record: Omit<UsageRecord, 'timestamp'>): void {
    this.stmtInsertUsage.run(
      record.conversationId,
      record.inputTokens,
      record.outputTokens,
      record.thinkingTokens,
      record.model,
      record.estimatedCost,
    );
  }

  getUsageSummary(bookSlug?: string): UsageSummary {
    const row = bookSlug
      ? (this.stmtGetUsageSummaryByBook.get(bookSlug) as UsageSummaryRow)
      : (this.stmtGetUsageSummaryAll.get() as UsageSummaryRow);

    return {
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalThinkingTokens: row.total_thinking_tokens,
      totalCost: row.total_cost,
      conversationCount: row.conversation_count,
    };
  }

  getUsageByConversation(conversationId: string): UsageRecord[] {
    const rows = this.stmtGetUsageByConversation.all(conversationId) as UsageRow[];
    return rows.map(mapUsageRow);
  }

  // === Book slug migration ===

  updateBookSlug(oldSlug: string, newSlug: string): void {
    this.db.prepare('UPDATE conversations SET book_slug = ? WHERE book_slug = ?').run(newSlug, oldSlug);
  }

  // === Lifecycle ===

  close(): void {
    this.db.close();
  }
}

// === Row types (snake_case from SQLite) ===

type ConversationRow = {
  id: string;
  book_slug: string;
  agent_name: string;
  pipeline_phase: string | null;
  purpose: string;
  title: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  thinking: string;
  timestamp: string;
};

type UsageSummaryRow = {
  total_input_tokens: number;
  total_output_tokens: number;
  total_thinking_tokens: number;
  total_cost: number;
  conversation_count: number;
};

type UsageRow = {
  conversation_id: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  model: string;
  estimated_cost: number;
  timestamp: string;
};

// === Row mappers (snake_case → camelCase) ===

function mapConversationRow(row: ConversationRow): Conversation {
  return {
    id: row.id,
    bookSlug: row.book_slug,
    agentName: row.agent_name as AgentName,
    pipelinePhase: row.pipeline_phase as PipelinePhaseId | null,
    purpose: row.purpose as ConversationPurpose,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as MessageRole,
    content: row.content,
    thinking: row.thinking,
    timestamp: row.timestamp,
  };
}

function mapUsageRow(row: UsageRow): UsageRecord {
  return {
    conversationId: row.conversation_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    thinkingTokens: row.thinking_tokens,
    model: row.model,
    estimatedCost: row.estimated_cost,
    timestamp: row.timestamp,
  };
}
