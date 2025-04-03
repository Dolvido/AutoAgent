## 1. System Overview

**Goal**: An offline AI-powered coding critique assistant that:
- Accepts code input (pasted text or file upload).
- Generates a structured critique (summary, issues, suggestions).
- Learns from user feedback over time to improve critique strategies.
- Stores all data (logs, embeddings, prompts) locally with no external telemetry.

---

## 2. High-Level Workflow

1. **User Interface (UI)**  
   - A web-based code editor (e.g., Monaco/Ace or VSCode extension).  
   - “Critique” button triggers a request to the backend with `{code, language}`.  
   - Displays the LLM’s critique in collapsible cards (issue, explanation, suggested fix).  
   - Allows user feedback: “Accept,” “Reject,” “Copy Fix,” “Regenerate,” or “Ignore.”

2. **Critique Generation (LangChain Agent + Local LLM)**  
   - Backend receives the user’s code and selected language.  
   - Looks up similar past critiques from the local vector DB (FAISS/Chroma).  
   - Composes a prompt with relevant context from previous critiques and the system’s few-shot instructions.  
   - Invokes the local LLM (Ollama + open model) to produce a structured critique.

3. **Feedback Logging & Memory**  
   - When the user responds (accept/reject/edit), the system logs:  
     - Original code snippet  
     - Generated critique  
     - User’s feedback (timestamp, action)  
   - Embeds the code + critique pair into the vector DB.  
   - Persists logs in JSON or SQLite for future analysis.

4. **Self-Improvement (Meta-Agent / Prompt Tuner)**  
   - Periodically reviews usage logs to see which critiques were accepted/rejected/ignored.  
   - Adjusts prompt templates or weighting for issues based on feedback patterns.  
   - Updates the embedding store or modifies retrieval strategies to prioritize more relevant historical critiques.

---

## 3. Refined Requirements

### 3.1 Input & UI

1. **Code Input**  
   - Accept raw text, file upload, or Git-style diff.  
   - Auto-detect language from file extension or content.  
   - Provide manual override if detection fails.

2. **User Interface**  
   - **Web App**: Built with Next.js + Tailwind + shadcn/ui.  
   - **Editor**: Monaco or Ace (or a VSCode extension as a bonus).  
   - **Dark Mode Toggle**: For accessibility and user preference.  
   - **Buttons**:  
     - “Critique” to generate feedback.  
     - “Accept,” “Reject,” “Ignore,” “Copy Fix,” “Regenerate” to respond to a given critique.  
   - **Language Toggle** (optional) for localized critiques.

3. **Frontend–Backend Communication**  
   - REST or WebSocket endpoints (FastAPI or Flask).  
   - Payload: `{code, language, userPreferences}`.  
   - Response: structured JSON critique (summary, issues, suggestions).

### 3.2 Critique Generation

1. **LangChain Agent**  
   - Implemented as a Runnable chain or a Tool.  
   - Steps:  
     1. Summarize code functionality.  
     2. Identify 2–3 issues (e.g., clarity, structure, best practices).  
     3. Suggest actionable improvements (no full rewrites unless requested).  

2. **Prompt Template**  
   - Few-shot style to keep the critique consistent.  
   - Incorporate top-K similar past critiques from the vector store.  
   - Maintain a “base prompt” describing the system’s purpose and constraints.

3. **Local LLM**  
   - Use Ollama to run open-source models (Mistral, CodeLLaMA, etc.).  
   - Temperature configurable (default 0.3).  
   - Must operate offline, no external API calls.  
   - Return raw text plus a structured JSON or dictionary for easy UI rendering.

### 3.3 Feedback & Logging

1. **Feedback Panel**  
   - Displays each critique issue in a collapsible card.  
   - Each card has an “Accept” or “Reject” action.  
   - Optional “Edit” or “Copy Fix” for direct code snippet copying.

2. **Feedback Logging**  
   - Store the session data in a local database (JSON or SQLite):  
     - Code snippet + language  
     - Generated critique (summary, issues, suggestions)  
     - User action (accept/reject/ignore, timestamps)  
   - Optionally track user ID or session ID for multi-user environments.

3. **Versioning**  
   - Keep versions of code critiques.  
   - Allows the system to see how critiques evolve over time.

### 3.4 Vector Memory & Retrieval

1. **Embedding Store**  
   - FAISS or Chroma for storing vector embeddings.  
   - Each entry includes:  
     - Code snippet (or relevant portion)  
     - Critique text  
     - Metadata (language, date, user feedback).  

2. **Similarity Search**  
   - On new code input, embed the snippet.  
   - Retrieve top-K similar critiques from the store.  
   - Insert relevant examples into the prompt context to guide the LLM.

