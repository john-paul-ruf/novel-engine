import type { TourId, TourStep } from '@domain/types';

const WELCOME_TOUR: TourStep[] = [
  {
    id: 'welcome-book-selector',
    targetSelector: '[data-tour="book-selector"]',
    title: 'Your Books',
    body: 'This is where all your book projects live. Create new books, switch between projects, or import existing manuscripts.',
    placement: 'right',
  },
  {
    id: 'welcome-pipeline',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'The Pipeline',
    body: 'Every book follows a pipeline from pitch to publication. Each phase has a dedicated AI agent. The Pipeline panel on the right shows your progress — the active phase is highlighted.',
    placement: 'left',
  },
  {
    id: 'welcome-file-tree',
    targetSelector: '[data-tour="file-tree"]',
    title: 'Project Files',
    body: 'All your manuscript files, outlines, reports, and source documents. Click any file to read or edit it.',
    placement: 'right',
  },
  {
    id: 'welcome-chat',
    targetSelector: '[data-tour="chat-view"]',
    title: 'Meet Spark',
    body: "Spark is your story pitcher — we've started a conversation for you. Ask Spark to pitch you a story, or describe your concept and let Spark shape it.",
    placement: 'left',
    requiredView: 'chat',
  },
  {
    id: 'welcome-chat-input',
    targetSelector: '[data-tour="chat-input"]',
    title: 'Chat Input',
    body: 'Type your message here, or use the Quick Actions menu for pre-built prompts tailored to the active agent. Hit Enter to send.',
    placement: 'top',
    requiredView: 'chat',
  },
  {
    id: 'welcome-nav',
    targetSelector: '[data-tour="sidebar-nav"]',
    title: 'Navigation',
    body: 'Switch between Chat, Files, Build, Pitch Room, Reading Mode, and Settings. Use the Pipeline and CLI toggles to open the right-side panels.',
    placement: 'right',
  },
];

const FIRST_BOOK_TOUR: TourStep[] = [
  {
    id: 'first-book-pitch',
    targetSelector: '[data-tour="pipeline-phase-pitch"]',
    title: 'Start with a Pitch',
    body: 'Spark is your story pitcher. Click this phase to open a conversation with Spark and brainstorm your story concept.',
    placement: 'right',
  },
  {
    id: 'first-book-quick-actions',
    targetSelector: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    body: 'Each agent has pre-built prompts. For Spark, try "Pitch me a story" — it will ask discovery questions and produce a pitch card.',
    placement: 'top',
    requiredView: 'chat',
  },
  {
    id: 'first-book-advance',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Advancing the Pipeline',
    body: 'When an agent finishes its work, the phase turns amber. In the Pipeline panel on the right, click "Advance" to confirm and unlock the next phase.',
    placement: 'left',
  },
];

const PIPELINE_INTRO_TOUR: TourStep[] = [
  {
    id: 'pipeline-overview',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'The 14-Phase Pipeline',
    body: 'Your book moves through 14 phases: from Story Pitch to Publication. Each phase is handled by a specialized AI agent.',
    placement: 'left',
  },
  {
    id: 'pipeline-agents',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Spark — Story Pitch',
    body: 'Spark helps you discover your story concept through conversation. It produces a pitch card that becomes the foundation for everything else in the pipeline.',
    placement: 'left',
  },
  {
    id: 'pipeline-verity',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Verity — The Ghostwriter',
    body: "Verity handles scaffolding (outline + bible), first draft, revisions, and mechanical fixes. She's your primary writing partner across most of the pipeline.",
    placement: 'left',
  },
  {
    id: 'pipeline-readers',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Ghostlight & Lumen — Readers',
    body: 'Ghostlight gives a cold-read first impression. Lumen provides deep structural analysis. Their reports feed directly into revision planning.',
    placement: 'left',
  },
  {
    id: 'pipeline-forge',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Forge — Task Master',
    body: 'Forge synthesizes reader feedback into a concrete revision plan with numbered tasks and session prompts for Verity to execute.',
    placement: 'left',
  },
  {
    id: 'pipeline-sable',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Sable — Copy Editor',
    body: 'Sable handles grammar, consistency, and style. She produces an audit report and maintains a style sheet to keep the manuscript clean.',
    placement: 'left',
  },
  {
    id: 'pipeline-build',
    targetSelector: '[data-tour="pipeline-panel"]',
    title: 'Build & Publish',
    body: 'Build exports your manuscript to DOCX, EPUB, and PDF via Pandoc. Quill then audits the outputs and prepares publication metadata.',
    placement: 'left',
  },
];

export const TOUR_DEFINITIONS: Record<TourId, TourStep[]> = {
  'welcome': WELCOME_TOUR,
  'first-book': FIRST_BOOK_TOUR,
  'pipeline-intro': PIPELINE_INTRO_TOUR,
};
