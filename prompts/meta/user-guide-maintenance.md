# Meta Prompt: Keep user_guide.md Current

## Purpose

Run this prompt whenever significant features are added to Novel Engine to keep the user guide accurate.

## Instructions for the Agent

You are updating the Novel Engine user guide. Read the following files to understand the current state of the application:

1. `src/domain/constants.ts` — PIPELINE_PHASES, AGENT_REGISTRY, AGENT_QUICK_ACTIONS
2. `src/renderer/components/Layout/Sidebar.tsx` — current navigation structure
3. `src/renderer/stores/viewStore.ts` — available views
4. `docs/architecture/RENDERER.md` — component inventory (if it exists)
5. The existing `docs/USER_GUIDE.md`

After reading:
1. Identify any features, phases, or UI elements that are described incorrectly or missing from the guide
2. Update `docs/USER_GUIDE.md` to reflect the current state
3. Ensure the following sections exist and are accurate:
   - Getting Started (first book, onboarding)
   - The Pipeline (all 14 phases with descriptions)
   - AI Agents (all 7 + Wrangler + Helper)
   - Views (Chat, Files, Build, Pitch Room, Settings)
   - Advanced Features (revision queue, auto-draft, find & replace, motif ledger)
   - Troubleshooting

Write clean, friendly prose. Audience: non-technical authors. No jargon. Max 3000 words total.