3. **Updates**  
   - After each critique session, add the new (code + critique) embedding to the store.  
   - Keep an index of feedback acceptance to weigh certain examples higher in retrieval.

### 3.5 Self-Improvement / Meta-Agent

1. **Prompt Tuner**  
   - Periodically analyze logs to measure acceptance vs. rejection/ignore rates.  
   - Identify patterns of critiques that are commonly accepted or commonly rejected.  
   - Adjust the system’s few-shot examples, weighting, or instruction wording accordingly.  
   - Could be triggered by a schedule (e.g., once daily) or by a certain number of new critiques.

2. **Scoring**  
   - Each critique is scored by user feedback (accepted = +1, ignored = 0, rejected = –1, for example).  
   - Summaries of scoring are used to refine prompts.  
   - If a particular example or approach leads to frequent rejections, remove or replace it in the few-shot set.

3. **Tuning History**  
   - Keep a record of each tuning iteration (date, changes made, acceptance rate before/after).  
   - Allows the team to audit how the system’s strategy evolves over time.

### 3.6 Data Persistence & Export

1. **Local Storage**  
   - **SQLite** or JSON files for storing logs, critiques, user feedback.  
   - Must be entirely offline, no external telemetry or cloud services.  

2. **Embeddings**  
   - Stored in FAISS or Chroma.  
   - Potentially keep separate embeddings for code vs. critique text.

3. **Export Options**  
   - Critique results can be exported to Markdown or JSON.  
   - Potential for Git patch suggestions in the future (e.g., show diffs with recommended fixes).

---

## 4. Detailed Architectural Flow

Below is a more step-by-step architectural flow, tying together the components:

1. **Code Input (UI)**  
   - User pastes or uploads code in the browser.  
   - The user selects or confirms the language.

2. **Request to Backend**  
   - A request is made to the FastAPI/Flask endpoint: `POST /critique` with `{code, language}`.

3. **Preprocessing & Retrieval**  
   - The backend:  
     1. Embeds the incoming code snippet.  
     2. Queries FAISS/Chroma for the top-K similar critiques.  
     3. Gathers relevant examples from those critiques (the code context and suggestions).  

4. **Prompt Assembly**  
   - The system merges:  
     - **Base prompt** (role: “System” instructions).  
     - **Few-shot examples** (e.g., 1–3 high-scoring critiques).  
     - **User code** (current snippet).  
     - **Task** (summarize, identify issues, suggest fixes).  

5. **LLM Invocation**  
   - The assembled prompt is sent to the local LLM via Ollama.  
   - The LLM returns a structured response: JSON or dictionary containing:  
     - `summary`  
     - `issues[]` (each with `description`, `reason`, `fixSuggestion`)  

6. **Response to UI**  
   - The backend relays the structured critique to the frontend.  
   - The UI renders collapsible cards for each issue.

7. **User Feedback**  
   - User chooses “Accept,” “Reject,” “Ignore,” or “Regenerate.”  
   - The system logs the user’s action and updates local DB.

8. **Logging & Embedding**  
   - The system embeds the (code + critique) pair and saves it to the vector store.  
   - Stores a row in the SQLite/JSON log with:  
     - Code snippet, critique text, user feedback, timestamp.  

9. **Periodic Self-Improvement**  
   - A scheduled process (the Meta-Agent) reviews logs:  
     - Calculates acceptance/rejection/ignore metrics.  
     - Identifies frequently repeated feedback or common pitfalls.  
   - Adjusts the base prompt or few-shot examples.  
   - Updates the embedding weighting or retrieval strategy to surface more successful examples.

---

## 5. Additional Considerations

1. **Security & Privacy**  
   - Runs offline.  
   - No external data transmission.  
   - Users should be aware of local data storage implications.

2. **Scalability**  
   - If many users or large codebases, might need to optimize embeddings and indexing.  
   - Potential for sharding or indexing by language/project type.

3. **Concurrency**  
   - Each critique request is stateless aside from reading/writing logs.  
   - Ensure the DB or JSON logs can handle concurrent writes (SQLite can handle concurrency with proper locking).

4. **Model Flexibility**  
   - Allow easy swapping of local LLM models (Mistral, CodeLLaMA, etc.) with minimal changes.  
   - Possibly let advanced users set custom hyperparameters or prompt parameters.

5. **Future Enhancements**  
   - Git patch suggestions to show line-by-line diffs.  
   - Role-based critique tone (junior vs. dev lead) by injecting different instructions.  
   - Automated test suggestions or static analysis integration.

---

### Conclusion

This refined requirements and system architecture outline a robust, self-improving code critique workflow. It balances local LLM inference, vector-based memory for retrieval, a user feedback loop, and iterative prompt tuning—all while maintaining an offline-first approach with no external telemetry.