import { useMemo, useState, useCallback } from 'react';
import { marked } from 'marked';
import type { Message, OutputTarget, PipelinePhaseId } from '@domain/types';
import { ThinkingBlock } from './ThinkingBlock';
import { CHARS_PER_TOKEN, AGENT_OUTPUT_TARGETS } from '@domain/constants';
import { useChatStore } from '../../stores/chatStore';
import { useBookStore } from '../../stores/bookStore';
import { usePipelineStore } from '../../stores/pipelineStore';

marked.setOptions({ breaks: true, gfm: true });

type SaveState = {
  savedPath?: string;
  error?: string;
  saving?: boolean;
};

type MessageBubbleProps = {
  message: Message;
};

export function MessageBubble({ message }: MessageBubbleProps): React.ReactElement {
  const isUser = message.role === 'user';
  const hasThinking = message.thinking.length > 0;

  const activeConversation = useChatStore((s) => s.activeConversation);
  const activeSlug = useBookStore((s) => s.activeSlug);
  const loadPipeline = usePipelineStore((s) => s.loadPipeline);

  // Per-target save state for this message
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});

  // Chapter slug input state (shown when isChapter target is clicked)
  const [chapterSlugInput, setChapterSlugInput] = useState<string>('');
  const [activeChapterTarget, setActiveChapterTarget] = useState<string | null>(null);

  const renderedHtml = useMemo(() => {
    if (isUser) return '';
    return String(marked.parse(message.content));
  }, [message.content, isUser]);

  const thinkingTokenEstimate = hasThinking
    ? Math.round(message.thinking.length / CHARS_PER_TOKEN)
    : undefined;

  // Determine output targets for this message based on purpose OR pipeline phase
  const pipelinePhase = activeConversation?.pipelinePhase ?? null;
  const conversationPurpose = activeConversation?.purpose ?? 'pipeline';
  const targets: OutputTarget[] = useMemo(() => {
    if (conversationPurpose === 'voice-setup') {
      return [{ targetPath: 'source/voice-profile.md', description: 'Save as Voice Profile' }];
    }
    if (conversationPurpose === 'author-profile') {
      return [{ targetPath: '__author-profile__', description: 'Save as Author Profile' }];
    }
    if (!pipelinePhase) return [];
    return AGENT_OUTPUT_TARGETS[pipelinePhase] ?? [];
  }, [pipelinePhase, conversationPurpose]);

  const handleSave = useCallback(async (target: OutputTarget, chapterSlug?: string) => {
    setSaveStates((prev) => ({
      ...prev,
      [target.targetPath]: { saving: true },
    }));

    try {
      if (target.targetPath === '__author-profile__') {
        // Author profile saves via settings IPC (global, not per-book)
        await window.novelEngine.settings.saveAuthorProfile(message.content);
        setSaveStates((prev) => ({
          ...prev,
          [target.targetPath]: { savedPath: 'author-profile.md' },
        }));
      } else if (activeSlug) {
        if (conversationPurpose === 'voice-setup') {
          // Voice profile saves via file write (per-book)
          await window.novelEngine.files.write(activeSlug, target.targetPath, message.content);
          setSaveStates((prev) => ({
            ...prev,
            [target.targetPath]: { savedPath: target.targetPath },
          }));
          // Refresh pipeline — voice profile may affect detection
          await loadPipeline(activeSlug);
        } else if (pipelinePhase) {
          // Standard pipeline save via FilePersistenceService
          const result = await window.novelEngine.chat.saveToFile({
            bookSlug: activeSlug,
            pipelinePhase,
            targetPath: target.targetPath,
            content: message.content,
            chapterSlug,
          });
          setSaveStates((prev) => ({
            ...prev,
            [target.targetPath]: { savedPath: result.savedPath },
          }));
          await loadPipeline(activeSlug);
        }
      }

      // Clear chapter input state
      setActiveChapterTarget(null);
      setChapterSlugInput('');
    } catch (error) {
      setSaveStates((prev) => ({
        ...prev,
        [target.targetPath]: {
          error: error instanceof Error ? error.message : 'Failed to save file',
        },
      }));
    }
  }, [activeSlug, pipelinePhase, conversationPurpose, message.content, loadPipeline]);

  const handleChapterTargetClick = useCallback((target: OutputTarget) => {
    if (activeChapterTarget === target.targetPath) {
      // Toggle off
      setActiveChapterTarget(null);
      setChapterSlugInput('');
    } else {
      setActiveChapterTarget(target.targetPath);
      setChapterSlugInput('');
    }
  }, [activeChapterTarget]);

  const handleChapterSave = useCallback((target: OutputTarget) => {
    if (!chapterSlugInput.trim()) return;
    handleSave(target, chapterSlugInput.trim());
  }, [chapterSlugInput, handleSave]);

  if (isUser) {
    return (
      <div className="flex justify-end px-6 py-2">
        <div className="max-w-2xl rounded-2xl bg-blue-600 px-4 py-3 text-white">
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        </div>
      </div>
    );
  }

  const showSaveButtons = !isUser && targets.length > 0;

  return (
    <div className="flex justify-start px-6 py-2">
      <div className="max-w-3xl">
        {hasThinking && (
          <ThinkingBlock
            content={message.thinking}
            isStreaming={false}
            tokenEstimate={thinkingTokenEstimate}
          />
        )}
        <div className="rounded-2xl bg-zinc-800 px-4 py-3 text-zinc-100">
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </div>
        {showSaveButtons && (
          <div className="mt-2">
            <div className="flex justify-end gap-2 flex-wrap">
              {targets.map((target) => {
                const state = saveStates[target.targetPath];
                const isSaved = !!state?.savedPath;
                const isSaving = !!state?.saving;

                return (
                  <div key={target.targetPath} className="flex flex-col items-end">
                    <button
                      type="button"
                      disabled={isSaved || isSaving}
                      className={`text-sm rounded px-3 py-1 border transition-colors ${
                        isSaved
                          ? 'text-green-400 border-green-700 cursor-default'
                          : isSaving
                            ? 'text-zinc-500 border-zinc-700 cursor-wait'
                            : 'text-zinc-400 hover:text-zinc-200 border-zinc-700 hover:border-zinc-500'
                      }`}
                      onClick={() => {
                        if (target.isChapter) {
                          handleChapterTargetClick(target);
                        } else {
                          handleSave(target);
                        }
                      }}
                    >
                      {isSaved ? 'Saved ✓' : isSaving ? 'Saving...' : target.description}
                    </button>

                    {/* Chapter slug input — shown inline when a chapter target is clicked */}
                    {target.isChapter && activeChapterTarget === target.targetPath && !isSaved && (
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="text"
                          value={chapterSlugInput}
                          onChange={(e) => setChapterSlugInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleChapterSave(target);
                            if (e.key === 'Escape') {
                              setActiveChapterTarget(null);
                              setChapterSlugInput('');
                            }
                          }}
                          placeholder="01-chapter-slug"
                          className="rounded bg-zinc-900 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500 w-40"
                          autoFocus
                        />
                        <button
                          type="button"
                          disabled={!chapterSlugInput.trim()}
                          className="text-xs rounded px-2 py-1 bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleChapterSave(target)}
                        >
                          Save
                        </button>
                      </div>
                    )}

                    {/* Success message */}
                    {state?.savedPath && (
                      <span className="mt-1 text-xs text-green-400">
                        Saved to {state.savedPath}
                      </span>
                    )}

                    {/* Error message */}
                    {state?.error && (
                      <span className="mt-1 text-xs text-red-400">
                        {state.error}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
