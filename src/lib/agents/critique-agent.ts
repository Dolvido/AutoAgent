// src/lib/agents/critique-agent.ts

import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { Tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { jsonrepair } from "jsonrepair"; // Import the jsonrepair function

// Restore tool imports
import { AnalyzeCodeStructureTool } from "./critique-tools/analyze-code-structure.tool";
import { FindEmptyExceptionBlocksTool } from "./critique-tools/find-empty-exceptions.tool";
import { CheckDocumentationExistsTool } from "./critique-tools/check-documentation-exists.tool";
import { CheckNamingConventionsLLMTool } from "./critique-tools/check-naming-conventions.tool";
import { EvaluateClarityLLMTool } from "./critique-tools/evaluate-clarity.tool";

// Restore original interface if it was changed
export interface CritiqueResultForAgent {
  summary: string;
  issues: Array<{
    id?: string; // Make ID optional for now
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    line?: number;
    violatingText?: string;
  }>;
}

// Restore Tools array
const tools: Tool[] = [
  new AnalyzeCodeStructureTool(),
  new FindEmptyExceptionBlocksTool(),
  new CheckDocumentationExistsTool(),
  new CheckNamingConventionsLLMTool(),
  new EvaluateClarityLLMTool(),
];

// Initialize LLM using ChatOpenAI pointed at local Ollama v1 endpoint
const agentLLM = new ChatOpenAI({
  modelName: "llama3.1",
  temperature: 0.1,
  configuration: {
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama",
  },
});

// --- Restore Agent Prompt (Suitable for openai-tools) ---
const agentPromptTemplate = `You are an expert code reviewer AI assistant. Your goal is to analyze the provided code file and identify potential quality issues based on standard conventions and best practices for the given language.\n\nYou have access to a set of tools to help you analyze the code structure, find common issues like empty exception blocks, check for documentation, verify naming conventions, and evaluate clarity.\n\nPlease follow this plan STRICTLY:\n1.  **Analyze Structure:** Use \'AnalyzeCodeStructureTool\'.\n2.  **Targeted Checks:** Use \'CheckNamingConventionsLLMTool\', \'FindEmptyExceptionBlocksTool\', \'CheckDocumentationExistsTool\'.\n3.  **Holistic Review:** Use \'EvaluateClarityLLMTool\'.\n4.  **Compile Final Result:** Synthesize observations from ALL previous tool outputs into a single, final JSON object.\n    *   The JSON object MUST have exactly two top-level keys: \'summary\' (string, 1-2 sentences summarizing the findings) and \'issues\' (array of issue objects).\n    *   Each issue object in the \'issues\' array MUST include: \'title\' (string), \'description\' (string), \'severity\' (\'low\'|\'medium\'|\'high\'), and optionally \'line\' (number) and \'violatingText\' (string).\n    *   Assign severity: \'high\' for empty exceptions, \'medium\' for naming/clarity, \'low\' for missing docs.\n    *   Base all issues strictly on the direct output from the tools used in steps 1-3. If a tool found no issues, do not invent any for that category.\n    *   **CRITICAL:** Your final output MUST be ONLY the JSON object itself, enclosed in triple backticks (\`\`\`json ... \`\`\`). Do NOT include ANY other text, explanations, greetings, or introductory phrases before or after the JSON block.\n\nCode Language: {language}\nCode Content to Analyze:\n\\\`\\\`\\\`{language}\n{code_content}\n\\\`\\\`\\\`\n\nBegin!\n`;

// Restore ChatPromptTemplate setup
const prompt = ChatPromptTemplate.fromMessages([
  ["system", agentPromptTemplate],
  new MessagesPlaceholder("agent_scratchpad"),
  ["human", "{input}"],
]);

// --- Agent Executor Initialization (Reverted parser piping) ---
let agentExecutor: AgentExecutor | null = null;

async function getAgentExecutor(): Promise<AgentExecutor> {
  if (agentExecutor) {
    return agentExecutor;
  }
  
  // Define the agent runnable (without the parser)
  const agentRunnable = await createOpenAIToolsAgent({
    llm: agentLLM,
    tools,
    prompt,
  });

  // AgentExecutor runs the base agent
  agentExecutor = new AgentExecutor({
    agent: agentRunnable, // Use the original agent runnable
    tools,
    verbose: true,
    handleParsingErrors: true,
  });

  console.log("Critique Agent Executor Initialized: OpenAI Tools agent type via Ollama v1 endpoint.");
  return agentExecutor;
}

// --- Main Function to Run Critique Agent (Using standard JSON.parse + fallback) ---
export async function runCritiqueAgent(code_content: string, language: string): Promise<CritiqueResultForAgent | { error: string }> {
  console.log(`Running CritiqueAgent (OpenAI Tools type via Ollama v1) for language: ${language}...`);
  try {
    const executor = await getAgentExecutor();

    const codeBlock = `\`\`\`${language}\n${code_content}\n\`\`\``;
    const mainInputString = `Analyze the following ${language} code:\n\nCode Content to Analyze:\n${codeBlock}`;

    const agentInput = {
      input: mainInputString,
      language: language,
      code_content: code_content,
    };

    console.log("Starting agent execution with code length:", code_content.length, 
                "and language:", language, "| First 50 chars:", code_content.substring(0, 50));

    const result = await executor.invoke(agentInput);

    console.log("Agent Executor finished. Checking for intermediate steps info...");
    if ('intermediate_steps' in result && Array.isArray(result.intermediate_steps)) {
      console.log(`Agent used ${result.intermediate_steps.length} intermediate steps/tools.`);
      result.intermediate_steps.forEach((step, index) => {
        if (Array.isArray(step) && step.length === 2) {
          const [action, response] = step;
          console.log(`Step ${index+1}: Used ${action.tool || 'unknown tool'}.`);
        }
      });
    } else {
      console.log("No intermediate steps found in result object.");
    }

    console.log("Agent Executor Raw Result Output:", result.output);

    // Attempt to parse the final JSON output from the agent string
    try {
      let parsedOutput;
      const outputString = result.output; // Assuming output is a string

      if (typeof outputString !== 'string') {
        throw new Error(`Expected string output from agent, but got ${typeof outputString}`);
      }

      let jsonStringToParse: string | null = null;
      let parseError: Error | null = null;

      // 1. Try extracting JSON from markdown code block FIRST
      const jsonMatch = outputString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
          console.log("Found JSON within markdown block. Attempting to parse extracted content.");
          jsonStringToParse = jsonMatch[1].trim();
          try {
              // Attempt to repair before parsing
              const repairedJsonString = jsonrepair(jsonStringToParse);
              parsedOutput = JSON.parse(repairedJsonString);
              console.log("Successfully repaired and parsed JSON from markdown block.");
          } catch (e: any) {
              console.warn("Failed to repair/parse JSON extracted from markdown block.", e);
              parseError = e; // Store error, but continue to next strategy
              parsedOutput = null; // Ensure parsedOutput is null if markdown parse failed
          }
      }

      // 2. If markdown parsing failed or wasn't applicable, try extracting from first { to last }
      if (!parsedOutput) {
          console.warn("Markdown block parsing failed or not found. Attempting to extract content between first '{' and last '}'.");
          const firstBrace = outputString.indexOf('{');
          const lastBrace = outputString.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              jsonStringToParse = outputString.substring(firstBrace, lastBrace + 1).trim();
              console.log("Extracted content between braces. Attempting to repair and parse.");
              try {
                   // Attempt to repair before parsing
                  const repairedJsonString = jsonrepair(jsonStringToParse);
                  parsedOutput = JSON.parse(repairedJsonString);
                  console.log("Successfully repaired and parsed JSON extracted between braces.");
                  parseError = null; // Clear previous error if this succeeded
              } catch (e: any) {
                  console.error("Failed to repair/parse JSON extracted between braces.", e);
                  // Log the string that failed parsing for easier debugging
                  console.error("String content attempted for brace parsing:", jsonStringToParse);
                  parseError = e; // Store the latest error
                  parsedOutput = null;
              }
          } else {
              console.error("Could not find opening and closing braces in the output string.");
              if (!parseError) { // Only set this error if no previous parse error occurred
                parseError = new Error("Could not find valid JSON structure (markdown or braces) in agent output.");
              }
          }
      }

      // 3. If parsing failed after all attempts, try the fallback direct LLM approach
      if (!parsedOutput) {
        console.log("All parsing attempts failed, trying fallback direct LLM approach...");
        return await runDirectCritiqueLLM(code_content, language);
      }

      // Validate the structure
      if (parsedOutput && Array.isArray(parsedOutput.issues) && typeof parsedOutput.summary === 'string') {
        const issuesValid = parsedOutput.issues.every((issue: any) =>
          typeof issue.title === 'string' &&
          typeof issue.description === 'string' &&
          ['low', 'medium', 'high'].includes(issue.severity)
        );

        if (issuesValid) {
          console.log("CritiqueAgent finished successfully (Ollama v1).");
          return parsedOutput as CritiqueResultForAgent;
        } else {
          console.error("CritiqueAgent output validation failed: Invalid issue structure.", parsedOutput);
          return await runDirectCritiqueLLM(code_content, language);
        }
      } else {
        console.error("CritiqueAgent output validation failed: Missing summary/issues or wrong types.", parsedOutput);
        return await runDirectCritiqueLLM(code_content, language);
      }
    } catch (parseOrValidationError: any) {
      console.error("CritiqueAgent: Failed to parse or validate final output.", parseOrValidationError, "Raw agent output string was:", result.output);
      // Try the direct LLM approach as a fallback when parsing fails
      return await runDirectCritiqueLLM(code_content, language);
    }
  } catch (error: any) {
    console.error("Error running CritiqueAgent (Ollama v1):", error);
    // Try the direct LLM approach as a fallback when agent execution fails
    try {
      return await runDirectCritiqueLLM(code_content, language);
    } catch (fallbackError: any) {
      return { error: `Agent execution failed and fallback approach also failed: ${error.message || 'Unknown error'} | Fallback error: ${fallbackError.message || 'Unknown fallback error'}` };
    }
  }
}

