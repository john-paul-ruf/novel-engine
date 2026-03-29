# SESSION-09 — About.json Rich Display in FilesView

> **Feature:** small-queue-intake
> **Layer(s):** M10 (renderer only)
> **Depends on:** SESSION-08 (done)
> **Estimated effort:** 25 min

---

## Context

When `about.json` is selected in the FilesView file browser, it currently renders as raw JSON text. The request: display the book metadata gracefully. Don't hard-code fields — render whatever is in the JSON. Make it pretty. Include a button to open a Spark chat for rebuilding/enriching the metadata.

Key point: Spark builds out `about.json` with whatever it determines is relevant — the display should handle any JSON object gracefully, not just the current `BookMeta` shape.

---

## Files to Read First

- `src/renderer/components/Files/FilesView.tsx` — full file, understand how files are rendered
- `src/renderer/components/Files/FilesHeader.tsx` — header with action buttons
- `src/renderer/stores/bookStore.ts` — activeSlug, getBookMeta
- `src/renderer/stores/chatStore.ts` — createConversation, setActiveConversation
- `src/renderer/stores/viewStore.ts` — navigate

---

## Implementation

### Step 1: Detect about.json in FilesView

In `FilesView.tsx`, detect when the currently viewed file path is exactly `about.json`. When it is, render `AboutJsonViewer` instead of the standard file reader.

The detection: `selectedFilePath === 'about.json'` (check what the path convention is in the existing code — it may be relative to book root).

### Step 2: Create AboutJsonViewer component

Create `src/renderer/components/Files/AboutJsonViewer.tsx`:

```tsx
export function AboutJsonViewer({
  bookSlug,
  onOpenSpark,
}: {
  bookSlug: string;
  onOpenSpark: () => void;
}): React.ReactElement
```

**Behavior:**
1. On mount, call `window.novelEngine.files.read(bookSlug, 'about.json')` to get the raw JSON string.
2. Parse it: `const data = JSON.parse(raw)`.
3. Render the parsed object as a pretty card.

**Rendering strategy — do not hard-code fields:**
- Iterate over the parsed object keys
- For each key, render a label (key formatted as `Title Case`) and a value
- Special-case rendering:
  - If key is `status`: render as a colored status badge (reuse `StatusBadge` pattern)
  - If key is `created`: render as a human-readable date
  - If key is `coverImage` and a path is present: render the cover thumbnail
  - All other values: render as text
- If the value is an object or array: render as a collapsed `<details>` block with the JSON inside

**Header actions:**
- Show a "Edit JSON" button that switches to raw editor mode (the standard file editor)
- Show a "Chat with Spark" button that calls `onOpenSpark`

**Chat with Spark action:**
- Creates a new Spark pipeline conversation for the active book
- Sends a pre-built prompt: "Read about.json and enrich the book metadata — add any additional fields that would be useful for tracking this project. Write the updated about.json back to disk."
- Navigates to the chat view

### Step 3: Wire into FilesView

In `FilesView.tsx`:
- Import `AboutJsonViewer`
- When the selected file is `about.json` AND a book is active AND the view mode is `reader` or `browser`: render `<AboutJsonViewer bookSlug={activeSlug} onOpenSpark={handleOpenSpark} />`
- Implement `handleOpenSpark`: use `chatStore.createConversation` + `navigate('chat')` with a pre-built Spark message

---

## Architecture Compliance

- [x] Renderer only — uses existing `window.novelEngine.files.read` and `window.novelEngine.chat.*` bridge methods
- [x] No new IPC channels
- [x] New file: `src/renderer/components/Files/AboutJsonViewer.tsx` (new component, scoped to Files/)
- [x] Generic JSON rendering — no hard-coded field list

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Selecting `about.json` in the FilesView file browser shows the rich card, not raw JSON
3. Card shows all keys from about.json with formatted labels and values
4. "Edit JSON" button switches to the raw text editor
5. "Chat with Spark" button opens a new Spark conversation with the pre-built metadata prompt

---

## State Update

Set SESSION-09 to `done` in STATE.md.
