"use server";

import { v4 as uuidv4 } from 'uuid';
import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import type { CritiqueResult } from '@/components/CritiqueResults';
import type { CritiqueIssue } from '@/components/CritiqueCard';

// Alias CritiqueIssue as Issue for easier reference
type Issue = CritiqueIssue;

interface CodeModificationOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  preserveStyle?: boolean;
  safetyChecks?: boolean;
}

interface ModificationResult {
  id: string;
  originalCode: string;
  modifiedCode: string;
  appliedFix: {
    issueId: string;
    title: string;
    description: string;
  };
  changes: Array<{
    lineStart: number;
    lineEnd: number;
    original: string;
    replacement: string;
  }>;
  explanation: string;
  status: 'success' | 'error' | 'warning';
  errorMessage?: string;
}

// System prompt template for code modification
const systemPrompt = `YOU MUST RESPOND WITH RAW JSON ONLY! No text or explanations before or after the JSON!

You are an expert code modifier named Auto-Editor. Your task is to apply fixes to code based on critique.
Your job is to ONLY apply the specific fix suggested in the critique, while preserving the overall coding style and structure.

Follow these strict guidelines:
1. Only modify what is necessary to fix the specific issue
2. Preserve variable names, coding style, and formatting when not part of the fix
3. Do not introduce new features or refactor unrelated code
4. Provide a clear explanation of what was changed and why
5. If the fix cannot be applied safely, explain why

YOUR RESPONSE MUST ONLY contain a valid JSON object with this exact structure:
{
  "modifiedCode": "The complete modified code with the fix applied",
  "changes": [
    {
      "lineStart": 5,
      "lineEnd": 7,
      "original": "The original code snippet that was changed",
      "replacement": "The new code that replaced it"
    }
  ],
  "explanation": "Brief explanation of the changes made and their effect",
  "status": "success|error|warning",
  "errorMessage": "Only present if status is error or warning"
}

IMPORTANT: ANY text outside the JSON object will cause errors. Do NOT include markdown code blocks, explanations, or any other text.
`;

// Build the prompt for code modification
const buildModificationPrompt = async (
  originalCode: string, 
  language: string, 
  issue: Issue, 
  options: CodeModificationOptions
) => {
  // Determine if we should include additional safety instructions
  const safetyInstructions = options.safetyChecks !== false ? `
Additional safety requirements:
1. Never remove error handling code unless it's explicitly part of the fix
2. Never change function signatures or return types unless explicitly required
3. Ensure any new code maintains compatibility with the rest of the codebase
4. Do not introduce new dependencies or imports unless explicitly required
` : '';

  // Build the full prompt
  const promptText = `${systemPrompt}
${safetyInstructions}

ORIGINAL CODE (${language}):
${originalCode}

ISSUE TO FIX:
Title: ${issue.title}
Description: ${issue.description}
Suggested Fix: ${issue.fixSuggestion}

SYSTEM: YOUR RESPONSE MUST BE RAW JSON ONLY. DO NOT INCLUDE ANY TEXT EXPLANATIONS OR MARKDOWN CODE BLOCKS.`;

  return promptText;
};

