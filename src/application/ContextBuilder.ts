import type {
  AgentName,
  AssembledContext,
  ContextDiagnostics,
  CreativeAgentName,
  Message,
  MessageRole,
  ProjectManifest,
} from '@domain/types';
import { AGENT_READ_GUIDANCE, CREATIVE_AGENT_NAMES } from '@domain/constants';
import { TokenEstimator } from './context/TokenEstimator';

/**
 * ContextBuilder — Builds a lean system prompt with a file manifest
 * and compacts conversation history using simple heuristic rules.
 *
 * Replaces the entire ContextWrangler → ManifestBuilder → PlanExecutor pipeline.
 * No AI calls. No file content loading. Just metadata assembly + conversation truncation.
 */
export class ContextBuilder {
  private tokenEstimator = new TokenEstimator();

  /**
   * Build the assembled context for an agent interaction.
   */
  build(params: {
    agentName: AgentName;
    agentSystemPrompt: string;
    manifest: ProjectManifest;
    messages: Message[];
    purposeInstructions?: string;
  }): AssembledContext {
    const { agentName, agentSystemPrompt, manifest, messages, purposeInstructions } = params;

    // 1. Build file manifest section
    const manifestSection = this.buildManifestSection(manifest);

    // 2. Build read guidance section (only for creative agents)
    const guidanceSection = this.buildReadGuidance(agentName);

    // 3. Build file-writing instructions
    const writeInstructions = this.buildFileWriteInstructions();

    // 4. Assemble full system prompt
    const sections = [agentSystemPrompt, '---', manifestSection];
    if (guidanceSection) sections.push(guidanceSection);
    sections.push(writeInstructions);
    if (purposeInstructions) sections.push(purposeInstructions);

    const systemPrompt = sections.join('\n\n');

    // 5. Compact conversation history
    const conversationMessages = this.compactConversation(messages);

    // 6. Build diagnostics
    const addedContent = [manifestSection, guidanceSection ?? '', writeInstructions].join('\n');
    const manifestTokens = this.tokenEstimator.estimate(addedContent);

    const diagnostics: ContextDiagnostics = {
      filesAvailable: manifest.files.map((f) => f.path),
      conversationTurnsSent: conversationMessages.length,
      conversationTurnsDropped: messages.length - conversationMessages.length,
      manifestTokenEstimate: manifestTokens,
    };

    return { systemPrompt, conversationMessages, diagnostics };
  }

