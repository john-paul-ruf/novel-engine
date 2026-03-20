# Novel Engine

A standalone desktop app for AI-assisted novel writing. Uses Claude to orchestrate
seven specialized agents through a structured publishing pipeline.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- npm 9+

## Development

```bash
npm install
npm run download-pandoc
npm start
```

## Build

```bash
# Package the app (no installer)
npm run package

# Create platform-specific installers
npm run make
```

## Architecture

See `prompts/00-MASTER-GUIDE.md` for the full architecture documentation.

The app follows Clean Architecture with five layers:

```
DOMAIN <- INFRASTRUCTURE <- APPLICATION <- IPC/MAIN <- RENDERER
```

- **Domain** — Pure types, interfaces, constants (zero imports)
- **Infrastructure** — Concrete implementations (database, filesystem, Claude CLI)
- **Application** — Business logic services (chat, pipeline, build, context wrangler)
- **Main/IPC** — Electron main process, composition root, IPC handlers
- **Renderer** — React UI with Zustand stores

## Agents

Novel Engine uses seven specialized AI agents:

| Agent | Role |
|-------|------|
| **Spark** | Story ideation and pitch development |
| **Verity** | Prose writing (the only agent that writes chapters) |
| **Ghostlight** | Cold reader — unbiased manuscript assessment |
| **Lumen** | Development editor — structural and narrative analysis |
| **Sable** | Copy editor — line-level polish and consistency |
| **Forge** | Project manager — revision planning |
| **Quill** | Metadata and publishing preparation |

## License

See [LICENSE](LICENSE) for details.
