# SESSION-03 — Dashboard Service + FileSystem + IPC + Preload

> **Program:** Novel Engine
> **Feature:** dashboards-and-revision-modal
> **Modules:** M05, M08, M09
> **Depends on:** SESSION-01, SESSION-02
> **Estimated effort:** 30 min

---

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| `M01` | domain | `src/domain/interfaces.ts, src/domain/types.ts` | IDashboardService interface, BookDashboardData type |
| `M05` | filesystem | `src/infrastructure/filesystem/FileSystemService.ts` | Adding `getRecentFiles()` method |
| `M08` | application | `src/application/` | Creating DashboardService |
| `M09` | main/ipc | `src/main/index.ts, src/main/ipc/handlers.ts, src/preload/index.ts` | Wiring service + IPC + bridge |

---

## Context

SESSION-01 defined the `IDashboardService` interface and `BookDashboardData` type. SESSION-02 added the database queries. This session creates the concrete service that assembles dashboard data from pipeline, filesystem, database, and project-tasks.md parsing. It also implements `getRecentFiles()` in FileSystemService and wires everything through IPC to the preload bridge.

---

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/infrastructure/filesystem/FileSystemService.ts` | Modify | Add `getRecentFiles()` implementation |
| `src/application/DashboardService.ts` | Create | Implements `IDashboardService` |
| `src/main/index.ts` | Modify | Instantiate DashboardService, inject deps |
| `src/main/ipc/handlers.ts` | Modify | Add `dashboard:getData` handler |
| `src/preload/index.ts` | Modify | Add `dashboard` bridge namespace |

---

## Implementation

### 1. Add `getRecentFiles()` to `FileSystemService`

Read `src/infrastructure/filesystem/FileSystemService.ts`. Find the `countWordsPerChapter` method. After it, add:

```typescript
async getRecentFiles(bookSlug: string, limit = 10): Promise<RecentFile[]> {
  const bookPath = path.join(this.booksPath, bookSlug);
  const results: RecentFile[] = [];

  const walk = async (dir: string, relativeTo: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fsPromises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(relativeTo, fullPath);

      if (entry.name.startsWith('.') || entry.name === 'dist') continue;

      if (entry.isDirectory()) {
        await walk(fullPath, relativeTo);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.json')) {
        try {
          const stat = await fsPromises.stat(fullPath);
          let wordCount = 0;
          if (entry.name.endsWith('.md')) {
            const content = await fsPromises.readFile(fullPath, 'utf-8');
            wordCount = content.split(/\s+/).filter(Boolean).length;
          }
          results.push({
            path: relPath,
            modifiedAt: stat.mtime.toISOString(),
            wordCount,
          });
        } catch {
          // Skip files that can't be stat'd
        }
      }
    }
  };

  await walk(bookPath, bookPath);

  results.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return results.slice(0, limit);
}
```

Add `RecentFile` to the type imports from `@domain/types` at the top of the file. Add `Dirent` to the `node:fs` imports if not already imported (check if `readdir` with `withFileTypes` is already used — if so, `Dirent` is already available).

### 2. Create `src/application/DashboardService.ts`

```typescript
import type {
  IDashboardService,
  IDatabaseService,
  IFileSystemService,
  IPipelineService,
} from '@domain/interfaces';
import type {
  BookDashboardData,
  RevisionTaskItem,
} from '@domain/types';

export class DashboardService implements IDashboardService {
  constructor(
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private pipeline: IPipelineService,
  ) {}

