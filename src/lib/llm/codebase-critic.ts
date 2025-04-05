import { v4 as uuidv4 } from 'uuid';
import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import { saveCritique } from '../db/database';
import { addToVectorStore } from '../db/vector-store';
import { CodeFile, CodebaseAnalysis, extractRelevantFiles, summarizeCodebase } from '../codebase/explorer';

// Interface for codebase critique result
export interface CodebaseCritiqueResult {
  id: string;
  summary: string;
  overallAssessment: string;
  architectureReview: string;
  issues: Array<{
    id: string;
    title: string;
    description: string;
    affectedFiles: string[];
    fixSuggestion: string;
    severity: 'high' | 'medium' | 'low';
  }>;
  patterns: {
    positive: string[];
    negative: string[];
  };
  timestamp: string;
}

interface CodebaseCritiqueOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  maxFiles?: number;
  focusFile?: string;
  depth?: number;
}

// System prompt for codebase analysis
const CODEBASE_ANALYSIS_PROMPT = `YOU MUST RESPOND WITH RAW JSON ONLY! No text or explanations before or after the JSON!

You are an expert software architect tasked with analyzing an entire codebase. You'll be provided with:
1. A summary of the codebase structure and stats
2. Key files and their relationships
3. A focus file (if specified)

Your response MUST ONLY contain a valid JSON object with this exact structure:
{
  "summary": "Brief overview of what the codebase does",
  "overallAssessment": "General assessment of code quality, architecture, and organization",
  "architectureReview": "Analysis of the architectural patterns used and their effectiveness",
  "issues": [
    {
      "title": "Concise issue title",
      "description": "Detailed explanation of the problem across files",
      "affectedFiles": ["file1.js", "file2.js"],
      "fixSuggestion": "Suggested cross-file fix with code examples if appropriate",
      "severity": "high|medium|low"
    }
  ],
  "patterns": {
    "positive": ["Good patterns observed in the codebase"],
    "negative": ["Anti-patterns or improvements needed"]
  }
}

Guidelines:
- Focus on architectural and cross-file issues
- Identify common patterns (good and bad)
- Look for inconsistencies between files
- Suggest improvements that respect the existing architecture
- For each issue, consider impacts across multiple files
- Prioritize actionable feedback

IMPORTANT: ANY text outside the JSON object will cause errors. Do NOT include markdown code blocks, explanations, or any other text.
`;

