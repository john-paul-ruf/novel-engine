import type {
  IDashboardService,
  IDatabaseService,
  IFileSystemService,
  IPipelineService,
} from '@domain/interfaces';
import type {
  AgentName,
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
            agentName: lastConv.agentName as AgentName,
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
