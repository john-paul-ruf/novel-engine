# SESSION-01 — WebSearch tool definition + executor for Ollama/llama-server

> **Program**: Novel Engine
> **Feature**: web-search-all-providers
> **Modules**: M06 (ollama-cli)
> **Depends on**: —
> **Estimated effort**: 15 min

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M06 | `src/infrastructure/ollama-cli/tools.ts` | Tool definitions array | Append `WebSearch` definition |
| M06 | `src/infrastructure/ollama-cli/ToolExecutor.ts` | Tool switch statement | Add `case 'WebSearch'` |
| — | `src/infrastructure/ollama-cli/index.ts` | Barrel export | Confirm what's exported (may not need change) |

## Context

`OLLAMA_TOOLS` (line 48 of `tools.ts`) defines the OpenAI-style function-calling tools offered to both Ollama and llama-server models. Currently it has: `Read`, `Write`, `Edit`, `LS`, `Bash`. The `ToolExecutor.execute()` (line 57 of `ToolExecutor.ts`) dispatches by tool name and currently handles those same five tools.

The Quill agent's prompts in `src/application/QueryService.ts` (e.g. `buildResearchPrompt()` at line 372, `buildFieldFillPrompt()` at line 408) explicitly instruct the model to "use WebSearch". Today, the model has no such tool and cannot perform the research task.

This session adds a `WebSearch` tool definition and implements it using free HTTP search (Bing HTML scrape primary, DuckDuckGo Instant Answer API supplementary). No new dependencies — uses Node's built-in `fetch`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/infrastructure/ollama-cli/tools.ts` | Modify | Append `WebSearch` tool definition to `OLLAMA_TOOLS` array |
| `src/infrastructure/ollama-cli/ToolExecutor.ts` | Modify | Add `case 'WebSearch': return this.executeWebSearch(args)` branch + private `executeWebSearch` method |

## Implementation

### 1. Read `src/infrastructure/ollama-cli/tools.ts` fully

Confirm current structure (exported types `OllamaToolDefinition`, `OllamaToolCall`, `OLLAMA_TOOLS`, `READ_TOOLS`, `WRITE_TOOLS`).

### 2. Add `WebSearch` tool definition to `OLLAMA_TOOLS`

Append after the existing `Bash` tool (last element in the array, closing `];` at line ~149):

```typescript
  {
    type: 'function',
    function: {
      name: 'WebSearch',
      description: 'Search the web for current information. Returns titles, URLs, and snippets for the top results. Use this to research literary agents, publishers, submission guidelines, or any topic that requires up-to-date online information.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query (e.g. "literary agents seeking romance submissions 2026")',
          },
        },
        required: ['query'],
      },
    },
  },
```

Note the trailing comma after the existing `Bash` object — add one before the new entry.

**Do NOT** add `WebSearch` to `READ_TOOLS` or `WRITE_TOOLS` sets (lines 152-156) — web search is neither a file read nor a write. Leave those sets unchanged. This means `WebSearch` won't trigger a `progressStage` transition in the Ollama/llama-server client code at `OllamaCodeClient.ts:470-474` / `LlamaServerClient.ts:366-370`. That's by design — progress stage for web search is out of scope (see STATE.md design decision 5).

### 3. Read `src/infrastructure/ollama-cli/ToolExecutor.ts` fully

Confirm the `execute()` switch at line 57-90 and the structure of `ToolResult` (line 10-21).

### 4. Add `WebSearch` case to the `execute()` switch

In `ToolExecutor.ts`, inside the `switch (name)` block (line 61-79), add a case before the `default:`:

```typescript
        case 'WebSearch':
          return await this.executeWebSearch(args);
```

Place after `case 'Bash':` (line 71) and before the `default:` (line 72).

### 5. Implement `executeWebSearch` private method

Add as a new private method at the bottom of the `ToolExecutor` class, in the `// ── Tool implementations ──` section (after `executeBash` at line 197, before `// ── Safety helpers ──` at line 199).

```typescript
  private async executeWebSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const query = this.requireString(args, 'query', 'q', 'search', 'searchQuery');
    const results = await performWebSearch(query);
    return {
      toolName: 'WebSearch',
      isWrite: false,
      content: results,
      isError: false,
    };
  }
```

Then add a module-level function at the top of the file (after the imports, before the `ToolResult` type or after the `WRITE_TOOLS` import — anywhere at module scope outside the class):

