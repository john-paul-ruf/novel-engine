import { nanoid } from 'nanoid';
import type {
  ISourceGenerationService,
  IAgentService,
  IDatabaseService,
  IFileSystemService,
  IProviderRegistry,
  ISettingsService,
} from '@domain/interfaces';
import type {
  SourceGenerationEvent,
  SourceGenerationStep,
  StreamEvent,
  AgentName,
} from '@domain/types';
import { AGENT_REGISTRY } from '@domain/constants';
import { ContextBuilder } from './ContextBuilder';

type GenerationStep = {
  label: string;
  agentName: AgentName;
  prompt: string;
};

const GENERATION_STEPS: GenerationStep[] = [
  {
    label: 'Generating pitch',
    agentName: 'Spark',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory from beginning to end. Then produce a complete pitch card and write it to source/pitch.md. Include: title, genre, logline, themes, central conflict, protagonist, antagonist/antagonistic force, stakes, and hook.',
  },
  {
    label: 'Generating outline & story bible',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory from beginning to end. Then generate two source documents:\n\n1. **source/scene-outline.md** — A chapter-by-chapter structural plan. For each chapter: number, title, scene beats, POV character, timeline placement, and dramatic purpose.\n\n2. **source/story-bible.md** — Characters (name, role, arc, wants, needs, flaws, key relationships), world rules, locations (with descriptions), and a timeline of major events.\n\nBe thorough — these documents will guide the editorial pipeline.',
  },
  {
    label: 'Generating voice profile',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory, paying close attention to prose style. Then generate source/voice-profile.md covering:\n\n- Sentence rhythm patterns (length variation, fragment use, compound structures)\n- Vocabulary tendencies (register, recurring words, domain-specific language)\n- POV approach (distance, interiority, tense)\n- Dialogue voice (attribution patterns, dialect handling, subtext style)\n- Tonal range (humor, gravity, lyricism, restraint)\n- Narrative habits (scene entry/exit patterns, transition style, exposition technique)\n- Distinctive signatures (any unique stylistic fingerprints)\n\nThis profile will be used to maintain voice consistency during revisions.',
  },
  {
    label: 'Generating motif ledger',
    agentName: 'Verity',
    prompt: 'This book was imported from an existing manuscript. Read every chapter in the chapters/ directory. Then create source/motif-ledger.json with the following JSON structure:\n\n```json\n{\n  "systems": [...],\n  "entries": [...],\n  "structuralDevices": [...],\n  "foreshadows": [...],\n  "minorCharacters": [...],\n  "flaggedPhrases": [...],\n  "auditLog": [...]\n}\n```\n\nCatalog all recurring motifs and symbols (with character associations, first appearances, and occurrences by chapter). Document structural devices (framing, mirroring, callbacks). Track foreshadowing threads (planted vs paid-off vs abandoned). Note minor character motifs. Flag any overused phrases, crutch words, or anti-patterns. Each entry needs a unique nanoid-style ID string.\n\nBe comprehensive — this ledger drives the motif audit system.',
  },
];

/**
 * SourceGenerationService — Orchestrates multi-agent source document generation
 * for imported manuscripts.
 *
 * Runs 4 sequential agent calls (Spark for pitch, Verity for outline/bible/voice/motif)
 * with per-step progress reporting. Individual step errors are caught and reported
 * without aborting the remaining steps.
 *
 * Follows the same pattern as RevisionQueueService: depends on injected interfaces
 * and uses IProviderRegistry.sendMessage() for each CLI call.
 */
export class SourceGenerationService implements ISourceGenerationService {
  constructor(
    private settings: ISettingsService,
    private agents: IAgentService,
    private db: IDatabaseService,
    private fs: IFileSystemService,
    private providers: IProviderRegistry,
  ) {}

  async generate(params: {
    bookSlug: string;
    onProgress: (event: SourceGenerationEvent) => void;
    onStreamEvent: (event: StreamEvent) => void;
  }): Promise<void> {
    const { bookSlug, onProgress, onStreamEvent } = params;

    // Build initial step list
    const steps: SourceGenerationStep[] = GENERATION_STEPS.map((s, i) => ({
      index: i,
      label: s.label,
      agentName: s.agentName,
      status: 'pending' as const,
    }));

    onProgress({ type: 'started', steps });

    const appSettings = await this.settings.load();
    const contextBuilder = new ContextBuilder();

    for (let i = 0; i < GENERATION_STEPS.length; i++) {
      const step = GENERATION_STEPS[i];

      onProgress({ type: 'step-started', index: i });

      try {
        // Load the agent
        const agent = await this.agents.load(step.agentName);

        // Create a conversation for this step
        const conversation = this.db.createConversation({
          id: nanoid(),
          bookSlug,
          agentName: step.agentName,
          pipelinePhase: null,
          purpose: 'pipeline',
          title: step.label,
        });

        // Save the user message
        this.db.saveMessage({
          conversationId: conversation.id,
          role: 'user',
          content: step.prompt,
          thinking: '',
        });

        // Build context (manifest + system prompt)
        const manifest = await this.fs.getProjectManifest(bookSlug);
        const messages = this.db.getMessages(conversation.id);
        const context = contextBuilder.build({
          agentName: step.agentName,
          agentSystemPrompt: agent.systemPrompt,
          manifest,
          messages,
        });

        // Accumulate the response
        let responseText = '';
        let thinkingText = '';
        const sessionId = nanoid();

        const agentMeta = AGENT_REGISTRY[step.agentName];

        await this.providers.sendMessage({
          model: appSettings.model,
          systemPrompt: context.systemPrompt,
          messages: context.conversationMessages,
          maxTokens: appSettings.maxTokens,
          thinkingBudget: appSettings.enableThinking
            ? (agentMeta?.thinkingBudget ?? 4000)
            : undefined,
          maxTurns: agentMeta?.maxTurns ?? 10,
          bookSlug,
          sessionId,
          conversationId: conversation.id,
          onEvent: (event) => {
            if (event.type === 'textDelta') responseText += event.text;
            if (event.type === 'thinkingDelta') thinkingText += event.text;
            onStreamEvent(event);
          },
        });

        // Save the assistant response
        if (responseText.trim()) {
          this.db.saveMessage({
            conversationId: conversation.id,
            role: 'assistant',
            content: responseText,
            thinking: thinkingText,
          });
        }

        onProgress({ type: 'step-done', index: i });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onProgress({ type: 'step-error', index: i, message });
        // Continue to next step — partial generation is better than nothing
      }
    }

    onProgress({ type: 'done' });
  }
}
