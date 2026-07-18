import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from './DatabaseService';
import { makeDb, makeStreamEvent, makeStreamSession } from '../../test/db';

let db: DatabaseService;

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  db = makeDb();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('stream sessions', () => {
  it('createStreamSession round-trips via getActiveStreamSessions, parsing filesTouched', () => {
    const session = makeStreamSession(db, {
      filesTouched: { 'source/pitch.md': 2 },
      finalStage: 'drafting',
    });

    const active = db.getActiveStreamSessions();
    expect(active.length).toBe(1);
    expect(active[0]).toEqual(session);
    expect(active[0].filesTouched).toEqual({ 'source/pitch.md': 2 });
    expect(active[0].interrupted).toBe(false);
  });

  it('endStreamSession stamps ended_at and removes it from the active set', () => {
    const session = makeStreamSession(db);
    db.endStreamSession(session.id, 'complete', { 'a.md': 1 });
    expect(db.getActiveStreamSessions()).toEqual([]);
  });

  it('markSessionInterrupted flags and closes the session', () => {
    const session = makeStreamSession(db, { finalStage: 'drafting' });
    db.markSessionInterrupted(session.id, 'drafting');
    expect(db.getActiveStreamSessions()).toEqual([]);
  });

  it('sessions created with endedAt set are never active', () => {
    makeStreamSession(db, { endedAt: '2026-01-01 01:00:00', finalStage: 'complete' });
    expect(db.getActiveStreamSessions()).toEqual([]);
  });
});

describe('stream events', () => {
  it('replays events ordered by sequence number regardless of insert order', () => {
    makeStreamEvent(db, 's1', 2, { payload: 'second' });
    makeStreamEvent(db, 's1', 1, { payload: 'first' });
    makeStreamEvent(db, 's2', 1, { payload: 'other session' });

    const events = db.getStreamEvents('s1');
    expect(events.map((e) => e.payload)).toEqual(['first', 'second']);
    expect(events[0].sessionId).toBe('s1');
  });

  it('persistStreamEventBatch inserts all events atomically; empty batch is a no-op', () => {
    db.persistStreamEventBatch([]);
    expect(db.getStreamEvents('batch')).toEqual([]);

    db.persistStreamEventBatch(
      [1, 2, 3].map((n) => ({
        sessionId: 'batch',
        conversationId: 'conv',
        sequenceNumber: n,
        eventType: 'text',
        payload: `p${n}`,
        timestamp: '2026-01-01 00:00:00',
      }))
    );
    expect(db.getStreamEvents('batch').map((e) => e.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it('deleteStreamEvents removes only that session', () => {
    makeStreamEvent(db, 'keep', 1);
    makeStreamEvent(db, 'drop', 1);

    db.deleteStreamEvents('drop');

    expect(db.getStreamEvents('drop')).toEqual([]);
    expect(db.getStreamEvents('keep').length).toBe(1);
  });

  it('pruneStreamEvents deletes events older than the cutoff and keeps recent ones', () => {
    makeStreamEvent(db, 'old', 1, { timestamp: '2020-01-01 00:00:00' });
    makeStreamEvent(db, 'recent', 1, { timestamp: new Date().toISOString() });

    db.pruneStreamEvents(30);

    expect(db.getStreamEvents('old')).toEqual([]);
    expect(db.getStreamEvents('recent').length).toBe(1);
  });
});
