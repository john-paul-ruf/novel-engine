# Architecture Engine

**Requires: Claude Opus.** Sonnet cannot handle this — it loses coherence across the multi-step analysis and session decomposition.

## What It Does

The architecture engine (called "Forge") turns ideas into build plans. You give it a feature request, a spec, a bug report, or even just a sentence describing what you want — and it produces a set of numbered session prompts that an AI agent can execute one by one to build the thing.

*In plain English: it compiles your prompt into an 'executable program' so you don't have to.*

## How It Works

1. **You describe what you want.** Attach docs, paste a feature spec, or just type a sentence.
2. **Forge reads your codebase.** It figures out your stack, your architecture, your modules, your conventions.
3. **Forge breaks the work into sessions.** Each session is a self-contained task (30 min max) that leaves the project in a buildable state.
4. **Forge writes the prompts.** You get numbered `SESSION-01.md`, `SESSION-02.md`, etc. — plus a `MASTER.md` that runs them in order and a `STATE.md` that tracks progress.

## What You Get

```
prompts/session-program/program-NNN/
├── MASTER.md      ← Run this. It loops through sessions automatically.
├── STATE.md       ← Tracks which sessions are done, blocked, or pending.
├── SESSION-01.md  ← First task (usually types/schemas/scaffolding)
├── SESSION-02.md  ← Next task (builds on SESSION-01)
├── SESSION-03.md  ← And so on...
└── input-files/   ← Your original specs/docs (copied here for reference)
```

## Key Ideas

- **Sessions are ordered by dependency.** Types before logic, backend before frontend, core before periphery.
- **Each session stands alone.** An agent can pick it up cold and execute it without asking questions.
- **The project always builds.** After every session, the code compiles and runs. No half-finished states.
- **Forge doesn't write code.** It only writes the plan. A separate agent (or you) executes the sessions.

## When to Use It

- You have a feature that touches multiple files or layers
- You want to break a big task into manageable pieces
- You want repeatable, structured build plans instead of ad-hoc prompting
- You're building something from scratch and need a session-by-session roadmap