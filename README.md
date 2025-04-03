# AutoCritic

An offline AI-powered coding critique assistant that provides structured feedback on your code with a self-improving learning loop based on user feedback.

## Features

- **Offline Code Analysis**: Analyze your code without sending it to external APIs
- **Structured Critique**: Receive feedback organized by issue type and severity
- **Self-Improvement**: The system learns from your feedback to improve future critiques
- **Local Storage**: All data, logs, and embeddings are stored locally with no external telemetry
- **Vector Memory**: Similar code patterns from past critiques inform new analyses
- **Multiple Languages**: Support for JavaScript, TypeScript, Python, Java, C#, Go, Rust, and more

## Tech Stack

This project uses the following technologies:

- **LLM**: [Ollama](https://ollama.ai/) (Mistral, LLaMA3, CodeLLaMA)
- **Prompt Orchestration**: [LangChain](https://js.langchain.com/)
- **Vector Store**: [FAISS](https://github.com/facebookresearch/faiss)
- **Database**: SQLite via better-sqlite3
- **Frontend**: Next.js, React, Tailwind CSS
- **Code Editor**: Monaco Editor

## Getting Started

### Prerequisites

1. [Node.js](https://nodejs.org/) (v18 or higher)
2. [Ollama](https://ollama.ai/download) for Windows

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/auto-critic.git
   cd auto-critic
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up Ollama and required models:
   ```
   # Start Ollama on your system first
   # Then run our setup script
   .\setup-ollama.ps1
   ```

4. Create the necessary data directories:
   ```
   mkdir -Force data; mkdir -Force data\vectors; mkdir -Force data\meta-agent
   ```

5. Start the development server:
   ```
   npm run dev
   ```

6. Open your browser and navigate to [http://localhost:3000](http://localhost:3000)

## Usage

1. **Input Code**: Paste code into the editor or upload a file
2. **Select Language**: Choose the programming language
3. **Request Critique**: Click the "Critique Code" button
4. **Review Feedback**: Examine the structured critique with issues and suggestions
5. **Provide Feedback**: Accept or reject specific critique points to help the system improve

## Configuration

AutoCritic can be configured by modifying the following:

- **LLM Model**: Change the model in `src/lib/llm/critic.ts` (default: `codellama`)
- **Embedding Model**: Change the model in `src/lib/db/vector-store.ts` (default: `llama3`)
- **Database Location**: Change the path in `src/lib/db/database.ts` (default: `./data/autocritic.db`)
- **Vector Store**: Change settings in `src/lib/db/vector-store.ts` (default: `./data/vectors`)

## Project Structure

```
auto-critic/
├── data/                   # Data storage
│   ├── vectors/            # FAISS vector store
│   └── meta-agent/         # Meta-agent storage
├── src/
│   ├── app/                # Next.js app
│   │   ├── api/            # API routes
│   │   │   ├── critique/   # Code critique endpoint
│   │   │   └── feedback/   # User feedback endpoint
│   │   ├── page.tsx        # Main page
│   │   └── layout.tsx      # App layout
│   ├── components/         # React components
│   │   ├── CodeEditor.tsx  # Monaco code editor
│   │   ├── CritiqueCard.tsx # Individual critique issue
│   │   └── CritiqueResults.tsx # Critique display
│   ├── lib/                # Core logic
│   │   ├── db/             # Database and vector store
│   │   │   ├── database.ts # SQLite implementation
│   │   │   └── vector-store.ts # FAISS implementation
│   │   └── llm/            # LLM integration
│   │       ├── critic.ts   # Code critique logic
│   │       └── meta-agent.ts # Self-improvement
│   └── types/              # TypeScript type definitions
└── setup-ollama.ps1        # Ollama setup script
```

## How the Self-Learning Works

1. **Collect Feedback**: User's accept/reject actions are stored with each critique
2. **Analyze Patterns**: The meta-agent reviews feedback statistics to identify patterns
3. **Optimize Examples**: The system creates new few-shot examples based on successful critiques
4. **Adjust Critiques**: Future code analysis is informed by what worked well previously
5. **Continuous Improvement**: This cycle repeats automatically as more feedback is collected

## Offline Usage

AutoCritic is fully offline and doesn't require an internet connection after installation and model download. All data stays on your machine.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 🧠 What It Does

- Accepts pasted code or Git diffs
- Analyzes code using a LangChain agent powered by a local LLM (e.g. Mistral via Ollama)
- Provides structured feedback:
  - Issues detected
  - Reasoning
  - Suggested improvements
- Tracks whether you accept, reject, or ignore each critique
- Remembers patterns and adapts future feedback accordingly

---

## 🎯 Why It Matters

- **Runs offline** → Your code stays private  
- **Improves with use** → Feedback becomes more tailored  
- **Built for devs** → Snappy, focused, and transparent

---

## 📦 Tech Stack (Planned)

| Layer         | Stack                             |
|---------------|------------------------------------|
| Frontend      | Next.js, Tailwind, shadcn/ui, Monaco |
| Backend       | FastAPI (or Flask), LangChain      |
| LLM Runtime   | Ollama (Mistral, CodeLLaMA, Gemma) |
| Vector Memory | FAISS or Chroma                    |
| Storage       | JSON or SQLite                     |

---

## 🔁 Key System Flow

1. **User pastes or uploads code**
2. **LangChain agent generates critique** (via local LLM)
3. **Critique shown in web UI**
4. **User feedback logged** (Accept / Reject / Ignore)
5. **Vector DB + pattern DB store historical context**
6. **Meta-agent modifies prompt strategy based on behavior**

---

## 🔨 Early Goals

- [ ] Implement UI with Monaco editor and critique panel
- [ ] Build initial LangChain agent pipeline
- [ ] Connect Ollama model to LangChain
- [ ] Log feedback in local storage
- [ ] Retrieve and embed past critiques
- [ ] Inject memory into prompt context

---

## 🚫 Constraints

- No paid APIs or cloud models
- Entirely offline / local execution
- All dependencies must be free or open-source

---

## 🧪 Testing Plan (MVP)

- Use static examples to verify:
  - Prompt structure
  - Feedback quality
  - Logging response to critique
- Simulate user accept/reject actions
- Score feedback loops for improvement rate

---