// Generate a codebase critique using the LLM
async function generateCodebaseCritique(
  codebaseAnalysis: CodebaseAnalysis,
  relevantFiles: CodeFile[],
  options: CodebaseCritiqueOptions
): Promise<CodebaseCritiqueResult> {
  let attempts = 0;
  const maxAttempts = 3; // Maximum number of retry attempts
  let lastResponse = "";
  let lastError = null;

  while (attempts < maxAttempts) {
    try {
      // Create Ollama client
      const model = options.model || 'codellama';
      
      // On retry attempts, significantly lower the temperature
      const temperature = attempts > 0 
        ? 0.05 // Lower temperature on retry for more deterministic output
        : (options.temperature || 0.3);
      
      console.log(`LLM attempt ${attempts + 1}/${maxAttempts} with temperature ${temperature}`);
      
      const ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: model,
        temperature: temperature,
      });
      
      // Generate codebase summary
      const codebaseSummary = summarizeCodebase(codebaseAnalysis);
      
      // Build the prompt with explicit feedback on retry
      let prompt;
      if (attempts > 0) {
        prompt = `${CODEBASE_ANALYSIS_PROMPT}

I previously asked you to provide a codebase critique in valid JSON format, but your response was not valid JSON. Please try again.

Previous response: ${lastResponse.substring(0, 200)}${lastResponse.length > 200 ? '...' : ''}

Error: ${lastError instanceof Error ? lastError.message : 'Invalid JSON format'}

IMPORTANT: YOUR RESPONSE MUST BE RAW JSON ONLY. DO NOT INCLUDE ANY TEXT, EXPLANATIONS, OR MARKDOWN CODE BLOCKS.

Codebase Summary:
${codebaseSummary}

Relevant Files (${relevantFiles.length}):
${relevantFiles.map(file => `- ${file.relativePath} (${file.language})`).join('\n')}

${options.focusFile ? `Focus File: ${options.focusFile}` : ''}

File Contents:
${relevantFiles.map(file => `--- ${file.relativePath} ---\n${file.content.substring(0, 1000)}${file.content.length > 1000 ? '...(truncated)' : ''}`).join('\n\n')}

Analyze the relationships between these files and identify cross-cutting issues and patterns.
Return your analysis as a valid JSON object matching the schema.`;
      } else {
        prompt = `${CODEBASE_ANALYSIS_PROMPT}

Codebase Summary:
${codebaseSummary}

Relevant Files (${relevantFiles.length}):
${relevantFiles.map(file => `- ${file.relativePath} (${file.language})`).join('\n')}

${options.focusFile ? `Focus File: ${options.focusFile}` : ''}

File Contents:
${relevantFiles.map(file => `--- ${file.relativePath} ---\n${file.content.substring(0, 1000)}${file.content.length > 1000 ? '...(truncated)' : ''}`).join('\n\n')}

Analyze the relationships between these files and identify cross-cutting issues and patterns.
Return your analysis as a valid JSON object matching the schema.`;
      }

      // Call the model
      const response = await ollama.call(prompt);
      lastResponse = response;
      
      // Parse the JSON response
      try {
        // Extract JSON part from the response (sometimes the model adds text outside the JSON)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        
        const critiqueResponse = JSON.parse(jsonStr);
        
        // Add UUIDs to issues
        const issues = critiqueResponse.issues.map((issue: any) => ({
          ...issue,
          id: uuidv4()
        }));
        
        // Construct the final critique result
        const critiqueResult: CodebaseCritiqueResult = {
          id: uuidv4(),
          summary: critiqueResponse.summary || '',
          overallAssessment: critiqueResponse.overallAssessment || '',
          architectureReview: critiqueResponse.architectureReview || '',
          issues: issues,
          patterns: critiqueResponse.patterns || { positive: [], negative: [] },
          timestamp: new Date().toISOString()
        };
        
        return critiqueResult;
      } catch (parseError) {
        console.error(`Attempt ${attempts + 1}/${maxAttempts}: Failed to parse LLM response as JSON:`, parseError);
        console.log("Raw response:", response);
        
        lastError = parseError;
        attempts++;
        
        // If this was the last attempt, throw the error
        if (attempts >= maxAttempts) {
          throw new Error(`LLM response format error after ${maxAttempts} attempts`);
        }
        // Otherwise continue to the next attempt
        continue;
      }
    } catch (error) {
      console.error(`Attempt ${attempts + 1}/${maxAttempts}: Error generating codebase critique:`, error);
      throw error;
    }
  }
  
  // This should never be reached due to the throw in the loop, but TypeScript needs it
  throw new Error(`LLM response format error after ${maxAttempts} attempts`);
}

// Mock implementation for when Ollama is unavailable
function mockCodebaseCritique(
  codebaseAnalysis: CodebaseAnalysis,
  relevantFiles: CodeFile[]
): CodebaseCritiqueResult {
  console.log(`Using mock codebase critique for ${relevantFiles.length} files`);
  
  // Extract some file names for the mock critique
  const fileNames = relevantFiles.slice(0, 3).map(f => f.relativePath);
  
  return {
    id: uuidv4(),
    summary: "This appears to be a web application codebase with client and server components.",
    overallAssessment: "The codebase shows moderate organization but has several architectural issues and inconsistencies.",
    architectureReview: "The application uses a component-based architecture but lacks clear separation of concerns in some areas.",
    issues: [
      {
        id: uuidv4(),
        title: "Inconsistent error handling patterns",
        description: "The codebase uses different error handling approaches across files, making it difficult to maintain a consistent error handling strategy.",
        affectedFiles: fileNames,
        fixSuggestion: "Create a shared error handling utility and standardize error handling across the codebase:\n```typescript\n// error-utils.ts\nexport function handleApiError(error: unknown) {\n  // standard error handling logic\n}\n```",
        severity: "medium"
      },
      {
        id: uuidv4(),
        title: "Duplicated utility functions",
        description: "Several utility functions are duplicated across multiple files instead of being centralized.",
        affectedFiles: fileNames,
        fixSuggestion: "Extract common utility functions into a shared utilities module:\n```typescript\n// utils/index.ts\nexport function formatDate(date: Date): string {\n  // formatting logic\n}\n```",
        severity: "low"
      },
      {
        id: uuidv4(),
        title: "Lack of dependency injection",
        description: "Components directly instantiate dependencies rather than receiving them, making testing difficult.",
        affectedFiles: fileNames,
        fixSuggestion: "Implement a dependency injection pattern using context or props:\n```typescript\n// Before\nconst service = new Service();\n\n// After\nfunction Component({ service }) {\n  // use injected service\n}\n```",
        severity: "high"
      }
    ],
    patterns: {
      positive: [
        "Consistent file naming conventions",
        "Good use of TypeScript interfaces"
      ],
      negative: [
        "Tight coupling between components",
        "Inconsistent state management approaches",
        "Limited test coverage"
      ]
    },
    timestamp: new Date().toISOString()
  };
}