// Function to apply code modification using LLM
export async function modifyCode(
  originalCode: string,
  language: string,
  issue: Issue,
  options: CodeModificationOptions = {}
): Promise<ModificationResult> {
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
        : (options.temperature || 0.2);
      
      console.log(`LLM attempt ${attempts + 1}/${maxAttempts} with temperature ${temperature}`);
      
      const ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: model,
        temperature: temperature,
      });
      
      // Build the prompt with explicit feedback on retry
      let prompt;
      if (attempts > 0) {
        prompt = await buildModificationPrompt(originalCode, language, issue, options);
        prompt = `I previously asked you to provide a code modification in valid JSON format, but your response was not valid JSON. Please try again.

Previous response: ${lastResponse.substring(0, 200)}${lastResponse.length > 200 ? '...' : ''}

Error: ${lastError instanceof Error ? lastError.message : 'Invalid JSON format'}

IMPORTANT: YOUR RESPONSE MUST BE RAW JSON ONLY. DO NOT INCLUDE ANY TEXT, EXPLANATIONS, OR MARKDOWN CODE BLOCKS.

${prompt}`;
      } else {
        prompt = await buildModificationPrompt(originalCode, language, issue, options);
      }
      
      // Call the model
      const response = await ollama.call(prompt);
      lastResponse = response;
      
      // Parse the JSON response
      try {
        // Extract JSON part if the model added any preamble text
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        
        const modificationResponse = JSON.parse(jsonStr);
        
        // Create the final result
        return {
          id: uuidv4(),
          originalCode,
          modifiedCode: modificationResponse.modifiedCode,
          appliedFix: {
            issueId: issue.id,
            title: issue.title,
            description: issue.description
          },
          changes: modificationResponse.changes || [],
          explanation: modificationResponse.explanation,
          status: modificationResponse.status || 'success',
          errorMessage: modificationResponse.errorMessage
        };
      } catch (parseError) {
        console.error(`Attempt ${attempts + 1}/${maxAttempts}: Failed to parse LLM response as JSON:`, parseError);
        console.log("Raw response:", response);
        
        lastError = parseError;
        attempts++;
        
        // If this was the last attempt, return an error result
        if (attempts >= maxAttempts) {
          return {
            id: uuidv4(),
            originalCode,
            modifiedCode: originalCode,
            appliedFix: {
              issueId: issue.id,
              title: issue.title,
              description: issue.description
            },
            changes: [],
            explanation: `Failed to parse LLM response after ${maxAttempts} attempts`,
            status: 'error',
            errorMessage: `LLM response format error after ${maxAttempts} attempts`
          };
        }
        
        // Otherwise continue to the next attempt
        continue;
      }
    } catch (error: any) {
      console.error(`Attempt ${attempts + 1}/${maxAttempts}: Error calling Ollama:`, error);
      
      return {
        id: uuidv4(),
        originalCode,
        modifiedCode: originalCode,
        appliedFix: {
          issueId: issue.id,
          title: issue.title,
          description: issue.description
        },
        changes: [],
        explanation: "Failed to generate modification",
        status: 'error',
        errorMessage: error.message || "Unknown error"
      };
    }
  }
  
  // This should never be reached due to the return in the loop, but TypeScript needs it
  return {
    id: uuidv4(),
    originalCode,
    modifiedCode: originalCode,
    appliedFix: {
      issueId: issue.id,
      title: issue.title,
      description: issue.description
    },
    changes: [],
    explanation: "Failed to generate modification after multiple attempts",
    status: 'error',
    errorMessage: "LLM response format error"
  };
}

// Mock implementation for testing or when Ollama is unavailable
export async function mockModifyCode(
  originalCode: string,
  language: string,
  issue: Issue
): Promise<ModificationResult> {
  console.log(`Using mock code modification for ${language} code of length ${originalCode.length}`);
  
  // Wait to simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Example mock implementation (you can expand with different mock responses)
  if (issue.title.includes("validation")) {
    // Example: Add input validation
    const lines = originalCode.split('\n');
    const firstFunctionLine = lines.findIndex(line => line.includes('function'));
    
    if (firstFunctionLine >= 0) {
      const modifiedLines = [...lines];
      const indentation = modifiedLines[firstFunctionLine + 1].match(/^\s*/)?.[0] || '  ';
      modifiedLines.splice(firstFunctionLine + 1, 0, `${indentation}// Added input validation`);
      modifiedLines.splice(firstFunctionLine + 2, 0, `${indentation}if (!input) return null;`);
      
      return {
        id: uuidv4(),
        originalCode,
        modifiedCode: modifiedLines.join('\n'),
        appliedFix: {
          issueId: issue.id,
          title: issue.title,
          description: issue.description
        },
        changes: [
          {
            lineStart: firstFunctionLine + 1,
            lineEnd: firstFunctionLine + 1,
            original: "",
            replacement: `${indentation}// Added input validation\n${indentation}if (!input) return null;`
          }
        ],
        explanation: "Added input validation to prevent errors with null inputs",
        status: 'success'
      };
    }
  }
  
  // Default mock response (no changes)
  return {
    id: uuidv4(),
    originalCode,
    modifiedCode: originalCode,
    appliedFix: {
      issueId: issue.id,
      title: issue.title,
      description: issue.description
    },
    changes: [],
    explanation: "No changes applied in mock mode",
    status: 'warning',
    errorMessage: "Mock implementation does not support this type of fix"
  };
} 