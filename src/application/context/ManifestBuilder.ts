import type { IFileSystemService, IDatabaseService } from '@domain/interfaces';
import type {
  AgentName,
  BookContext,
  BookStatus,
  ChapterManifestEntry,
  ContextBudget,
  ConversationManifest,
  FileManifestEntry,
  Message,
  PipelinePhaseId,
  WranglerInput,
} from '@domain/types';
import {
  AGENT_RESPONSE_BUFFER,
  FILE_MANIFEST_KEYS,
  MAX_CONTEXT_TOKENS,
  WRANGLER_RECENT_TURN_COUNT,
} from '@domain/constants';
import { TokenEstimator } from './TokenEstimator';

/** Maps file manifest keys to their corresponding BookContext property names. */
const KEY_TO_FIELD: Record<string, keyof BookContext> = {
  voiceProfile: 'voiceProfile',
  sceneOutline: 'sceneOutline',
  storyBible: 'storyBible',
  pitch: 'pitch',
  authorProfile: 'authorProfile',
  readerReport: 'readerReport',
  devReport: 'devReport',
  auditReport: 'auditReport',
  revisionPrompts: 'revisionPrompts',
  styleSheet: 'styleSheet',
  projectTasks: 'projectTasks',
  metadata: 'metadata',
};

/** Maps BookStatus to the closest PipelinePhaseId. */
const STATUS_TO_PHASE: Record<BookStatus, PipelinePhaseId> = {
  scaffolded: 'pitch',
  outlining: 'scaffold',
  'first-draft': 'first-draft',
  'revision-1': 'revision',
  'revision-2': 'second-read',
  'copy-edit': 'copy-edit',
  final: 'build',
  published: 'publish',
};

export class ManifestBuilder {
  private bookContext: BookContext | null = null;
  private messages: Message[] = [];

  constructor(
    private fs: IFileSystemService,
    private db: IDatabaseService,
    private tokenEstimator: TokenEstimator,
  ) {}

  async build(params: {
    agentName: AgentName;
    userMessage: string;
    bookSlug: string;
    conversationId: string;
    systemPromptTokens: number;
    thinkingBudget: number;
  }): Promise<WranglerInput> {
    const { agentName, userMessage, bookSlug, conversationId, systemPromptTokens, thinkingBudget } = params;

    // 1. Load book context — stores internally for later access by PlanExecutor
    this.bookContext = await this.fs.loadBookContext(bookSlug);

    // 2. Build file manifest — measure token count for each known source file
    const fileManifest: FileManifestEntry[] = FILE_MANIFEST_KEYS.map(({ key, path }) => {
      const fieldName = KEY_TO_FIELD[key];
      const content = fieldName ? (this.bookContext![fieldName] as string) : '';
      return {
        key,
        path,
        tokens: content ? this.tokenEstimator.estimate(content) : 0,
      };
    });

    // 3. Build chapters manifest — derive chapter number from slug prefix
    const chapters: ChapterManifestEntry[] = this.bookContext.chapters.map((ch) => {
      const numberMatch = ch.slug.match(/^(\d+)/);
      const chapterNumber = numberMatch ? parseInt(numberMatch[1], 10) : 0;
      return {
        number: chapterNumber,
        slug: ch.slug,
        draftTokens: this.tokenEstimator.estimate(ch.draft),
        notesTokens: this.tokenEstimator.estimate(ch.notes),
      };
    });

    // 4. Build conversation manifest — split into recent and old, measure tokens
    this.messages = this.db.getMessages(conversationId);
    const totalTurns = this.messages.length;
    const recentCount = Math.min(WRANGLER_RECENT_TURN_COUNT, totalTurns);
    const oldCount = totalTurns - recentCount;

    const recentMessages = this.messages.slice(-recentCount);
    const oldMessages = this.messages.slice(0, oldCount);

    const recentTokens = recentMessages.reduce(
      (sum, m) => sum + this.tokenEstimator.estimate(m.content),
      0,
    );
    const oldTokens = oldMessages.reduce(
      (sum, m) => sum + this.tokenEstimator.estimate(m.content),
      0,
    );

    const hasThinkingBlocks = this.messages.some((m) => m.thinking !== '');

    const conversation: ConversationManifest = {
      turnCount: totalTurns,
      totalTokens: recentTokens + oldTokens,
      recentTurns: recentCount,
      recentTokens,
      oldTurns: oldCount,
      oldTokens,
      hasThinkingBlocks,
    };

    // 5. Calculate budget — how many tokens are available for context
    const responseBuffer = AGENT_RESPONSE_BUFFER[agentName];
    const availableForContext = MAX_CONTEXT_TOKENS - systemPromptTokens - thinkingBudget - responseBuffer;

    const budget: ContextBudget = {
      totalContextWindow: MAX_CONTEXT_TOKENS,
      systemPromptTokens,
      thinkingBudget,
      responseBuffer,
      availableForContext,
    };

    // 6. Determine book status and pipeline phase
    const bookStatus = this.bookContext.meta.status;
    const pipelinePhase: PipelinePhaseId | null = STATUS_TO_PHASE[bookStatus] ?? null;

    return {
      agent: agentName,
      userMessage,
      bookStatus,
      pipelinePhase,
      fileManifest,
      chapters,
      conversation,
      budget,
    };
  }

  getBookContext(): BookContext {
    if (!this.bookContext) {
      throw new Error('ManifestBuilder.build() must be called before getBookContext()');
    }
    return this.bookContext;
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
