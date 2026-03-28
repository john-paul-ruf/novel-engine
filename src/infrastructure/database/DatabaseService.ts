import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type { IDatabaseService } from '@domain/interfaces';
import type {
  Conversation,
  ConversationPurpose,
  AgentName,
  FileTouchMap,
  FileVersion,
  FileVersionSource,
  FileVersionSummary,
  PipelinePhaseId,
  PersistedStreamEvent,
  ProgressStage,
  Message,
  MessageRole,
  StreamSessionRecord,
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

  // Stream events
  private stmtInsertStreamEvent: Database.Statement;
  private stmtGetStreamEvents: Database.Statement;
  private stmtDeleteStreamEvents: Database.Statement;

  // Stream sessions
  private stmtInsertStreamSession: Database.Statement;
  private stmtEndStreamSession: Database.Statement;
  private stmtGetActiveStreamSessions: Database.Statement;
  private stmtMarkSessionInterrupted: Database.Statement;

  // File versions
  private stmtInsertFileVersion: Database.Statement;
  private stmtGetFileVersion: Database.Statement;
  private stmtGetLatestFileVersion: Database.Statement;
  private stmtListFileVersions: Database.Statement;
  private stmtCountFileVersions: Database.Statement;
  private stmtGetVersionedFilePaths: Database.Statement;

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
      INSERT INTO token_usage (conversation_id, input_tokens, output_tokens, thinking_tokens, model, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetUsageSummaryAll = this.db.prepare(`
      SELECT
        COALESCE(SUM(input_tokens), 0)    AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0)   AS total_output_tokens,
        COALESCE(SUM(thinking_tokens), 0) AS total_thinking_tokens,
        COUNT(DISTINCT conversation_id)    AS conversation_count
      FROM token_usage
    `);

    this.stmtGetUsageSummaryByBook = this.db.prepare(`
      SELECT
        COALESCE(SUM(tu.input_tokens), 0)    AS total_input_tokens,
        COALESCE(SUM(tu.output_tokens), 0)   AS total_output_tokens,
        COALESCE(SUM(tu.thinking_tokens), 0) AS total_thinking_tokens,
        COUNT(DISTINCT tu.conversation_id)    AS conversation_count
      FROM token_usage tu
      JOIN conversations c ON c.id = tu.conversation_id
      WHERE c.book_slug = ?
    `);

    this.stmtGetUsageByConversation = this.db.prepare(`
      SELECT conversation_id, input_tokens, output_tokens, thinking_tokens, model, timestamp
      FROM token_usage WHERE conversation_id = ? ORDER BY timestamp ASC
    `);

    // Stream events
    this.stmtInsertStreamEvent = this.db.prepare(`
      INSERT INTO stream_events (session_id, conversation_id, sequence_number, event_type, payload, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetStreamEvents = this.db.prepare(`
      SELECT id, session_id, conversation_id, sequence_number, event_type, payload, timestamp
      FROM stream_events WHERE session_id = ? ORDER BY sequence_number ASC
    `);

    this.stmtDeleteStreamEvents = this.db.prepare(`
      DELETE FROM stream_events WHERE session_id = ?
    `);

    // Stream sessions
    this.stmtInsertStreamSession = this.db.prepare(`
      INSERT INTO stream_sessions (id, conversation_id, agent_name, model, book_slug, started_at, ended_at, final_stage, files_touched, interrupted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtEndStreamSession = this.db.prepare(`
      UPDATE stream_sessions SET ended_at = datetime('now'), final_stage = ?, files_touched = ? WHERE id = ?
    `);

    this.stmtGetActiveStreamSessions = this.db.prepare(`
      SELECT id, conversation_id, agent_name, model, book_slug, started_at, ended_at, final_stage, files_touched, interrupted
      FROM stream_sessions WHERE ended_at IS NULL
    `);

    this.stmtMarkSessionInterrupted = this.db.prepare(`
      UPDATE stream_sessions SET interrupted = 1, final_stage = ?, ended_at = datetime('now') WHERE id = ?
    `);

    // File versions
    this.stmtInsertFileVersion = this.db.prepare(`
      INSERT INTO file_versions (book_slug, file_path, content, content_hash, byte_size, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetFileVersion = this.db.prepare(`
      SELECT id, book_slug, file_path, content, content_hash, byte_size, source, created_at
      FROM file_versions WHERE id = ?
    `);

    this.stmtGetLatestFileVersion = this.db.prepare(`
      SELECT id, book_slug, file_path, content_hash, byte_size, source, created_at
      FROM file_versions
      WHERE book_slug = ? AND file_path = ?
      ORDER BY id DESC LIMIT 1
    `);

    this.stmtListFileVersions = this.db.prepare(`
      SELECT id, book_slug, file_path, content_hash, byte_size, source, created_at
      FROM file_versions
      WHERE book_slug = ? AND file_path = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `);

    this.stmtCountFileVersions = this.db.prepare(`
      SELECT COUNT(*) AS count FROM file_versions
      WHERE book_slug = ? AND file_path = ?
    `);

    this.stmtGetVersionedFilePaths = this.db.prepare(`
      SELECT DISTINCT file_path FROM file_versions
      WHERE book_slug = ?
      ORDER BY file_path
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

  // === Stream Events ===

  persistStreamEvent(event: Omit<PersistedStreamEvent, 'id'>): void {
    this.stmtInsertStreamEvent.run(
      event.sessionId,
      event.conversationId,
      event.sequenceNumber,
      event.eventType,
      event.payload,
      event.timestamp,
    );
  }

  persistStreamEventBatch(events: Omit<PersistedStreamEvent, 'id'>[]): void {
    if (events.length === 0) return;
    const insertMany = this.db.transaction((rows: Omit<PersistedStreamEvent, 'id'>[]) => {
      for (const row of rows) {
        this.stmtInsertStreamEvent.run(
          row.sessionId,
          row.conversationId,
          row.sequenceNumber,
          row.eventType,
          row.payload,
          row.timestamp,
        );
      }
    });
    insertMany(events);
  }

  getStreamEvents(sessionId: string): PersistedStreamEvent[] {
    const rows = this.stmtGetStreamEvents.all(sessionId) as StreamEventRow[];
    return rows.map(mapStreamEventRow);
  }

  deleteStreamEvents(sessionId: string): void {
    this.stmtDeleteStreamEvents.run(sessionId);
  }

  pruneStreamEvents(olderThanDays: number): void {
    this.db.prepare(
      `DELETE FROM stream_events WHERE timestamp < datetime('now', '-' || ? || ' days')`,
    ).run(olderThanDays);
  }

  // === Stream Sessions ===

  createStreamSession(session: StreamSessionRecord): void {
    this.stmtInsertStreamSession.run(
      session.id,
      session.conversationId,
      session.agentName,
      session.model,
      session.bookSlug,
      session.startedAt,
      session.endedAt,
      session.finalStage,
      JSON.stringify(session.filesTouched),
      session.interrupted ? 1 : 0,
    );
  }

  endStreamSession(sessionId: string, finalStage: ProgressStage, filesTouched: FileTouchMap): void {
    this.stmtEndStreamSession.run(finalStage, JSON.stringify(filesTouched), sessionId);
  }

  getActiveStreamSessions(): StreamSessionRecord[] {
    const rows = this.stmtGetActiveStreamSessions.all() as StreamSessionRow[];
    return rows.map(mapStreamSessionRow);
  }

  markSessionInterrupted(sessionId: string, lastStage: ProgressStage): void {
    this.stmtMarkSessionInterrupted.run(lastStage, sessionId);
  }

  // === File Versions ===

  insertFileVersion(params: {
    bookSlug: string;
    filePath: string;
    content: string;
    contentHash: string;
    byteSize: number;
    source: FileVersionSource;
  }): FileVersion {
    const info = this.stmtInsertFileVersion.run(
      params.bookSlug, params.filePath, params.content,
      params.contentHash, params.byteSize, params.source,
    );
    const id = Number(info.lastInsertRowid);
    const row = this.stmtGetFileVersion.get(id) as Record<string, unknown>;
    return this.mapFileVersion(row);
  }

  getFileVersion(id: number): FileVersion | null {
    const row = this.stmtGetFileVersion.get(id) as Record<string, unknown> | undefined;
    return row ? this.mapFileVersion(row) : null;
  }

  getLatestFileVersion(bookSlug: string, filePath: string): FileVersionSummary | null {
    const row = this.stmtGetLatestFileVersion.get(bookSlug, filePath) as Record<string, unknown> | undefined;
    return row ? this.mapFileVersionSummary(row) : null;
  }

  listFileVersions(bookSlug: string, filePath: string, limit: number, offset: number): FileVersionSummary[] {
    const rows = this.stmtListFileVersions.all(bookSlug, filePath, limit, offset) as Record<string, unknown>[];
    return rows.map((r) => this.mapFileVersionSummary(r));
  }

  countFileVersions(bookSlug: string, filePath: string): number {
    const row = this.stmtCountFileVersions.get(bookSlug, filePath) as { count: number };
    return row.count;
  }

  deleteFileVersionsBeyondLimit(bookSlug: string, filePath: string, keepCount: number): number {
    const stmt = this.db.prepare(`
      DELETE FROM file_versions
      WHERE book_slug = ? AND file_path = ? AND id NOT IN (
        SELECT id FROM file_versions
        WHERE book_slug = ? AND file_path = ?
        ORDER BY id DESC LIMIT ?
      )
    `);
    const info = stmt.run(bookSlug, filePath, bookSlug, filePath, keepCount);
    return info.changes;
  }

  getVersionedFilePaths(bookSlug: string): string[] {
    const rows = this.stmtGetVersionedFilePaths.all(bookSlug) as { file_path: string }[];
    return rows.map((r) => r.file_path);
  }

  private mapFileVersion(row: Record<string, unknown>): FileVersion {
    return {
      id: row.id as number,
      bookSlug: row.book_slug as string,
      filePath: row.file_path as string,
      content: row.content as string,
      contentHash: row.content_hash as string,
      byteSize: row.byte_size as number,
      source: row.source as FileVersionSource,
      createdAt: row.created_at as string,
    };
  }

  private mapFileVersionSummary(row: Record<string, unknown>): FileVersionSummary {
    return {
      id: row.id as number,
      bookSlug: row.book_slug as string,
      filePath: row.file_path as string,
      contentHash: row.content_hash as string,
      byteSize: row.byte_size as number,
      source: row.source as FileVersionSource,
      createdAt: row.created_at as string,
    };
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
  conversation_count: number;
};

type UsageRow = {
  conversation_id: string;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  model: string;
  timestamp: string;
};

type StreamEventRow = {
  id: number;
  session_id: string;
  conversation_id: string;
  sequence_number: number;
  event_type: string;
  payload: string;
  timestamp: string;
};

type StreamSessionRow = {
  id: string;
  conversation_id: string;
  agent_name: string;
  model: string;
  book_slug: string;
  started_at: string;
  ended_at: string | null;
  final_stage: string;
  files_touched: string;
  interrupted: number;
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
    timestamp: row.timestamp,
  };
}

function mapStreamEventRow(row: StreamEventRow): PersistedStreamEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    conversationId: row.conversation_id,
    sequenceNumber: row.sequence_number,
    eventType: row.event_type,
    payload: row.payload,
    timestamp: row.timestamp,
  };
}

function mapStreamSessionRow(row: StreamSessionRow): StreamSessionRecord {
  let filesTouched: FileTouchMap = {};
  try {
    filesTouched = JSON.parse(row.files_touched) as FileTouchMap;
  } catch {
    // Defensive — corrupted JSON defaults to empty map
  }

  return {
    id: row.id,
    conversationId: row.conversation_id,
    agentName: row.agent_name as AgentName,
    model: row.model,
    bookSlug: row.book_slug,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    finalStage: row.final_stage as ProgressStage,
    filesTouched,
    interrupted: row.interrupted === 1,
  };
}
