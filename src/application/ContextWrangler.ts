import type {
  IAgentService,
  IClaudeClient,
  IContextWrangler,
  IDatabaseService,
  IFileSystemService,
  ISettingsService,
} from '@domain/interfaces';
import type {
  AgentName,
  AssembledContext,
  ChapterStrategy,
  ConversationPurpose,
  ConversationStrategy,
  CreativeAgentName,
  WranglerChapterDirective,
  WranglerChapterExclude,
  WranglerExcludeDirective,
  WranglerFileDirective,
  WranglerInput,
  WranglerPlan,
} from '@domain/types';
import { FILE_MANIFEST_KEYS, WRANGLER_MAX_TOKENS, WRANGLER_MODEL } from '@domain/constants';
import { TokenEstimator } from './context/TokenEstimator';
import { ManifestBuilder } from './context/ManifestBuilder';
import { PlanExecutor } from './context/PlanExecutor';

/**
 * Skip the Wrangler API call when total project content (files + chapters) is
 * below this token threshold. The static per-agent fallback rules are sufficient
 * for small projects, saving 3-8 seconds of latency per message.
 */
const WRANGLER_SKIP_THRESHOLD = 10_000;

/**
 * Also invoke the Wrangler when the conversation has enough turns that
 * compaction strategy matters, even if the project content is small.
 */
const WRANGLER_SKIP_TURN_THRESHOLD = 15;

/** Per-agent file inclusion rules for the fallback plan. */
const FALLBACK_FILE_RULES: Record<CreativeAgentName, string[]> = {
  Spark: ['authorProfile'],
  Verity: ['voiceProfile', 'pitch', 'sceneOutline', 'storyBible', 'authorProfile', 'revisionPrompts'],
  Ghostlight: [],
  Lumen: ['readerReport', 'sceneOutline', 'storyBible', 'pitch'],
  Sable: ['styleSheet', 'storyBible'],
  Forge: ['devReport', 'readerReport', 'auditReport', 'sceneOutline'],
  Quill: ['authorProfile', 'storyBible'],
};

/** Per-agent chapter strategy for the fallback plan. */
const FALLBACK_CHAPTER_RULES: Record<CreativeAgentName, { strategy: ChapterStrategy; draftOnly: boolean }> = {
  Spark: { strategy: 'none', draftOnly: false },
  Verity: { strategy: 'sliding-window', draftOnly: false },
  Ghostlight: { strategy: 'full-read', draftOnly: true },
  Lumen: { strategy: 'full-read', draftOnly: false },
  Sable: { strategy: 'full-read', draftOnly: true },
  Forge: { strategy: 'none', draftOnly: false },
  Quill: { strategy: 'none', draftOnly: false },
};

