// src/lib/agents/critique-tools/evaluate-clarity.tool.ts
import { Tool } from "@langchain/core/tools";
import { Ollama } from '@langchain/community/llms/ollama'; // Assuming usage of Langchain's Ollama integration
import { z } from "zod";

export class EvaluateClarityLLMTool extends Tool {
  name = "EvaluateClarityLLMTool";
  description = `Evaluates the provided code snippet for overall clarity, maintainability, and potential complexity using an LLM. Returns a brief textual summary. Requires 'code_content' and 'language' inputs.`;

  argsSchema = z.object({
    code_content: z.string().describe("The full source code content of the file."),
    language: z.string().describe("The programming language (e.g., python, javascript).")
  });

  private llm: Ollama;

  constructor() {
    super(); // Call Tool constructor
    this.llm = new Ollama({
      baseUrl: 'http://localhost:11434', // Make sure this is configurable if needed
      model: 'codellama:latest',        // Or another suitable model like mistral
      temperature: 0.5,                 // Allow for some descriptive text
    });
  }

  async _call(input: z.infer<typeof this.argsSchema>): Promise<string> {
    const { code_content, language } = input;

    const prompt = `
You are an experienced software developer providing a high-level code review.
Analyze the following ${language} code snippet ONLY for its overall clarity, readability, maintainability, and potential areas of unnecessary complexity.

**Instructions:**
*   Provide a BRIEF summary (1-3 sentences) of your assessment.
*   Focus on high-level aspects, not specific line-by-line errors unless they significantly impact overall understanding.
*   Do NOT comment on specific naming conventions, missing documentation, or empty exception blocks, as other tools handle those.
*   If the code is generally clear and well-structured, state that briefly.
*   If there are concerns, mention them concisely (e.g., "complex nested logic in function X", "unclear variable names impact readability", "potential for simplification in algorithm Y").

Code Snippet:
\`\`\`${language}
${code_content}
\`\`\`

Brief Clarity Assessment:`;

    try {
      console.log(`EvaluateClarityLLMTool: Calling LLM for clarity assessment...`);
      const response = await this.llm.call(prompt);
      const assessment = response.trim();
      console.log(`EvaluateClarityLLMTool Assessment: ${assessment}`);
      return assessment; // Return the LLM's assessment directly
    } catch (error: any) {
      console.error(`EvaluateClarityLLMTool: LLM call failed:`, error);
      return `Error during clarity evaluation: ${error.message || 'Unknown error'}`; // Return an error message
    }
  }
}