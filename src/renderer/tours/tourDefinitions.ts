import type { TourId, TourStep } from '@domain/types';

const WELCOME_TOUR: TourStep[] = [
  {
    id: 'welcome-library',
    targetSelector: '[data-tour="library-shelf"]',
    title: 'Your Bookshelf',
    body: 'This is where all your book projects live. Create new books, import existing manuscripts, or pitch a fresh idea with Spark — each book is a card on the shelf.',
    placement: 'bottom',
    requiredView: 'library',
  },
  {
    id: 'welcome-pipeline',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'The Pipeline',
    body: 'Every book follows a pipeline from pitch to publication, and the pipeline IS the navigation: click any phase in this spine to open its workbench. Each phase has a dedicated AI agent, and the active phase is highlighted.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'welcome-chat',
    targetSelector: '[data-tour="chat-view"]',
    title: 'Meet Spark',
    body: "Spark is your story pitcher — we've started a conversation for you. Ask Spark to pitch you a story, or describe your concept and let Spark shape it. The companion pane on the right keeps your chapters, sources, and reports in view while you chat.",
    placement: 'left',
    requiredView: 'workspace',
  },
  {
    id: 'welcome-chat-input',
    targetSelector: '[data-tour="chat-input"]',
    title: 'Chat Input',
    body: 'Type your message here, or use the Quick actions chip for pre-built prompts tailored to the active agent. Hit Enter to send.',
    placement: 'top',
    requiredView: 'workspace',
  },
  {
    id: 'welcome-rail',
    targetSelector: '[data-tour="rail"]',
    title: 'Navigation',
    body: 'The rail switches between Library, Workspace, Manuscript, Exports, Statistics, and Settings. The status bar at the bottom shows live agent activity — and ⌘K opens the command palette from anywhere.',
    placement: 'right',
  },
];

const FIRST_BOOK_TOUR: TourStep[] = [
  {
    id: 'first-book-pitch',
    targetSelector: '[data-tour="pipeline-phase-pitch"]',
    title: 'Start with a Pitch',
    body: 'Spark is your story pitcher. Click this phase in the spine to open its workbench and brainstorm your story concept with Spark.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'first-book-quick-actions',
    targetSelector: '[data-tour="quick-actions"]',
    title: 'Quick Actions',
    body: 'Each agent has pre-built prompts. For Spark, try "Pitch me a story" — it will ask discovery questions and produce a pitch card.',
    placement: 'top',
    requiredView: 'workspace',
  },
  {
    id: 'first-book-advance',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Advancing the Pipeline',
    body: 'When an agent finishes its work, the phase turns amber. Click "Confirm & advance" on the current-phase card (or in the phase header) to confirm and unlock the next phase.',
    placement: 'right',
    requiredView: 'workspace',
  },
];

const PIPELINE_INTRO_TOUR: TourStep[] = [
  {
    id: 'pipeline-overview',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'The 14-Phase Pipeline',
    body: 'Your book moves through 14 phases: from Story Pitch to Publication, grouped into five stages — Conceive, Draft, Assess, Revise, Ship. Each phase is handled by a specialized AI agent.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-agents',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Spark — Story Pitch',
    body: 'Spark helps you discover your story concept through conversation. It produces a pitch card that becomes the foundation for everything else in the pipeline.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-verity',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Verity — The Ghostwriter',
    body: "Verity handles scaffolding (outline + bible), first draft, revisions, and mechanical fixes. She's your primary writing partner across most of the pipeline.",
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-readers',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Ghostlight & Lumen — Readers',
    body: 'Ghostlight gives a cold-read first impression. Lumen provides deep structural analysis. Their reports feed directly into revision planning — find them in the companion pane\'s Reports tab.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-forge',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Forge — Task Master',
    body: 'Forge synthesizes reader feedback into a concrete revision plan with numbered tasks and session prompts for Verity to execute.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-sable',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Sable — Copy Editor',
    body: 'Sable handles grammar, consistency, and style. She produces an audit report and maintains a style sheet to keep the manuscript clean.',
    placement: 'right',
    requiredView: 'workspace',
  },
  {
    id: 'pipeline-build',
    targetSelector: '[data-tour="pipeline-spine"]',
    title: 'Build & Publish',
    body: 'Build exports your manuscript to DOCX, EPUB, and PDF via Pandoc — the Ship stage opens the Exports view. Quill then audits the outputs and prepares publication metadata.',
    placement: 'right',
    requiredView: 'workspace',
  },
];

export const TOUR_DEFINITIONS: Record<TourId, TourStep[]> = {
  'welcome': WELCOME_TOUR,
  'first-book': FIRST_BOOK_TOUR,
  'pipeline-intro': PIPELINE_INTRO_TOUR,
};