  async getDashboardData(bookSlug: string): Promise<BookDashboardData> {
    const [meta, phases, activePhase, chapters, recentFiles] = await Promise.all([
      this.fs.getBookMeta(bookSlug),
      this.pipeline.detectPhases(bookSlug),
      this.pipeline.getActivePhase(bookSlug),
      this.fs.countWordsPerChapter(bookSlug),
      this.fs.getRecentFiles(bookSlug, 8),
    ]);

    const completedCount = phases.filter((p) => p.status === 'complete').length;
    const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

    const lastConv = this.db.getLastConversation(bookSlug);

    const revisionTasks = await this.parseRevisionTasks(bookSlug);

    const createdDate = new Date(meta.created);
    const now = new Date();
    const daysInProgress = Math.max(0, Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)));

    return {
      bookSlug,
      bookTitle: meta.title,
      bookStatus: meta.status,
      pipeline: {
        currentPhase: activePhase,
        completedCount,
        totalCount: phases.length,
      },
      wordCount: {
        current: totalWordCount,
        target: null,
        perChapter: chapters,
      },
      lastInteraction: lastConv
        ? {
            agentName: lastConv.agentName as BookDashboardData['lastInteraction'] extends null ? never : NonNullable<BookDashboardData['lastInteraction']>['agentName'],
            timestamp: lastConv.updatedAt,
            conversationTitle: lastConv.title,
          }
        : null,
      revisionTasks,
      recentFiles,
      daysInProgress,
    };
  }

  private async parseRevisionTasks(bookSlug: string): Promise<BookDashboardData['revisionTasks']> {
    let content: string;
    try {
      content = await this.fs.readFile(bookSlug, 'source/project-tasks.md');
    } catch {
      return { total: 0, completed: 0, items: [] };
    }

    const items: RevisionTaskItem[] = [];
    const lines = content.split('\n');
    let taskNumber = 0;

    for (const line of lines) {
      const checkedMatch = line.match(/^[-*]\s+\[x\]\s+(.+)/i);
      const uncheckedMatch = line.match(/^[-*]\s+\[\s\]\s+(.+)/);

      if (checkedMatch) {
        taskNumber++;
        items.push({ text: checkedMatch[1].trim(), isCompleted: true, taskNumber });
      } else if (uncheckedMatch) {
        taskNumber++;
        items.push({ text: uncheckedMatch[1].trim(), isCompleted: false, taskNumber });
      }
    }

    return {
      total: items.length,
      completed: items.filter((t) => t.isCompleted).length,
      items,
    };
  }
}
```

Note: The `lastInteraction` cast is awkward — simplify by casting `lastConv.agentName` as `AgentName`:

```typescript
import type { AgentName } from '@domain/types';
// ...
agentName: lastConv.agentName as AgentName,
```

### 3. Wire DashboardService in composition root

Read `src/main/index.ts`. Find where other application services are instantiated (ChatService, PipelineService, etc.).

Add the import:
```typescript
import { DashboardService } from '@app/DashboardService';
```

Instantiate after PipelineService:
```typescript
const dashboardService = new DashboardService(databaseService, fileSystemService, pipelineService);
```

Pass to `registerIpcHandlers`:
```typescript
dashboard: dashboardService,
```

Update the `registerIpcHandlers` function signature in `handlers.ts` to accept `dashboard: IDashboardService`.

### 4. Add IPC handler

In `src/main/ipc/handlers.ts`:

Add `IDashboardService` to the interface imports:
```typescript
import type { IDashboardService } from '@domain/interfaces';
```

Add `BookDashboardData` to the type imports:
```typescript
import type { BookDashboardData } from '@domain/types';
```

Add `dashboard: IDashboardService` to the services parameter object.

Add the handler (after the existing handler registrations, grouped with a comment):
```typescript
// Dashboard
ipcMain.handle('dashboard:getData', async (_event, bookSlug: string): Promise<BookDashboardData> => {
  return services.dashboard.getDashboardData(bookSlug);
});
```

### 5. Add preload bridge

In `src/preload/index.ts`:

Add `BookDashboardData` to the type imports.

Add the `dashboard` namespace to the `api` object:
```typescript
// Dashboard
dashboard: {
  getData: (bookSlug: string): Promise<BookDashboardData> =>
    ipcRenderer.invoke('dashboard:getData', bookSlug),
},
```

---

## Verification

1. Run `npx tsc --noEmit` — must pass with zero errors.
2. Verify `DashboardService` imports only from `@domain/interfaces` and `@domain/types` — never concrete infrastructure classes.
3. Verify `handlers.ts` dashboard handler is a one-liner delegation.
4. Verify `getRecentFiles` in FileSystemService uses async file operations and handles errors.
5. Verify the preload bridge `dashboard.getData` matches the IPC channel name `dashboard:getData`.

---

## State Update

After completing this session, update `prompts/session-program/program-004/STATE.md`:
- Set SESSION-03 status to `done`
- Set Completed date
- Add notes about decisions or complications
- Update Handoff Notes
