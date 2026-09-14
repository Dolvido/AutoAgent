# AutoAgent

A local code-review prototype built with Next.js, TypeScript, LangChain and Ollama. It explores structured critiques, stored feedback, retrieval of earlier examples, and proposed fixes.

**Status:** experimental portfolio project. The core critique flow has real local-model integration; the broader ticket, patch and orchestration workflows are still experimental. This is a continuation of [AutoCritic](https://github.com/Dolvido/AutoCritic).

## Implemented components

- A React code editor, file/codebase input and structured issue cards.
- A Next.js critique endpoint backed by Ollama, with JSON parsing and issue normalization.
- SQLite storage for critiques, feedback, prompt versions and feedback metrics.
- Retrieval of earlier code examples using Ollama embeddings and an exact in-memory cosine index, persisted as JSON.
- Feedback analysis and prompt-generation routines, plus an [evaluation reporting script](scripts/evaluate-agent-performance.ts).
- Experimental code-inspection tools, virtual tickets and fix/patch workflows.

Feedback acceptance is a useful signal, but this repository does not demonstrate a measured improvement in review correctness. Prompt adaptation is an experiment, not a guarantee that the model improves over time.

## Architecture

| Component | Current implementation |
| --- | --- |
| Application and API | Next.js 14, React, TypeScript, Tailwind CSS |
| Code input | React textarea editor; code/file inputs |
| Local inference | Ollama through LangChain |
| Critique and feedback storage | SQLite |
| Critique-example retrieval | Cosine search over in-memory vectors; JSON persistence |
| Other retrieval experiments | Chroma integration in `src/lib/code-rag.ts` |
| Code inspection | Tree-sitter helpers for JavaScript, TypeScript and Python |

The critique-example store does not use FAISS. The dependency manifest still includes libraries from earlier experiments.

## Local setup

The application was developed with Node.js 18+ and local Ollama. The focused regression tests below require **Node.js 22.18+** for built-in TypeScript stripping. Native SQLite dependencies may require platform build tools.

```bash
git clone https://github.com/Dolvido/AutoAgent.git
cd AutoAgent
npm ci
ollama pull codellama
ollama pull llama3
npm run dev
```

Start Ollama before launching the app, then open [localhost:3000](http://localhost:3000). The default local service is `http://localhost:11434`. On Windows, `setup-ollama.ps1` offers an interactive model-download helper.

The development/build scripts copy Tree-sitter WASM assets. If that step fails, inspect `scripts/copy-wasm.js` and the installed grammar packages rather than skipping the error. The tool-based critique agent also has its own model configuration in `src/lib/agents/critique-agent.ts`; review it before using that experimental path.

Data is written under `data/`. The critique-example store re-embeds saved text on startup; it rejects unavailable or invalid embeddings and does not create random substitutes. Keep Ollama and the configured model available when using stored examples.

## Focused checks

These tests use deterministic fake embedding providers. They do not download models or require application dependencies.

```bash
npm run test:vector-store
```

They cover cosine ordering, provider failures, invalid embeddings, dimensional consistency and atomic insertion. They do **not** validate the full Next.js build, native dependencies, live inference, patch application or review quality.

## Current boundaries

- Run this as a local development application. The filesystem and Git endpoints are not a hardened multi-user service.
- Review proposed changes before applying them. The generic `AgentOrchestrator` helper still contains a placeholder critique; it is not evidence of a complete autonomous workflow.
- The main critique endpoint returns an error when model/retrieval requests fail. Other experimental modification routes still include labeled fallback behavior.
- Source code and feedback may be stored locally and included in application logs. Review those settings before using sensitive code.
- Local-model defaults avoid paid inference APIs. Dependencies and model downloads require network access during setup; this repository has no verified network-isolation guarantee.

## Project map

- `src/app/api/critique/`: main critique endpoint
- `src/lib/llm/critic.ts`: prompt assembly and local model calls
- `src/lib/db/`: SQLite and critique-example retrieval
- `src/lib/self-improvement-loop.ts`: experimental prompt adaptation
- `src/lib/agents/`: experimental tool-based inspection
- `docs/agent-performance-evaluation.md`: feedback reporting workflow

## License

No standalone license file has been specified for this repository.

