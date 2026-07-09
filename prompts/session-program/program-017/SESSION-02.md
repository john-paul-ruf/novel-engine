# SESSION-02 — Codex Unknown-Event Diagnostics

> **Program:** Novel Engine  
> **Feature:** codex-file-only-completion  
> **Modules:** `M06` codex-cli  
> **Depends on:** SESSION-01  
> **Estimated effort:** 25 minutes

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M06` | codex-cli | `./src/infrastructure/codex-cli/CodexCliClient.ts` | Owns Codex JSON parsing, event summaries, and error diagnostics. |
| `M08` | application | `./src/application/StreamManager.ts` | Read-only context for how error events are surfaced. |

## Context

The screenshot's diagnostic tail is:

```text
eventTail=unknown > unknown > unknown > unknown > unknown > unknown > unknown > unknown > unknown
```

That means future parser misses are not actionable. When Codex emits JSON with fields the app does not recognize, diagnostics should include enough bounded shape information to update the parser without dumping huge JSON payloads into chat.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `./src/infrastructure/codex-cli/CodexCliClient.ts` | Modify | Improve JSON event summaries and add bounded raw/shape diagnostics for unknown events. |
| `./docs/architecture/INFRASTRUCTURE.md` | Modify | Document Codex unknown-event diagnostics. |
| `./CHANGELOG.md` | Modify | Append mandatory session entry. |

## Implementation

### 1. Read before modify

1. Read `./src/infrastructure/codex-cli/CodexCliClient.ts` helper methods: `summarizeCodexEvent()`, `buildCodexExitMessage()`, `extractToolInfo()`, `extractText()`, `extractUsage()`, and `extractStatus()`.
2. Read `./docs/architecture/INFRASTRUCTURE.md` Codex section.
3. Read latest `./CHANGELOG.md`. Do not edit previous entries.

### 2. Make event summaries useful when `type` is missing

Update `summarizeCodexEvent()` so it never returns bare `unknown` when a JSON object has keys.

Recommended behavior:

1. Prefer current behavior when `event.type` and `event.item` are present.
2. Also check common nested locations:
   - `event.msg.type`
   - `event.event.type`
   - `event.data.type`
   - nested `item` under those records
3. If no type exists, return a compact shape summary:

```typescript
const keys = Object.keys(event).slice(0, 6).join(',');
return keys ? `unknown{${keys}}` : 'unknown{}';
```

4. If an item-like record exists but its type is missing, include item keys:

```typescript
return `unknown{${keys}}:item{${itemKeys}}`;
```

Keep summaries short enough for `eventTail`.

### 3. Add bounded raw JSON tail for unknown events

In `sendMessage()`, near `parsedJsonEventTail`, track a second tail:

```typescript
let unknownJsonEventTail: string[] = [];
```

When `processOutputLine()` returns a parsed JSON result whose `eventSummary` starts with `unknown`, append a bounded stringified shape/raw snippet. Avoid huge dumps:

```typescript
unknownJsonEventTail = [...unknownJsonEventTail, result.rawJsonSnippet].filter(Boolean).slice(-5);
```

Extend `CodexLineResult` with:

```typescript
rawJsonSnippet?: string;
```

In `processOutputLine()`, after parsing:

```typescript
const rawJsonSnippet = eventSummary.startsWith('unknown')
  ? this.safeJsonSnippet(parsed)
  : undefined;
```

Add helper:

```typescript
private safeJsonSnippet(value: Record<string, unknown>, maxChars = 500): string {
  try {
    const json = JSON.stringify(value);
    return json.length > maxChars ? `${json.slice(0, maxChars)}…` : json;
  } catch {
    return '';
  }
}
```

### 4. Include unknown JSON tail in exit diagnostics

Extend `buildCodexExitMessage()` params with:

```typescript
unknownJsonEventTail: string[];
```

When non-empty, append:

```typescript
parts.push(`unknownJsonTail=${params.unknownJsonEventTail.join(' | ')}`);
```

Update every call to `buildCodexExitMessage()` to pass `unknownJsonEventTail`.

### 5. Add nested event extraction helper only if it simplifies code

If multiple helpers need nested records, add:

```typescript
private getNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = record[key];
  return this.isRecord(value) ? value : null;
}
```

Do not broaden parser behavior so much that it treats status logs as assistant text. Diagnostics are the priority in this session.

### 6. Update docs and changelog

- `./docs/architecture/INFRASTRUCTURE.md` — mention `eventTail` shape summaries and `unknownJsonTail` bounded raw snippets.
- `./CHANGELOG.md` — append today's entry with architecture impact and migration notes.

## Verification

Run:

```bash
npx tsc --noEmit
npm run lint
```

Optional local parser smoke:

1. Temporarily create a tiny local snippet or use a debugger to call the summary helper against objects like:

```json
{"msg":{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"chapters/01/draft.md"}]}}}
```

2. Confirm the summary is not `unknown`.
3. Confirm unknown objects summarize as `unknown{key1,key2}` and errors include `unknownJsonTail=`.

## State Update

Update `./prompts/session-program/program-017/STATE.md`:

- Set SESSION-02 to `done` with date `2026-07-08` if verification passes.
- Add handoff notes with exact diagnostic fields added and smoke-test outcome.
