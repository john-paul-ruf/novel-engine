import type { IClaudeClient } from '@domain/interfaces';
import type {
  AssembledContext,
  BookContext,
  ContextDiagnostics,
  Message,
  MessageRole,
  WranglerPlan,
} from '@domain/types';
import { SUMMARIZATION_MAX_TOKENS, WRANGLER_MODEL } from '@domain/constants';
import { TokenEstimator } from './TokenEstimator';

/** Human-readable labels for file manifest keys. */
const KEY_TO_LABEL: Record<string, string> = {
  voiceProfile: 'Voice Profile',
  sceneOutline: 'Scene Outline',
  storyBible: 'Story Bible',
  pitch: 'Pitch',
  authorProfile: 'Author Profile',
  readerReport: 'Reader Report',
  devReport: 'Dev Report',
  auditReport: 'Audit Report',
  revisionPrompts: 'Revision Prompts',
  styleSheet: 'Style Sheet',
  projectTasks: 'Project Tasks',
  metadata: 'Metadata',
};

/** Maps file manifest keys to BookContext field names. */
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

function keyToLabel(key: string): string {
  return KEY_TO_LABEL[key] ?? key;
}

function lookupContent(bookContext: BookContext, key: string): string {
  const field = KEY_TO_FIELD[key];
  if (!field) return '';
  return bookContext[field] as string;
}

export class PlanExecutor {
  constructor(
    private claude: IClaudeClient,
    private tokenEstimator: TokenEstimator,
  ) {}

  async execute(params: {
    plan: WranglerPlan;
    bookContext: BookContext;
    messages: Message[];
  }): Promise<AssembledContext> {
    const { plan, bookContext, messages } = params;
    const sections: string[] = [];

    // 1. Book metadata block (always first)
    const metaJson = JSON.stringify(
      {
        slug: bookContext.meta.slug,
        title: bookContext.meta.title,
        author: bookContext.meta.author,
        status: bookContext.meta.status,
      },
      null,
      2,
    );
    sections.push(`## Active Book\n\`\`\`json\n${metaJson}\n\`\`\``);

    // 2. Process file includes — full content with labeled headers
    for (const directive of plan.files.include) {
      const content = lookupContent(bookContext, directive.key);
      if (content) {
        sections.push(`## ${keyToLabel(directive.key)}\n${content}`);
      }
    }

    // 3. Process file summarizations — use cheap CLI call to condense
    for (const directive of plan.files.summarize) {
      const content = lookupContent(bookContext, directive.key);
      if (content) {
        try {
          const summary = await this.claude.sendOneShot({
            model: WRANGLER_MODEL,
            systemPrompt: `You are a document summarizer for a novel-writing tool. Summarize the following document to approximately ${directive.targetTokens} tokens. Focus on: ${directive.focus}. Output the summary only — no commentary, no meta-discussion.`,
            userMessage: content,
            maxTokens: SUMMARIZATION_MAX_TOKENS,
          });
          sections.push(`## ${keyToLabel(directive.key)} (summarized)\n${summary}`);
        } catch (err) {
          // If summarization fails, include the full content as fallback
          console.warn(`Summarization failed for ${directive.key}, including full content:`, err);
          sections.push(`## ${keyToLabel(directive.key)}\n${content}`);
        }
      }
    }

    // 4. Process chapters — format with draft and optional notes
    for (const directive of plan.chapters.include) {
      const chapter = bookContext.chapters.find((ch) => ch.slug === directive.slug);
      if (!chapter) continue;

      let chapterSection = `## Chapter ${directive.number}: ${directive.slug}`;

      if (directive.includeDraft && chapter.draft) {
        chapterSection += `\n### Draft\n${chapter.draft}`;
      }

      if (directive.includeNotes && chapter.notes) {
        chapterSection += `\n### Notes\n${chapter.notes}`;
      }

      sections.push(chapterSection);
    }

    // 5. Process conversation — apply compaction strategy
    const conversationMessages = await this.processConversation(plan, messages);

    // 6. Build diagnostics
    const projectContext = sections.join('\n\n---\n\n');
    const totalTokensUsed = this.tokenEstimator.estimate(projectContext)
      + conversationMessages.reduce((sum, m) => sum + this.tokenEstimator.estimate(m.content), 0);

    const diagnostics: ContextDiagnostics = {
      filesIncluded: plan.files.include.map((f) => f.key),
      filesExcluded: plan.files.exclude.map((f) => f.key),
      filesSummarized: plan.files.summarize.map((f) => f.key),
      chapterStrategy: plan.chapters.strategy,
      chaptersIncluded: plan.chapters.include.map((ch) => ch.number),
      chaptersExcluded: plan.chapters.exclude.map((e) => e.range).join(', ') || 'none',
      conversationStrategy: plan.conversation.strategy,
      conversationTurnsSent: conversationMessages.length,
      conversationTurnsDropped: messages.length - conversationMessages.length,
      wranglerReasoning: plan.reasoning,
      totalTokensUsed,
      budgetRemaining: plan.tokenEstimate?.budgetRemaining ?? 0,
      wranglerCostTokens: 0, // Set by the caller (ContextWrangler) after the wrangler call
    };

    return { projectContext, conversationMessages, diagnostics };
  }