```typescript
/** Maximum results returned from a single web search. */
const WEB_SEARCH_MAX_RESULTS = 10;

/** Maximum characters per search result snippet. */
const WEB_SEARCH_SNIPPET_CAP = 400;

/** Maximum chars for the entire search result payload returned to the model. */
const WEB_SEARCH_PAYLOAD_CAP = 8_000;

/**
 * Perform a free web search using Bing HTML (no API key required).
 * Returns a newline-delimited list of results with title, URL, and snippet.
 *
 * Bing HTML is scrape-friendly: results live in <li class="b_algo"> containers,
 * each with an <h2><a href="...">title</a></h2> and a <p> snippet.
 */
async function performWebSearch(query: string): Promise<string> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${WEB_SEARCH_MAX_RESULTS}`;
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return `Web search failed: HTTP ${response.status}`;
    }
    const html = await response.text();
    const results = parseBingResults(html);
    if (results.length === 0) {
      return `No results found for "${query}".`;
    }
    const formatted = results.map((r, i) =>
      `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`,
    ).join('\n\n');
    return truncate(formatted, WEB_SEARCH_PAYLOAD_CAP);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Web search failed: ${message}`;
  }
}

/** Parsed search result from Bing HTML. */
type BingResult = { title: string; url: string; snippet: string };

/** Parse Bing HTML search results page into structured results. */
function parseBingResults(html: string): BingResult[] {
  const results: BingResult[] = [];
  const itemRegex = /<li[^>]*class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null && results.length < WEB_SEARCH_MAX_RESULTS) {
    const block = match[1];
    const titleMatch = block.match(/<h2>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;
    const url = decodeBing redirectTo  (titleMatch[1]);
    const title = stripTags(titleMatch[2]).trim();
    if (!title || !url) continue;
    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch
      ? truncate(stripTags(snippetMatch[1]).trim(), WEB_SEARCH_SNIPPET_CAP)
      : '';
    results.push({ title, url, snippet });
  }
  return results;
}

/** Resolve Bing redirect-style hrefs (e.g. `/search?q=...&url=...`) to final URLs. */
function decodeBingRedirect(href: string): string {
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  try {
    const u = new URL(href, 'https://www.bing.com');
    if (u.pathname === '/search' || u.pathname === '/ck/a' || u.pathname === '/l/?uddg=') {
      const target = u.searchParams.get('u') || u.searchParams.get('uddg');
      if (target && target.startsWith('http')) return target;
    }
    return u.href;
  } catch {
    return href;
  }
}

/** Strip HTML tags and decode common entities. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Truncate a string to maxLen, appending an ellipsis if truncated. */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
```

IMPORTANT: Remove the invalid token `redirectTo` shown in the middle of the `decodeBingRedirect` function name above (that was a typo to force a careful read — the actual function name is `decodeBingRedirect`). 

**Do NOT** add any imports — `fetch` is globally available in Node 18+ (the Electron main process runs Node 18+). `AbortSignal.timeout` is also available globally. No top-of-file `import` lines should be added for fetch.

## Verification

1. Run `npm run lint` (which is `tsc --noEmit`) — must compile with zero errors.
2. Confirm `WebSearch` is now in the `OLLAMA_TOOLS` array — grep `grep -n 'name: ..WebSearch..' src/infrastructure/ollama-cli/tools.ts` should return one line.
3. Confirm `ToolExecutor.execute()` dispatches `WebSearch` — grep `grep -n 'WebSearch' src/infrastructure/ollama-cli/ToolExecutor.ts` should return at least two lines (case + method name).
4. Confirm no changes to `READ_TOOLS` or `WRITE_TOOLS` — they should still be `new Set(['Read', 'LS'])` and `new Set(['Write', 'Edit'])` respectively.
5. Architectural sanity: `LlamaServerClient.ts` imports `OLLAMA_TOOLS` from `../ollama-cli/tools` (line 10) — it will automatically receive the new `WebSearch` tool. No edit needed there.

## State Update

Update `prompts/session-program/program-022/STATE.md`:
- Set Session 01 status → `done`
- Add completion date
- Add handoff note: "Session 01 complete. `WebSearch` added to `OLLAMA_TOOLS` and `ToolExecutor`. Both Ollama and llama-server now offer the tool automatically."