// Simpler, direct LLM approach as a fallback for when the agent approach fails
async function runDirectCritiqueLLM(code_content: string, language: string): Promise<CritiqueResultForAgent | { error: string }> {
  console.log("Running direct LLM critique as fallback...");
  try {
    // Create a direct prompt that asks for exactly the JSON structure we need
    const directPrompt = `You are an expert code reviewer. Analyze this ${language} code and return ONLY a JSON object with a 'summary' string and an 'issues' array.

Each issue should have 'title', 'description', 'severity' ('low', 'medium', or 'high'), and optional 'line' and 'violatingText' fields.

Review this code and identify potential quality issues:

\`\`\`${language}
${code_content}
\`\`\`

Return ONLY a valid JSON object like this:
{
  "summary": "Brief 1-2 sentence summary of the code quality",
  "issues": [
    {
      "title": "Issue title",
      "description": "Detailed explanation",
      "severity": "medium",
      "line": 42,
      "violatingText": "problematic code"
    }
  ]
}

IMPORTANT: Return ONLY the JSON with no other text.`;

    // Use the same LLM but with a direct approach
    const response = await agentLLM.invoke(directPrompt);
    
    console.log("Direct LLM response:", response);
    
    // The response might be a string or an AIMessage object
    // We need to extract the content properly
    let content = "";
    if (typeof response === 'string') {
      content = response;
    } else if (response && typeof response === 'object') {
      // Handle AIMessage-like objects
      if ('content' in response && response.content !== undefined) {
        // If it's a simple content property
        if (typeof response.content === 'string') {
          content = response.content;
        } 
        // If it's an array of message contents (newer LangChain format)
        else if (Array.isArray(response.content)) {
          // Try to join all string parts
          content = response.content
            .filter(part => typeof part === 'string')
            .join(" ");
          
          // If that didn't work, try the full stringify
          if (!content) {
            content = JSON.stringify(response);
          }
        }
      } else {
        // Last resort - stringify the whole response
        content = JSON.stringify(response);
      }
    }
    
    // Extract and repair JSON
    try {
      // Try to extract JSON from the content if it's wrapped in ```json blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        content = jsonMatch[1].trim();
      } else {
        // Otherwise look for { ... } structure
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          content = content.substring(firstBrace, lastBrace + 1).trim();
        }
      }
      
      // Repair and parse JSON
      const repairedJson = jsonrepair(content);
      const parsedOutput = JSON.parse(repairedJson);
      
      // Validate output structure
      if (typeof parsedOutput.summary === 'string' && Array.isArray(parsedOutput.issues)) {
        console.log("Direct LLM approach succeeded with valid structure.");
        return parsedOutput as CritiqueResultForAgent;
      } else {
        throw new Error("Direct LLM output missing required fields.");
      }
    } catch (parseError: any) {
      console.error("Failed to parse direct LLM response:", parseError);
      
      // Last resort: generate a minimal valid response
      return {
        summary: `Code analysis attempted but returned invalid format. The ${language} code appears to be ${code_content.length} characters long.`,
        issues: [{
          title: "Analysis Error",
          description: "The code analyzer encountered an issue parsing the results. This could indicate complex code or an issue with the analysis engine.",
          severity: "low"
        }]
      };
    }
  } catch (error: any) {
    console.error("Error in direct LLM critique fallback:", error);
    return { error: `Direct LLM critique failed: ${error.message || 'Unknown error'}` };
  }
}