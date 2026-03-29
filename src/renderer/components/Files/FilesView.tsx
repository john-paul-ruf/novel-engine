import { useState, useEffect, useCallback } from 'react';
import { marked } from 'marked';
import { useViewStore } from '../../stores/viewStore';
import { useBookStore } from '../../stores/bookStore';
import { useChatStore } from '../../stores/chatStore';
import { FilesHeader } from './FilesHeader';
import { FileBrowser } from './FileBrowser';
import { FileEditor } from './FileEditor';
import { SourcePanel } from './SourcePanel';
import { AgentOutputPanel } from './AgentOutputPanel';
import { ChaptersPanel } from './ChaptersPanel';
import { VersionHistoryPanel } from './VersionHistoryPanel';
import { FindReplaceModal } from './FindReplaceModal';
import { MotifLedgerView } from '../MotifLedger/MotifLedgerView';
import { AboutJsonViewer, useOpenSpark } from './AboutJsonViewer';
import type { FileViewMode } from '../../stores/viewStore';

// Configure marked for safe rendering
marked.setOptions({ async: false });

/**
 * Returns true for Verity-authored chapter drafts (body chapters 02+).
 * These files are read-only in the UI — changes must be made via chat with Verity.
 */
function isVerityDraft(path: string): boolean {
  const match = path.match(/^chapters\/(\d+)-[^/]+\/draft\.md$/);
  return match !== null && parseInt(match[1], 10) >= 2;
}

/** Returns true if the path is any chapter draft (chapter 01 included). */
function isChapterDraft(path: string): boolean {
  return /^chapters\/\d+-.+\/draft\.md$/.test(path);
}

/** Extracts the chapter slug (e.g. "01-intro") from a chapter draft path. */
function extractChapterSlug(path: string): string | null {
  const match = path.match(/^chapters\/(\d+-.+)\/draft\.md$/);
  return match?.[1] ?? null;
}

