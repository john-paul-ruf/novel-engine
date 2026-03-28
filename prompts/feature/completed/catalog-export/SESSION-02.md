# SESSION-02 — Export Catalog Button in Settings UI

> **Feature:** catalog-export
> **Layer(s):** Renderer
> **Depends on:** SESSION-01
> **Estimated effort:** 10 min

---

## Context

SESSION-01 added the `catalog:exportZip` IPC handler and preload bridge method. This session adds the UI trigger — a button in the Settings view that calls `window.novelEngine.catalog.exportZip()` and shows feedback.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/renderer/components/Settings/SettingsView.tsx` | Modify | Add `CatalogExportSection` component |

---

## Implementation

### 1. Add the CatalogExportSection Component

Read `src/renderer/components/Settings/SettingsView.tsx`. Add a new section component after the existing `UsageSection` function (around line 355):

```typescript
function CatalogExportSection(): React.ReactElement {
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setLastExport(null);
    try {
      const savedPath = await window.novelEngine.catalog.exportZip();
      if (savedPath) {
        setLastExport(savedPath);
      }
    } catch (error) {
      console.error('Failed to export catalog:', error);
    } finally {
      setExporting(false);
    }
  }, []);

  return (
    <section className="space-y-3">
      <SectionHeading>Catalog Export</SectionHeading>
      <HelpText>
        Export all your books as a single ZIP archive. Includes all source files, chapters, and build outputs.
      </HelpText>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {exporting ? 'Exporting...' : 'Export All Books to ZIP'}
      </button>
      {lastExport && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <span>Saved to:</span>
          <button
            onClick={() => window.novelEngine.shell.openPath(lastExport)}
            className="underline decoration-green-600/30 dark:decoration-green-400/30 hover:text-green-700 dark:hover:text-green-300"
          >
            {lastExport}
          </button>
        </div>
      )}
    </section>
  );
}
```

### 2. Wire Into SettingsView

In the `SettingsView` component's JSX, add the new section between `UsageSection` and `AuthorProfileSection`. The existing code looks like:

```tsx
<UsageSection />
<SectionDivider />
<AuthorProfileSection />
```

Change it to:

```tsx
<UsageSection />
<SectionDivider />
<CatalogExportSection />
<SectionDivider />
<AuthorProfileSection />
```

This placement groups it near Usage (data-oriented sections) and before Author Profile (identity section), which feels natural — "here's your usage data, here's how to back up your work."

---

## Architecture Compliance

- [x] Domain files import from nothing — no domain changes
- [x] Infrastructure imports only from domain + external packages — no infra changes
- [x] Application imports only from domain interfaces — no app changes
- [x] IPC handlers are one-liner delegations — no handler changes
- [x] Renderer accesses backend only through `window.novelEngine` — uses `catalog.exportZip()` and `shell.openPath()`
- [x] All new IPC channels are namespaced — no new channels
- [x] All async operations have error handling — try/catch around the export call
- [x] No `any` types

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. Open Settings view — "Catalog Export" section appears between Usage and Author Profile
3. Click "Export All Books to ZIP" — native save dialog opens
4. After saving, the "Saved to:" link appears and clicking it opens the file location
5. The ZIP contains all books with their full directory structure

---

## State Update

After completing this session, update `prompts/feature/catalog-export/STATE.md`:
- Set SESSION-02 status to `done`
- Set Completed date
- Add notes about any decisions or complications
- Update Handoff Notes
