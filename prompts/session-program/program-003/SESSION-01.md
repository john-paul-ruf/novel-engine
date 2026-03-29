# SESSION-01 — FilesView Tab Restructure

> **Program:** Novel Engine
> **Feature:** sidebar-bookshelf-files-tabs
> **Depends on:** Nothing
> **Estimated effort:** 25 min

---

## Context

The FilesView currently has a 2-tab structure: **Files** and **Motif Ledger**. The "Files" tab shows a `StructuredBrowser` at root (which groups Source, Agent Output, and Chapters into collapsible sections), a `FileBrowser` when navigating subdirectories, and reader/editor modes when viewing a file.

This session promotes those collapsible sections into first-class tabs and adds a "File Explorer" tab, resulting in **5 tabs**: Source, Chapters, Agents, Explorer, and Motif Ledger. The existing panel components (`SourcePanel`, `ChaptersPanel`, `AgentOutputPanel`) become direct tab content. The `StructuredBrowser` and `CollapsibleSection` components are no longer needed and should be deleted.

The reader/editor mode still works the same way: when a file is selected, the file content replaces the tab panel content, but the tab bar remains visible for navigation.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Files/FilesView.tsx` | Modify | Replace 2-tab structure with 5 tabs. Remove StructuredBrowser usage. Each tab renders its panel directly. |
| `src/renderer/components/Files/StructuredBrowser.tsx` | Delete | No longer used — its sections are now individual tabs. |
| `src/renderer/components/Files/CollapsibleSection.tsx` | Delete | No longer used — panels render directly in tabs without collapsible wrappers. |

---

## Implementation

### 1. Modify FilesView.tsx — Replace tab structure

Read `src/renderer/components/Files/FilesView.tsx` in full.

**Replace the tab state and tab bar.** Change the `activeTab` state from `'files' | 'ledger'` to:

```typescript
type FilesTab = 'source' | 'chapters' | 'agents' | 'explorer' | 'ledger';
```

Default tab: `'source'`.

**Replace the tab bar rendering.** The current 2-button tab bar becomes a 5-button tab bar:

```tsx
const TABS: { id: FilesTab; label: string; icon: string }[] = [
  { id: 'source', label: 'Source', icon: '📋' },
  { id: 'chapters', label: 'Chapters', icon: '📖' },
  { id: 'agents', label: 'Agents', icon: '🤖' },
  { id: 'explorer', label: 'Explorer', icon: '📁' },
  { id: 'ledger', label: 'Motif Ledger', icon: '🧬' },
];
```

Each tab button uses the same styling pattern as the current tabs. Use `gap-1` and `text-xs sm:text-sm` to handle narrow widths gracefully.

**Replace the content area.** Currently the code has:

```tsx
{activeTab === 'ledger' ? (<MotifLedgerView />) : (<> <FilesHeader .../> {viewMode === 'browser' && ...} ... </>)}
```

Change this so that:

- When a file is selected (reader/editor mode), the `FilesHeader` + file content renders **regardless of which tab is active** — the user selected a file, they see it.
- When no file is selected (browser mode), each tab renders its panel:
  - `'source'` → `<SourcePanel>` — also include the Book Info card from the old StructuredBrowser at the top.
  - `'chapters'` → `<ChaptersPanel>`
  - `'agents'` → `<AgentOutputPanel>`
  - `'explorer'` → `<FileBrowser>` with `currentPath` set to `browserPath || ''`. Pass `browserPath || ''` so FileBrowser always renders at root or current directory. When `browserPath` is empty, FileBrowser renders the book root directory listing.
  - `'ledger'` → `<MotifLedgerView>`

The structure should look like:

```tsx
<div className="flex h-full flex-col">
  {/* Tab bar */}
  <div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
    {TABS.map((tab) => (
      <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={...}>
        <span>{tab.icon}</span>
        <span>{tab.label}</span>
      </button>
    ))}
  </div>

  {/* Motif Ledger — full takeover, no header */}
  {activeTab === 'ledger' ? (
    <div className="flex-1 min-h-0"><MotifLedgerView /></div>
  ) : (
    <>
      {/* Show FilesHeader + reader/editor when a file is selected */}
      {(viewMode === 'reader' || viewMode === 'editor') ? (
        <>
          <FilesHeader ... />
          {/* reader/editor content — same as current */}
        </>
      ) : (
        /* Tab panel content — browser mode */
        <>
          {activeTab === 'source' && (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {/* Book Info card from old StructuredBrowser */}
              <div className="mb-6">
                <button onClick={() => handleFileSelect('about.json')} className="group w-full rounded-lg border ...">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">📘</span>
                    <div>
                      <div className="text-sm font-medium ...">Book Info</div>
                      <div className="text-xs text-zinc-500">Edit title, author, status, and cover image</div>
                    </div>
                  </div>
                </button>
              </div>
              <SourcePanel activeSlug={activeSlug} onFileSelect={handleFileSelect} />
            </div>
          )}
          {activeTab === 'chapters' && (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <ChaptersPanel activeSlug={activeSlug} onFileSelect={handleFileSelect} />
            </div>
          )}
          {activeTab === 'agents' && (
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <AgentOutputPanel activeSlug={activeSlug} onFileSelect={handleFileSelect} />
            </div>
          )}
          {activeTab === 'explorer' && (
            <FileBrowser
              currentPath={browserPath || ''}
              onNavigate={handleBrowse}
              onFileSelect={handleFileSelect}
            />
          )}
        </>
      )}
    </>
  )}

  {showFindReplace && activeSlug && <FindReplaceModal onClose={() => setShowFindReplace(false)} />}