function MarkdownViewer({ content }: { content: string }): React.ReactElement {
  const html = marked.parse(content) as string;
  return (
    <div
      className="prose prose-lg dark:prose-invert prose-zinc max-w-none prose-p:my-4 prose-p:leading-relaxed prose-hr:my-10 prose-hr:border-zinc-300 dark:prose-hr:border-zinc-700 prose-h1:mt-12 prose-h1:mb-6 prose-blockquote:my-6"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function FilesView(): React.ReactElement {
  const { payload, navigate } = useViewStore();
  const { activeSlug } = useBookStore();

  const viewMode: FileViewMode = payload.fileViewMode ?? (payload.filePath ? 'reader' : 'browser');
  const filePath = payload.filePath ?? null;
  const browserPath = payload.fileBrowserPath ?? '';

  // "Chat with Spark" for about.json — creates a Spark conversation and navigates
  const handleOpenSpark = useOpenSpark(activeSlug);

  // Chapter Deep Dive — triggers a scoped Lumen analysis of the selected chapter draft
  const [isDeepDiving, setIsDeepDiving] = useState(false);

  const handleDeepDive = useCallback(async () => {
    if (!activeSlug || !filePath) return;
    const chapterSlug = extractChapterSlug(filePath);
    if (!chapterSlug) return;

    setIsDeepDiving(true);
    try {
      const callId = crypto.randomUUID();

      // Create the Lumen conversation in the chatStore (sets activeConversation)
      await useChatStore.getState().createConversation('Lumen', activeSlug, null, 'pipeline');
      const { activeConversation } = useChatStore.getState();
      if (!activeConversation) return;
      const conversationId = activeConversation.id;

      // Attach stream listener before firing so we don't miss early events
      useChatStore.getState().attachToExternalStream(callId, conversationId);

      // Navigate to chat — ChatView will mount with the active Lumen conversation
      navigate('chat');

      // Fire and forget — stream events arrive via chat:streamEvent broadcast
      void window.novelEngine.chat.deepDive({
        bookSlug: activeSlug,
        chapterSlug,
        conversationId,
        callId,
      });
    } catch (err) {
      console.error('[DeepDive] Failed:', err);
    } finally {
      setIsDeepDiving(false);
    }
  }, [activeSlug, filePath, navigate]);

  type FilesTab = 'source' | 'chapters' | 'agents' | 'explorer' | 'ledger';

  const TABS: { id: FilesTab; label: string; icon: string }[] = [
    { id: 'source', label: 'Source', icon: '📋' },
    { id: 'chapters', label: 'Chapters', icon: '📖' },
    { id: 'agents', label: 'Agents', icon: '🤖' },
    { id: 'explorer', label: 'Explorer', icon: '📁' },
    { id: 'ledger', label: 'Motif Ledger', icon: '🧬' },
  ];

  const [activeTab, setActiveTab] = useState<FilesTab>('source');

  // File content state (for reader mode)
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close history panel when file changes
  useEffect(() => {
    setShowHistory(false);
  }, [filePath]);

  // Load file when filePath changes (for reader mode)
  useEffect(() => {
    if (!filePath || !activeSlug) {
      setContent('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    window.novelEngine.files
      .read(activeSlug, filePath)
      .then((result) => {
        if (!cancelled) {
          setContent(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setContent('');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, activeSlug]);

  // View mode handlers
  const handleBrowse = useCallback(
    (dirPath: string) => {
      navigate('files', {
        fileBrowserPath: dirPath,
        fileViewMode: 'browser',
        filePath: filePath ?? undefined,
      });
    },
    [navigate, filePath],
  );

  const handleFileSelect = useCallback(
    (path: string) => {
      navigate('files', { filePath: path, fileViewMode: 'reader' });
    },
    [navigate],
  );

  const handleBackToBrowser = useCallback(() => {
    const parentDir = filePath ? filePath.split('/').slice(0, -1).join('/') : '';
    navigate('files', {
      fileBrowserPath: parentDir,
      fileViewMode: 'browser',
      filePath: filePath ?? undefined,
    });
  }, [navigate, filePath]);

  const handleModeChange = useCallback(
    (mode: FileViewMode) => {
      if (mode === 'browser') {
        const parentDir = filePath ? filePath.split('/').slice(0, -1).join('/') : browserPath;
        navigate('files', {
          fileBrowserPath: parentDir,
          fileViewMode: 'browser',
          filePath: filePath ?? undefined,
        });
      } else if (mode === 'reader') {
        navigate('files', {
          filePath: filePath ?? undefined,
          fileViewMode: 'reader',
          fileBrowserPath: browserPath || undefined,
        });
      } else if (mode === 'editor') {
        // Verity-authored chapter drafts are read-only — block editor mode entirely.
        if (filePath && isVerityDraft(filePath)) return;
        navigate('files', {
          filePath: filePath ?? undefined,
          fileViewMode: 'editor',
          fileBrowserPath: browserPath || undefined,
        });
      }
    },
    [navigate, filePath, browserPath],
  );

  const handleEdit = useCallback(() => {
    // Guard is also present in handleModeChange, but be explicit here for safety.
    if (filePath && isVerityDraft(filePath)) return;
    handleModeChange('editor');
  }, [handleModeChange, filePath]);

  const handleSaveFile = useCallback(
    async (newContent: string) => {
      if (!filePath || !activeSlug) return;
      await window.novelEngine.files.write(activeSlug, filePath, newContent);
      setContent(newContent);
    },
    [filePath, activeSlug],
  );

  const [showHistory, setShowHistory] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const handleDeleteFile = useCallback(() => {
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!filePath || !activeSlug) return;
    setDeleteInProgress(true);
    try {
      await window.novelEngine.files.delete(activeSlug, filePath);
      setShowDeleteConfirm(false);
      handleBackToBrowser();
    } catch (err) {
      console.error('Failed to delete file:', err);
    } finally {
      setDeleteInProgress(false);
    }
  }, [filePath, activeSlug, handleBackToBrowser]);

  const readOnly = !!filePath && isVerityDraft(filePath);

  const deleteFileName = filePath ? filePath.split('/').pop() ?? filePath : '';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1 px-3 py-2 text-xs sm:text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'ledger' ? (
        <div className="flex-1 min-h-0">
          <MotifLedgerView />
        </div>
      ) : (
        <>
          {(viewMode === 'reader' || viewMode === 'editor') ? (
            <>
              <FilesHeader
                viewMode={viewMode}
                filePath={filePath}
                browserPath={browserPath}
                onModeChange={handleModeChange}
                onBrowse={handleBrowse}
                onBackToBrowser={handleBackToBrowser}
                onEdit={handleEdit}
                onDelete={filePath ? handleDeleteFile : undefined}
                readOnly={readOnly}
                onFindReplace={() => setShowFindReplace(true)}
                onDeepDive={handleDeepDive}
                isDeepDiving={isDeepDiving}
                isChapterDraftFile={!!filePath && isChapterDraft(filePath)}
              />

              {viewMode === 'reader' && filePath === 'about.json' && activeSlug && (
                <AboutJsonViewer
                  bookSlug={activeSlug}
                  onEdit={handleEdit}
                  onOpenSpark={handleOpenSpark}
                />
              )}

              {viewMode === 'reader' && filePath !== 'about.json' && (
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  <div className={`flex flex-col overflow-hidden ${showHistory ? 'w-1/2' : 'flex-1'}`}>
                    {filePath && !loading && !error && (
                      <div className="shrink-0 flex items-center justify-end border-b border-zinc-200 dark:border-zinc-800 px-6 py-1.5">
                        <button
                          onClick={() => setShowHistory(!showHistory)}
                          className={`rounded px-2.5 py-1 text-xs transition-colors ${
                            showHistory
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
                          }`}
                          title="Version history"
                        >
                          <svg className="w-3.5 h-3.5 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          History
                        </button>
                      </div>
                    )}
                    <ReaderContent
                      filePath={filePath}
                      content={content}
                      loading={loading}
                      error={error}
                      activeSlug={activeSlug}
                      readOnly={readOnly}
                      onFileSelect={handleFileSelect}
                      onClearFile={handleBackToBrowser}
                      onContentChange={setContent}
                    />
                  </div>

                  {showHistory && activeSlug && filePath && (
                    <div className="w-1/2 border-l border-zinc-200 dark:border-zinc-800">
                      <VersionHistoryPanel
                        bookSlug={activeSlug}
                        filePath={filePath}
                        onClose={() => setShowHistory(false)}
                        onReverted={() => {
                          window.novelEngine.files.read(activeSlug, filePath).then((newContent) => {
                            setContent(newContent);
                          }).catch((err) => console.error('Failed to reload after revert:', err));
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {viewMode === 'editor' && filePath && !loading && !readOnly && (
                <div className="flex-1 min-h-0">
                  <FileEditor
                    filePath={filePath}
                    initialContent={content}
                    onSave={handleSaveFile}
                    onClose={() => handleModeChange('reader')}
                  />
                </div>
              )}
              {viewMode === 'editor' && readOnly && (
                <ReaderContent
                  filePath={filePath}
                  content={content}
                  loading={loading}
                  error={error}
                  activeSlug={activeSlug}
                  readOnly={readOnly}
                  onFileSelect={handleFileSelect}
                  onClearFile={handleBackToBrowser}
                  onContentChange={setContent}
                />
              )}
            </>
          ) : (
            <>
              {activeTab === 'source' && (
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  <div className="mb-6">
                    <button
                      onClick={() => handleFileSelect('about.json')}
                      className="group w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-400 dark:hover:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">📘</span>
                        <div>
                          <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Book Info</div>
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

          {showFindReplace && activeSlug && (
            <FindReplaceModal onClose={() => setShowFindReplace(false)} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * The reader content — handles loading states, markdown rendering, and raw content display.
 * Note: about.json is intercepted upstream and rendered by AboutJsonViewer instead.
 */
function ReaderContent({
  filePath,
  content,
  loading,
  error,
  activeSlug: _activeSlug,
  readOnly,
  onFileSelect: _onFileSelect,
  onClearFile,
  onContentChange: _onContentChange,
}: {
  filePath: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  activeSlug: string;
  readOnly?: boolean;
  onFileSelect: (path: string) => void;
  onClearFile: () => void;
  onContentChange: (updated: string) => void;
}): React.ReactElement {
  if (!filePath) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">Select a file to view</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <div className="text-red-600 dark:text-red-400">Failed to load file</div>
        <div className="text-sm text-zinc-500">{error}</div>
        <button
          onClick={onClearFile}
          className="mt-2 rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          Back
        </button>
      </div>
    );
  }

  const isMarkdown = filePath.endsWith('.md');
  const isJson = filePath.endsWith('.json');

  return (
    <>
      {/* Read-only notice for Verity-authored chapter drafts */}
      {readOnly && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-6 py-2">
          <span className="text-amber-500" aria-hidden>🔒</span>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            <strong>Verity's draft — read-only.</strong>{' '}
            To revise this chapter, open the <strong>Chat</strong> view and ask Verity directly.
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isMarkdown ? (
          <MarkdownViewer content={content} />
        ) : isJson ? (
          <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-700 dark:text-zinc-300">{formatJson(content)}</pre>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-sm text-zinc-700 dark:text-zinc-300">{content}</pre>
        )}
      </div>

      {/* Footer — word count for markdown */}
      {isMarkdown && content && (
        <div className="shrink-0 border-t border-zinc-200 dark:border-zinc-800 px-8 py-2 text-right text-xs text-zinc-500">
          {countWords(content).toLocaleString()} words
        </div>
      )}
    </>
  );
}