  private async processConversation(
    plan: WranglerPlan,
    messages: Message[],
  ): Promise<{ role: MessageRole; content: string }[]> {
    const { strategy, keepRecentTurns, dropThinkingOlderThan, summaryFocus } = plan.conversation;

    if (messages.length === 0) return [];

    switch (strategy) {
      case 'keep-all':
        return this.processKeepAll(messages, dropThinkingOlderThan);
      case 'summarize-old':
        return this.processSummarizeOld(messages, keepRecentTurns, summaryFocus);
      case 'keep-recent-only':
        return this.processKeepRecentOnly(messages, keepRecentTurns, summaryFocus);
      default:
        return messages.map((m) => ({ role: m.role, content: m.content }));
    }
  }

  /**
   * Keep all messages. Thinking is always stripped (only content is sent in conversation
   * messages — never the thinking field).
   */
  private processKeepAll(
    messages: Message[],
    _dropThinkingOlderThan: number,
  ): { role: MessageRole; content: string }[] {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  /**
   * Summarize old messages, keep recent verbatim. Uses a cheap CLI call for the summary.
   */
  private async processSummarizeOld(
    messages: Message[],
    keepRecentTurns: number,
    summaryFocus: string,
  ): Promise<{ role: MessageRole; content: string }[]> {
    const recentStart = Math.max(0, messages.length - keepRecentTurns);
    const oldMessages = messages.slice(0, recentStart);
    const recentMessages = messages.slice(recentStart);

    if (oldMessages.length === 0) {
      return recentMessages.map((m) => ({ role: m.role, content: m.content }));
    }

    const concatenated = oldMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    let summary: string;
    try {
      summary = await this.claude.sendOneShot({
        model: WRANGLER_MODEL,
        systemPrompt: `Summarize this conversation history for context continuity. Preserve: ${summaryFocus}. Be concise — 2-4 paragraphs maximum. Output the summary only.`,
        userMessage: concatenated,
        maxTokens: SUMMARIZATION_MAX_TOKENS,
      });
    } catch (err) {
      console.warn('Conversation summarization failed, keeping recent only:', err);
      return recentMessages.map((m) => ({ role: m.role, content: m.content }));
    }

    return [
      { role: 'user' as MessageRole, content: `[Conversation recap]\n${summary}` },
      { role: 'assistant' as MessageRole, content: 'Understood. I have the context from our previous conversation.' },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];
  }

  /**
   * Keep only recent messages with a very brief summary of old ones.
   */
  private async processKeepRecentOnly(
    messages: Message[],
    keepRecentTurns: number,
    summaryFocus: string,
  ): Promise<{ role: MessageRole; content: string }[]> {
    const recentStart = Math.max(0, messages.length - keepRecentTurns);
    const oldMessages = messages.slice(0, recentStart);
    const recentMessages = messages.slice(recentStart);

    if (oldMessages.length === 0) {
      return recentMessages.map((m) => ({ role: m.role, content: m.content }));
    }

    const concatenated = oldMessages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    let summary: string;
    try {
      summary = await this.claude.sendOneShot({
        model: WRANGLER_MODEL,
        systemPrompt: `Summarize this conversation history for context continuity. Preserve: ${summaryFocus}. Be concise — 2-3 sentences maximum. Output the summary only.`,
        userMessage: concatenated,
        maxTokens: SUMMARIZATION_MAX_TOKENS,
      });
    } catch (err) {
      console.warn('Conversation summarization failed, keeping recent only:', err);
      return recentMessages.map((m) => ({ role: m.role, content: m.content }));
    }

    return [
      { role: 'user' as MessageRole, content: `[Conversation recap]\n${summary}` },
      { role: 'assistant' as MessageRole, content: 'Understood. I have the context from our previous conversation.' },
      ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
    ];
  }
}