</div>
```

**Important details:**

- Remove the `import { StructuredBrowser }` import.
- Keep all existing imports for `SourcePanel`, `AgentOutputPanel`, `ChaptersPanel` (they're already imported via StructuredBrowser indirectly — now import them directly).
- The `FileBrowser` component already handles empty `currentPath` by showing the directory root. Verify this: if `FileBrowser` receives `currentPath=""`, it should call `window.novelEngine.files.listDir(activeSlug)` for the root. If it doesn't, pass `''` — the existing code in FileBrowser does handle this.
- When the user is on the "explorer" tab and navigates into a subdirectory, `browserPath` updates via `handleBrowse`. When they click a file, `handleFileSelect` switches to reader mode. The tab bar remains visible.
- When the user clicks the back button in reader mode (via `handleBackToBrowser`), they return to whichever tab was active. **Don't reset `activeTab` when going back** — the user should land back on the same tab.
- Remove the `viewMode === 'browser' && !browserPath` → StructuredBrowser branch entirely.

### 2. Update FileBrowser to handle root path

Read `src/renderer/components/Files/FileBrowser.tsx`. Check if it handles `currentPath=""` (empty string for root). The current FilesView never sends an empty path to FileBrowser — it shows StructuredBrowser instead. FileBrowser may expect a non-empty path.

Look at how FileBrowser loads entries:
```tsx
const tree = await window.novelEngine.files.listDir(activeSlug, currentPath);
```

If `listDir` accepts an empty string for root (which it should — the sidebar FileTree calls `listDir(activeSlug)` without a path), then FileBrowser should work at root. If FileBrowser's header/breadcrumb doesn't show cleanly for empty path, add a small guard:

- In the breadcrumb rendering, if `currentPath` is empty, show "📁 Root" as a non-clickable label.
- In the header, if `currentPath` is empty, hide the back button.

If `FileBrowser` already handles this gracefully (e.g. shows the top-level folders: `source/`, `chapters/`, `dist/`, `about.json`, etc.), no changes needed.

### 3. Delete StructuredBrowser.tsx and CollapsibleSection.tsx

Delete both files:
- `src/renderer/components/Files/StructuredBrowser.tsx`
- `src/renderer/components/Files/CollapsibleSection.tsx`

Verify no other file imports from either of these. Search for `StructuredBrowser` and `CollapsibleSection` across the codebase.

### 4. Verify the Book Info card

The Book Info card (about.json quick-link) was in StructuredBrowser. It's now inlined into the `'source'` tab panel in FilesView. Verify the styling matches: rounded-lg border, 📘 icon, "Book Info" title, "Edit title, author, status, and cover image" subtitle.

---

## Verification

1. Run `npx tsc --noEmit` — no type errors.
2. Run the app. Click the **Files** nav item.
3. Verify **5 tabs** appear: Source, Chapters, Agents, Explorer, Motif Ledger.
4. **Source tab** shows the Book Info card and source file list (Voice Profile, Scene Outline, Story Bible, Pitch).
5. **Chapters tab** shows the chapter list with word counts, add/reorder/delete functionality.
6. **Agents tab** shows agent output files grouped by agent (Ghostlight, Lumen, Sable, Forge, Quill).
7. **Explorer tab** shows the full directory tree (source/, chapters/, dist/, about.json, etc.) — equivalent to the old sidebar file tree but in a richer browser layout.
8. **Motif Ledger tab** shows the motif ledger view (unchanged).
9. Clicking a file in any tab opens it in reader mode. The tab bar remains visible. Clicking back returns to the tab.
10. No imports reference `StructuredBrowser` or `CollapsibleSection` anywhere in the codebase.
11. Layer boundaries intact — no new cross-layer imports.

---

## State Update

After completing this session, update `prompts/session-program/program-003/STATE.md`:
- Set SESSION-01 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