  /**
   * Build the file manifest section.
   * Lists all files with word counts so the agent knows what's available to Read.
   */
  private buildManifestSection(manifest: ProjectManifest): string {
    const lines: string[] = [];
    lines.push('## Active Book');
    lines.push('');
    lines.push(`- **Title**: ${manifest.meta.title}`);
    lines.push(`- **Author**: ${manifest.meta.author}`);
    lines.push(`- **Status**: ${manifest.meta.status}`);
    lines.push(`- **Chapters**: ${manifest.chapterCount}`);
    lines.push(`- **Total words**: ${manifest.totalWordCount.toLocaleString()}`);
    lines.push('');
    lines.push('## Project Files');
    lines.push('');
    lines.push('The following files exist in this book\'s directory. Use the **Read** tool to load any files you need for this task. Do not guess at file contents — read them.');
    lines.push('');

    if (manifest.files.length === 0) {
      lines.push('*No files yet — this is a new book.*');
    } else {
      lines.push('| File | Words |');
      lines.push('|------|-------|');
      for (const file of manifest.files) {
        lines.push(`| \`${file.path}\` | ${file.wordCount.toLocaleString()} |`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build per-agent read guidance so the agent knows which files
   * are most relevant to its role.
   */
  private buildReadGuidance(agentName: AgentName): string | null {
    if (!CREATIVE_AGENT_NAMES.includes(agentName as CreativeAgentName)) return null;

    const guidance = AGENT_READ_GUIDANCE[agentName as CreativeAgentName];
    if (!guidance) return null;

    const lines: string[] = [];
    lines.push('## Context Loading Guidance');
    lines.push('');
    lines.push('Based on your role, here is guidance on which files to read:');
    lines.push('');

    if (guidance.alwaysRead.length > 0) {
      lines.push(`- **Always read**: ${guidance.alwaysRead.map((f) => `\`${f}\``).join(', ')}`);
    }
    if (guidance.readIfRelevant.length > 0) {
      lines.push(`- **Read if relevant to this task**: ${guidance.readIfRelevant.map((f) => `\`${f}\``).join(', ')}`);
    }
    if (guidance.neverRead.length > 0) {
      lines.push(`- **Skip** (not your domain): ${guidance.neverRead.map((f) => `\`${f}\``).join(', ')}`);
    }

    lines.push('');
    lines.push('Read the files you need before responding. Use the LS tool to explore chapter directories if needed.');

    return lines.join('\n');
  }

  /**
   * Standard file-writing instructions appended to every agent's system prompt.
   */
  private buildFileWriteInstructions(): string {
    return `## File Writing

You have direct access to read and write files in this book's directory. When the author approves your output, **write it to the appropriate file** — do not just display it in chat.

Key file paths:
- \`source/pitch.md\` — the approved pitch document
- \`source/voice-profile.md\` — the voice profile
- \`source/scene-outline.md\` — the scene-by-scene outline
- \`source/story-bible.md\` — characters, world, lore
- \`source/reader-report.md\` — Ghostlight's reader report
- \`source/dev-report.md\` — Lumen's development report
- \`source/audit-report.md\` — Sable's copy-edit audit
- \`source/project-tasks.md\` — Forge's revision task breakdown
- \`source/revision-prompts.md\` — Forge's per-chapter revision prompts
- \`source/style-sheet.md\` — Sable's style consistency rules
- \`source/metadata.md\` — Quill's publication metadata
- \`chapters/NN-slug/draft.md\` — chapter prose (Verity writes these)
- \`chapters/NN-slug/notes.md\` — chapter notes

**Rules:**
- Always ask for explicit approval before writing/overwriting a file
- For chapters, use the format \`chapters/NN-slug-name/draft.md\`
- Write complete files — never partial updates unless using the Edit tool for targeted fixes
`;
  }

  /**
   * Compact conversation history using simple heuristic rules.
   * No AI calls — just truncation with a context note.
   */
  compactConversation(
    messages: Message[],
  ): { role: MessageRole; content: string }[] {
    const totalTurns = messages.length;

    // Short conversations: keep everything
    if (totalTurns <= 20) {
      return messages.map((m) => ({ role: m.role, content: m.content }));
    }

    // Medium conversations: keep last 8 turns with a note
    if (totalTurns <= 40) {
      const keepCount = 8;
      const droppedCount = totalTurns - keepCount;
      const recent = messages.slice(-keepCount);
      return [
        {
          role: 'user' as MessageRole,
          content: `[${droppedCount} earlier messages omitted for context efficiency. Read the conversation from this point.]`,
        },
        {
          role: 'assistant' as MessageRole,
          content: 'Understood. Continuing from our recent conversation.',
        },
        ...recent.map((m) => ({ role: m.role, content: m.content })),
      ];
    }

    // Long conversations: keep last 6 turns with a note
    const keepCount = 6;
    const droppedCount = totalTurns - keepCount;
    const recent = messages.slice(-keepCount);
    return [
      {
        role: 'user' as MessageRole,
        content: `[${droppedCount} earlier messages omitted for context efficiency. This is a long conversation — focus on the most recent context.]`,
      },
      {
        role: 'assistant' as MessageRole,
        content: 'Understood. Continuing with the recent context.',
      },
      ...recent.map((m) => ({ role: m.role, content: m.content })),
    ];
  }
}