export class ContextWrangler implements IContextWrangler {
  private tokenEstimator: TokenEstimator;

  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private claude: IClaudeClient,
  ) {
    this.tokenEstimator = new TokenEstimator();
  }

  estimateTokens(text: string): number {
    return this.tokenEstimator.estimate(text);
  }

  async assemble(params: {
    agentName: AgentName;
    userMessage: string;
    conversationId: string;
    bookSlug: string;
    purpose?: ConversationPurpose;
  }): Promise<AssembledContext> {
    const { agentName, userMessage, conversationId, bookSlug, purpose } = params;

    try {
      // 1. Load the agent to get system prompt and thinking budget
      const agent = await this.agents.load(agentName);

      // 2. Load settings for model and thinking config
      const appSettings = await this.settings.load();

      // 3. Calculate system prompt tokens
      const systemPromptTokens = this.tokenEstimator.estimate(agent.systemPrompt);

      // 4. Determine thinking budget
      const thinkingBudget = appSettings.enableThinking ? agent.thinkingBudget : 0;

      // 5. Build the manifest (reads book context + conversation from DB)
      const manifestBuilder = new ManifestBuilder(this.fs, this.db, this.tokenEstimator);
      const wranglerInput = await manifestBuilder.build({
        agentName,
        userMessage,
        bookSlug,
        conversationId,
        systemPromptTokens,
        thinkingBudget,
      });

      // 6. Attach purpose to the wrangler input so the Wrangler sees it
      if (purpose) {
        wranglerInput.purpose = purpose;
      }

      // 6b. Decide whether to call the Wrangler or use the fast fallback.
      // The Wrangler adds a full API round-trip (~3-8s). Skip it when the project
      // context is small enough that the static per-agent rules are sufficient.
      let plan: WranglerPlan;
      const totalFileTokens = wranglerInput.fileManifest.reduce((sum, f) => sum + f.tokens, 0);
      const totalChapterTokens = wranglerInput.chapters.reduce((sum, c) => sum + c.draftTokens + c.notesTokens, 0);
      const totalProjectTokens = totalFileTokens + totalChapterTokens;
      const conversationTurns = wranglerInput.conversation.turnCount;

      const needsWrangler = totalProjectTokens > WRANGLER_SKIP_THRESHOLD
        || conversationTurns > WRANGLER_SKIP_TURN_THRESHOLD;

      if (needsWrangler) {
        try {
          const wranglerAgent = await this.agents.load('Wrangler');

          // 7. Call the Wrangler CLI — cheap Sonnet call to decide what context to load
          const planJson = await this.claude.sendOneShot({
            model: WRANGLER_MODEL,
            systemPrompt: wranglerAgent.systemPrompt,
            userMessage: JSON.stringify(wranglerInput),
            maxTokens: WRANGLER_MAX_TOKENS,
          });

          // 8. Parse the response as WranglerPlan
          try {
            plan = JSON.parse(planJson) as WranglerPlan;
          } catch {
            console.warn('Wrangler returned invalid JSON, using fallback plan');
            plan = this.buildFallbackPlan(wranglerInput);
          }

          // 9. Validate the plan — must have all three required sections
          if (!plan.files || !plan.chapters || !plan.conversation) {
            console.warn('Wrangler plan missing required fields, using fallback plan');
            plan = this.buildFallbackPlan(wranglerInput);
          }
        } catch (err) {
          console.warn('Wrangler agent load or CLI call failed, using fallback plan:', err);
          plan = this.buildFallbackPlan(wranglerInput);
        }
      } else {
        // Small context — use static rules directly, skip the Wrangler API call
        plan = this.buildFallbackPlan(wranglerInput);
      }

      // 10. Execute the plan — mechanically assemble context per the WranglerPlan
      const executor = new PlanExecutor(this.claude, this.tokenEstimator);
      return await executor.execute({
        plan,
        bookContext: manifestBuilder.getBookContext(),
        messages: manifestBuilder.getMessages(),
      });
    } catch (err) {
      // If the entire flow fails, attempt a minimal fallback
      console.error('Context assembly failed:', err);

      try {
        const manifestBuilder = new ManifestBuilder(this.fs, this.db, this.tokenEstimator);
        const wranglerInput = await manifestBuilder.build({
          agentName,
          userMessage,
          bookSlug,
          conversationId,
          systemPromptTokens: 0,
          thinkingBudget: 0,
        });

        const plan = this.buildFallbackPlan(wranglerInput);
        const executor = new PlanExecutor(this.claude, this.tokenEstimator);
        return await executor.execute({
          plan,
          bookContext: manifestBuilder.getBookContext(),
          messages: manifestBuilder.getMessages(),
        });
      } catch (fallbackErr) {
        throw new Error(
          `Context assembly failed completely. Original: ${err instanceof Error ? err.message : String(err)}. ` +
          `Fallback: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
      }
    }
  }

  /**
   * Build a safe fallback plan using hardcoded per-agent rules.
   * Used when the Wrangler CLI call fails or returns unparseable JSON.
   * This ensures the app always works at the cost of potentially loading more context than needed.
   */
  private buildFallbackPlan(input: WranglerInput): WranglerPlan {
    const agentName = input.agent;

    // Treat Wrangler as Spark for fallback purposes (should never happen in practice)
    const creativeAgent: CreativeAgentName = agentName === 'Wrangler' ? 'Spark' : agentName as CreativeAgentName;
    const includeKeys = FALLBACK_FILE_RULES[creativeAgent] ?? [];

    const allKeys = FILE_MANIFEST_KEYS.map((f) => f.key);
    const keyToPath = Object.fromEntries(FILE_MANIFEST_KEYS.map((f) => [f.key, f.path]));

    // Only include files that actually have content (tokens > 0)
    const existingKeys = new Set(
      input.fileManifest.filter((f) => f.tokens > 0).map((f) => f.key),
    );

    const include: WranglerFileDirective[] = includeKeys
      .filter((key) => existingKeys.has(key))
      .map((key) => ({ key, path: keyToPath[key] }));

    const includedKeySet = new Set(include.map((f) => f.key));

    const exclude: WranglerExcludeDirective[] = allKeys
      .filter((key) => !includedKeySet.has(key))
      .map((key) => ({ key, reason: 'Not required by fallback rules' }));

    // Chapter directives based on agent
    const chapterRule = FALLBACK_CHAPTER_RULES[creativeAgent] ?? { strategy: 'none' as ChapterStrategy, draftOnly: false };
    let chapterInclude: WranglerChapterDirective[] = [];
    const chapterExclude: WranglerChapterExclude[] = [];

    if (chapterRule.strategy === 'sliding-window') {
      // Last 3 chapters for Verity
      const sorted = [...input.chapters].sort((a, b) => a.number - b.number);
      const lastThree = sorted.slice(-3);
      const excluded = sorted.slice(0, -3);

      chapterInclude = lastThree.map((ch) => ({
        number: ch.number,
        slug: ch.slug,
        includeDraft: true,
        includeNotes: !chapterRule.draftOnly,
      }));

      if (excluded.length > 0) {
        chapterExclude.push({
          range: `${excluded[0].number}-${excluded[excluded.length - 1].number}`,
          reason: 'Outside sliding window (fallback: last 3)',
        });
      }
    } else if (chapterRule.strategy === 'full-read') {
      // All chapters for Ghostlight, Lumen, Sable
      chapterInclude = input.chapters.map((ch) => ({
        number: ch.number,
        slug: ch.slug,
        includeDraft: true,
        includeNotes: !chapterRule.draftOnly,
      }));
    }
    // strategy === 'none': no chapters for Spark, Forge, Quill

    // Conversation rules based on turn count
    const totalTurns = input.conversation.turnCount;
    let conversationStrategy: ConversationStrategy;
    let keepRecentTurns: number;

    if (totalTurns <= 20) {
      conversationStrategy = 'keep-all';
      keepRecentTurns = totalTurns;
    } else {
      conversationStrategy = 'keep-recent-only';
      keepRecentTurns = 6;
    }

    // Estimate token totals for the plan
    const fileTokens = include.reduce((sum, f) => {
      const entry = input.fileManifest.find((m) => m.key === f.key);
      return sum + (entry?.tokens ?? 0);
    }, 0);

    const chapterTokens = chapterInclude.reduce((sum, ch) => {
      const entry = input.chapters.find((c) => c.slug === ch.slug);
      if (!entry) return sum;
      return sum + entry.draftTokens + (ch.includeNotes ? entry.notesTokens : 0);
    }, 0);

    const conversationTokens = conversationStrategy === 'keep-all'
      ? input.conversation.totalTokens
      : input.conversation.recentTokens;

    const totalEstimate = fileTokens + chapterTokens + conversationTokens;

    return {
      files: { include, summarize: [], exclude },
      chapters: {
        strategy: chapterRule.strategy,
        include: chapterInclude,
        exclude: chapterExclude,
        batchRequired: false,
      },
      conversation: {
        strategy: conversationStrategy,
        keepRecentTurns,
        dropThinkingOlderThan: keepRecentTurns,
        summarizeOld: false,
        summaryFocus: '',
      },
      reasoning: 'Fallback plan — Wrangler call failed or returned invalid response',
      tokenEstimate: {
        files: fileTokens,
        chapters: chapterTokens,
        conversation: conversationTokens,
        total: totalEstimate,
        budgetRemaining: input.budget.availableForContext - totalEstimate,
      },
    };
  }
}
