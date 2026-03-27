# ARCH-01 — Extract Prompt Templates from constants.ts

> **Issue:** #2 (constants.ts is a junk drawer — 754 lines)
> **Severity:** Medium-High
> **Effort:** Low
> **Depends on:** Nothing

---

## Objective

Move all long-form prompt template strings out of `src/domain/constants.ts` and into `.md` files in the `agents/` directory, loaded at runtime by `AgentService.loadRaw()`.

The domain layer should contain pure configuration data — not 400+ lines of natural language prompt text. The architecture already has a mechanism for agent prompts as files; these templates should use it.

---

## What to Extract

These exported constants are prompt templates that belong in agent files:

| Constant | Target File | Approx Lines |
|----------|-------------|-------------|
| `VOICE_SETUP_INSTRUCTIONS` | `agents/VOICE-SETUP.md` | ~35 |
| `AUTHOR_PROFILE_INSTRUCTIONS` | `agents/AUTHOR-PROFILE.md` | ~25 |
| `buildPitchRoomInstructions()` | `agents/PITCH-ROOM.md` | ~50 |
| `HOT_TAKE_INSTRUCTIONS` | `agents/HOT-TAKE.md` | ~20 |
| `MOTIF_AUDIT_INSTRUCTIONS` | `agents/MOTIF-AUDIT.md` | ~45 |
| `ADHOC_REVISION_INSTRUCTIONS` | `agents/ADHOC-REVISION.md` | ~15 |
| `REVISION_VERIFICATION_PROMPT` | `agents/REVISION-VERIFICATION.md` | ~15 |
| `VERITY_FIX_INSTRUCTIONS` | `agents/VERITY-FIX.md` | ~30 |
| `WRANGLER_SESSION_PARSE_PROMPT` | `agents/WRANGLER-PARSE.md` | ~50 |

---

## Implementation Steps

### 1. Create the agent prompt files

For each constant above, create the corresponding `.md` file in the agents directory (the directory managed by `AgentService`, located at `{userData}/custom-agents/`).

**Important:** The `buildPitchRoomInstructions()` function is special — it takes a `booksPath` parameter and interpolates it into the template. Convert this to a `.md` file with a `{{BOOKS_PATH}}` placeholder. The caller will do a string replace after loading.

Write the content of each file as the exact string value of the constant, minus the leading/trailing whitespace that the template literals add.

### 2. Update constants.ts

- **Remove** all 9 prompt constant/function declarations listed above.
- **Keep** everything else: `AGENT_REGISTRY`, `PIPELINE_PHASES`, `DEFAULT_SETTINGS`, `AVAILABLE_MODELS`, `AGENT_READ_GUIDANCE`, `AGENT_QUICK_ACTIONS`, `CHARS_PER_TOKEN`, `MAX_CONTEXT_TOKENS`, `CONTEXT_RESERVE_TOKENS`, `TURN_BUDGET_THRESHOLDS`, `TURN_KEEP_COUNTS`, `WRANGLER_MODEL`, `AGENT_RESPONSE_BUFFER`, `FILE_MANIFEST_KEYS`, `VERITY_PHASE_FILES`, `VERITY_LEDGER_FILE`, `VERITY_AUDIT_AGENT_FILE`, `VERITY_AUDIT_MODEL`, `VERITY_AUDIT_MAX_TOKENS`, `VERITY_AUDIT_FIX_THRESHOLD`, `MOTIF_AUDIT_CADENCE`, `HOT_TAKE_MODEL`, `PITCH_ROOM_SLUG`, `CREATIVE_AGENT_NAMES`, status messages (moved separately in ARCH-02), etc.

### 3. Update ChatService.ts

Replace every reference to the removed constants with a call to `this.agents.loadRaw('FILENAME.md')`:

```typescript
// Before:
import { VOICE_SETUP_INSTRUCTIONS } from '@domain/constants';
purposeInstructions = VOICE_SETUP_INSTRUCTIONS;

// After:
purposeInstructions = await this.agents.loadRaw('VOICE-SETUP.md');
```

For `buildPitchRoomInstructions(booksPath)`:
```typescript
// Before:
import { buildPitchRoomInstructions } from '@domain/constants';
let systemPrompt = agent.systemPrompt + buildPitchRoomInstructions(this.fs.getBooksPath());

// After:
let pitchRoomTemplate = await this.agents.loadRaw('PITCH-ROOM.md');
pitchRoomTemplate = pitchRoomTemplate.replace(/\{\{BOOKS_PATH\}\}/g, this.fs.getBooksPath());
let systemPrompt = agent.systemPrompt + '\n\n---\n\n' + pitchRoomTemplate;
```

### 4. Update RevisionQueueService.ts

The `WRANGLER_SESSION_PARSE_PROMPT` is used here. Replace with `this.agents.loadRaw('WRANGLER-PARSE.md')`.

### 5. Update bootstrap.ts

The `ensureAgents()` function copies default agent files. Add the new `.md` files to the list of files it ensures exist. The source defaults should live in a `resources/agents/` directory inside the app bundle.

### 6. Clean up imports

Remove all deleted constant names from import statements in every file that referenced them. Run the TypeScript compiler to verify no dangling references.

---

## Verification

1. `npx tsc --noEmit` passes with zero errors
2. `constants.ts` no longer contains any multi-line template literal strings (prompt text)
3. Every prompt file exists in the agents directory (check `src/main/bootstrap.ts` for the default agent list)
4. `grep -r 'VOICE_SETUP_INSTRUCTIONS\|AUTHOR_PROFILE_INSTRUCTIONS\|buildPitchRoomInstructions\|HOT_TAKE_INSTRUCTIONS\|MOTIF_AUDIT_INSTRUCTIONS\|ADHOC_REVISION_INSTRUCTIONS\|REVISION_VERIFICATION_PROMPT\|VERITY_FIX_INSTRUCTIONS\|WRANGLER_SESSION_PARSE_PROMPT' src/` returns zero hits in `.ts` files
5. `wc -l src/domain/constants.ts` is under 450 lines (status messages still present until ARCH-02)

---

## State Update

After completing this prompt, update `prompts/arch/STATE.md`:
- Set ARCH-01 status to `done`
- Set Completed date
- Add any handoff notes about unexpected complications
