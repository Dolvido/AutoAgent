import { v4 as uuidv4 } from 'uuid';
import type { CritiqueResult } from '@/components/CritiqueResults';
import { findSimilarCode } from '../db/vector-store';
import { saveCritique, getActiveNegativeConstraints } from '../db/database';
import { addToVectorStore } from '../db/vector-store';
import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate } from '@langchain/core/prompts';
import type { CritiqueIssue } from '@/components/CritiqueCard';

interface CritiqueOptions {
  temperature?: number;
  maxTokens?: number;
  useSimilarExamples?: boolean;
  maxExamples?: number;
  model?: string;
  customExamples?: Array<{
    code: string;
    critique: {
      summary: string;
      issues: Array<{
        title: string;
        description: string;
        fixSuggestion: string;
        severity: string;
      }>;
    }
  }>;
}

// System prompt template
const systemPrompt = `YOU MUST RESPOND WITH RAW JSON ONLY! No text or explanations before or after the JSON!

You are an expert code reviewer named Auto-Critic. Your task is to analyze the given code and provide a structured critique.
Focus on:
1. Code quality
2. Best practices
3. Potential bugs or edge cases
4. Performance issues
5. Readability and maintainability

Your response MUST ONLY contain a valid JSON object with this exact structure:
{
  "summary": "Brief overview of the code and major findings",
  "issues": [
    {
      "title": "Brief title of the issue",
      "description": "Detailed explanation of the problem",
      "fixSuggestion": "Code example showing how to fix the issue",
      "severity": "high|medium|low"
    }
  ]
}

IMPORTANT: ANY text outside the JSON object will cause errors. Do NOT include markdown code blocks, explanations, or any other text.
`;

// Default few-shot examples for the LLM
const getDefaultFewShotExamples = () => {
  return [
    {
      code: `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}`,
      critique: {
        summary: "This function calculates the total price of items in an array but has some issues with error handling and could be more concise.",
        issues: [
          {
            title: "No input validation",
            description: "The function doesn't check if 'items' is a valid array or if items have a 'price' property.",
            fixSuggestion: "function calculateTotal(items) {\n  if (!Array.isArray(items)) return 0;\n  \n  let total = 0;\n  for (let i = 0; i < items.length; i++) {\n    if (items[i] && typeof items[i].price === 'number') {\n      total += items[i].price;\n    }\n  }\n  return total;\n}",
            severity: "high"
          },
          {
            title: "Could use array method",
            description: "The function uses a for loop when it could use the more concise reduce() method.",
            fixSuggestion: "function calculateTotal(items) {\n  if (!Array.isArray(items)) return 0;\n  \n  return items.reduce((total, item) => {\n    return total + (item && typeof item.price === 'number' ? item.price : 0);\n  }, 0);\n}",
            severity: "medium"
          }
        ]
      }
    }
  ];
};

// Get few-shot examples, either custom or default
const getFewShotExamples = (options: CritiqueOptions) => {
  // Use custom examples if provided
  if (options.customExamples && options.customExamples.length > 0) {
    return options.customExamples;
  }
  
  // Otherwise use the default examples
  return getDefaultFewShotExamples();
};

// Function to build the prompt
const buildPrompt = async (code: string, language: string, options: CritiqueOptions) => {
  const examples = getFewShotExamples(options);
  let exampleText = '';
  
  // Add few-shot examples to the prompt
  examples.forEach((example, index) => {
    exampleText += `Example ${index + 1}:\nCode:\n${example.code}\n\nCritique:\n${JSON.stringify(example.critique, null, 2)}\n\n`;
  });
  
  // Get similar examples if requested
  if (options.useSimilarExamples) {
    // Use findSimilarCode which should return Documents with metadata
    const similarDocs = await findSimilarCode(code, options.maxExamples || 2);
    
    if (similarDocs.length > 0) {
      exampleText += 'Relevant examples from past accepted critiques:\n\n';
      
      similarDocs.forEach((doc, index) => {
        exampleText += `Past Example ${index + 1}:\n`;
        exampleText += `Code Snippet:\n${doc.pageContent}\n\n`;
        
        // Extract and add critique information from metadata
        if (doc.metadata?.critiqueSummary) {
          exampleText += `Critique Summary: ${doc.metadata.critiqueSummary}\n`;
        }
        if (doc.metadata?.critiqueIssuesCount !== undefined) {
          exampleText += `Number of Issues Found: ${doc.metadata.critiqueIssuesCount}\n`;
        }
        // Add more details if available and useful, e.g., specific issue titles
        // if (doc.metadata?.critiqueIssueTitles) {
        //   exampleText += `Issue Titles: ${doc.metadata.critiqueIssueTitles.join(', ')}\n`;
        // }
        exampleText += `\n`;
      });
    }
  }
  
  // Build the full prompt
  const promptText = `${systemPrompt}\n\n${exampleText}\n\nNow critique the following code in ${language}:\n\n${code}\n\nSYSTEM: YOUR RESPONSE MUST BE RAW JSON ONLY. DO NOT INCLUDE ANY TEXT EXPLANATIONS OR MARKDOWN CODE BLOCKS.`;

  return promptText;
};

// Real LLM implementation using Ollama
const generateCritique = async (code: string, language: string, options: CritiqueOptions): Promise<CritiqueResult> => {
  let attempts = 0;
  const maxAttempts = 3; 
  let lastResponse = "";
  let lastError: Error | null = null;

  while (attempts < maxAttempts) {
    try {
      const model = options.model || 'codellama';
      const temperature = attempts > 0 ? 0.05 : (options.temperature || 0.3);
      
      console.log(`LLM attempt ${attempts + 1}/${maxAttempts} with temperature ${temperature}`);
      
      const ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: model,
        temperature: temperature,
      });
      
      let prompt = await buildPrompt(code, language, options);
      if (attempts > 0 && lastError) {
        // Add retry context to prompt
        prompt = `I previously asked you ... Error: ${lastError.message} ... ${prompt}`;
      }
      
      const response = await ollama.call(prompt);
      lastResponse = response;
      
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : response;
        const critiqueResponse = JSON.parse(jsonStr);

        // --- Apply Negative Constraints --- 
        let rawIssues = critiqueResponse.issues || [];
        let filteredIssues = rawIssues;
        let constraintsAppliedCount = 0;

        try {
          const activeConstraints = await getActiveNegativeConstraints();
          
          if (activeConstraints.length > 0) {
            console.log(`Applying ${activeConstraints.length} active negative constraints...`);
            filteredIssues = rawIssues.filter((issue: any) => {
              const issueTitleLower = issue.title?.toLowerCase() || '';
              const issueDescLower = issue.description?.toLowerCase() || '';
              
              // Check if the issue matches ANY active constraint
              const isBlocked = activeConstraints.some(constraint => {
                const descMatch = issueTitleLower.includes(constraint.description.toLowerCase()) || 
                                  issueDescLower.includes(constraint.description.toLowerCase());
                const patternMatch = constraint.patternExample ? 
                                     (issueTitleLower.includes(constraint.patternExample.toLowerCase()) || 
                                      issueDescLower.includes(constraint.patternExample.toLowerCase())) : 
                                     false;
                return descMatch || patternMatch;
              });

              if (isBlocked) {
                constraintsAppliedCount++;
                console.log(`Filtering out issue "${issue.title}" due to negative constraint.`);
                return false; // Exclude this issue
              }
              return true; // Keep this issue
            });
            if (constraintsAppliedCount > 0) {
                 console.log(`Filtered out ${constraintsAppliedCount} issues based on learned constraints.`);
            }
          }
        } catch (constraintError) {
           console.error("Error fetching or applying negative constraints:", constraintError);
           // Proceed with unfiltered issues if constraints fail
        }
        // --- End Apply Negative Constraints ---

        // Add UUIDs only - validation happens later
        const finalIssues = filteredIssues.map((issue: any) => ({
           ...issue, // Keep original structure from LLM/mock for now
           id: uuidv4(),
        }));
        
        // Return summary and the potentially unvalidated issues
        return {
          id: uuidv4(),
          summary: critiqueResponse.summary || 'No summary provided.',
          language: language,
          timestamp: new Date().toISOString(),
          // Return the issues as received (might have string severity)
          // We will validate in the calling function (critiqueCode)
          issues: finalIssues 
        };

      } catch (parseError: any) {
        console.error(`Attempt ${attempts + 1}/${maxAttempts}: Failed to parse LLM response as JSON:`, parseError);
        console.log("Raw response:", response);
        lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
        attempts++;
        if (attempts >= maxAttempts) {
          throw new Error(`LLM response format error after ${maxAttempts} attempts`);
        }
        continue;
      }
    } catch (error: any) {
      console.error(`Attempt ${attempts + 1}/${maxAttempts}: Error calling Ollama:`, error);
      // Handle potential connection errors, etc.
      lastError = error instanceof Error ? error : new Error(String(error));
      attempts++;
       if (attempts >= maxAttempts) {
          throw new Error(`LLM call failed after ${maxAttempts} attempts: ${lastError.message}`);
       }
       await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Optional backoff
       continue;
    }
  }
  
  // Fallback if loop finishes unexpectedly (should be unreachable)
  throw new Error(`generateCritique failed after ${maxAttempts} attempts`);
};

// Fallback to mock implementation if Ollama is unavailable
const mockLLMGeneration = async (code: string, language: string) => {
  console.log(`Using mock LLM critique for ${language} code of length ${code.length}`);
  
  // Wait to simulate processing time
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Return different mock responses based on the language
  if (language === 'javascript' || language === 'typescript') {
    return {
      summary: "This JavaScript code could benefit from improved error handling, better variable naming, and more modern syntax.",
      issues: [
        {
          id: uuidv4(),
          title: "Missing error handling",
          description: "The code doesn't handle potential error cases which could lead to unexpected behavior.",
          fixSuggestion: "try {\n  // existing code\n} catch (error) {\n  console.error('An error occurred:', error);\n  // handle the error appropriately\n}",
          severity: "high"
        },
        {
          id: uuidv4(),
          title: "Use ES6+ features",
          description: "The code uses older JavaScript syntax when modern alternatives are available.",
          fixSuggestion: "// Convert to arrow function\nconst myFunction = (param) => {\n  // function body\n};\n\n// Use template literals\nconst message = `Hello, ${name}!`;",
          severity: "medium"
        },
        {
          id: uuidv4(),
          title: "Inconsistent naming convention",
          description: "Variable names don't follow a consistent pattern.",
          fixSuggestion: "// Use consistent camelCase\nconst userName = 'John';\nconst userAge = 30;\nconst userProfile = { ... };",
          severity: "low"
        }
      ]
    };
  } else if (language === 'python') {
    return {
      summary: "This Python code has issues with error handling, could use more Pythonic patterns, and would benefit from better documentation.",
      issues: [
        {
          id: uuidv4(),
          title: "Missing exception handling",
          description: "The code should use try/except blocks to handle potential errors.",
          fixSuggestion: "try:\n    # existing code\nexcept Exception as e:\n    print(f\"An error occurred: {e}\")\n    # handle the error",
          severity: "high"
        },
        {
          id: uuidv4(),
          title: "Use list comprehension",
          description: "The code uses a for loop to build a list when a list comprehension would be more Pythonic.",
          fixSuggestion: "# Instead of:\nresult = []\nfor i in range(10):\n    if i % 2 == 0:\n        result.append(i * 2)\n\n# Use:\nresult = [i * 2 for i in range(10) if i % 2 == 0]",
          severity: "medium"
        },
        {
          id: uuidv4(),
          title: "Missing docstrings",
          description: "Functions should have docstrings to explain their purpose, parameters, and return values.",
          fixSuggestion: "def my_function(param1, param2):\n    \"\"\"\n    Brief description of function purpose.\n    \n    Args:\n        param1: Description of parameter 1\n        param2: Description of parameter 2\n        \n    Returns:\n        Description of return value\n    \"\"\"\n    # function body",
          severity: "low"
        }
      ]
    };
  } else {
    // Generic response for other languages
    return {
      summary: "This code appears to implement a basic functionality but has several issues that could be improved.",
      issues: [
        {
          id: uuidv4(),
          title: "Lack of documentation",
          description: "The code has little or no documentation, making it difficult to understand.",
          fixSuggestion: "# Add descriptive comments\n# Explain what this function does\ndef my_function():\n    # Explain what this line does\n    result = complex_operation()",
          severity: "medium"
        },
        {
          id: uuidv4(),
          title: "Hardcoded values",
          description: "The code contains hardcoded values that should be configurable constants.",
          fixSuggestion: "# Define constants at the top of the file\nMAX_RETRY_COUNT = 5\nDEFAULT_TIMEOUT = 30\n\n# Then use the constants\nfor i in range(MAX_RETRY_COUNT):\n    result = operation_with_timeout(DEFAULT_TIMEOUT)",
          severity: "medium"
        },
        {
          id: uuidv4(),
          title: "Error handling",
          description: "The code lacks proper error handling mechanisms.",
          fixSuggestion: "try:\n    # Risky operation\n    result = risky_operation()\nexcept Exception as e:\n    # Handle the error\n    logger.error(f\"Operation failed: {e}\")\n    # Take appropriate action",
          severity: "high"
        }
      ]
    };
  }
};

// Main function to critique code
export async function critiqueCode(
  code: string, 
  language: string, 
  options: CritiqueOptions = {}
): Promise<CritiqueResult> {
  try {
    let critiqueResponse: any; // Use 'any' initially as structure varies slightly
    
    try {
      critiqueResponse = await generateCritique(code, language, options);
    } catch (ollmaError) {
      console.warn("Failed to use Ollama for critique, falling back to mock:", ollmaError);
      critiqueResponse = await mockLLMGeneration(code, language);
    }
    
    // --- Validate Issues and Conform to Type --- 
    const rawIssuesFromResponse = critiqueResponse.issues || [];
    const validatedIssues: CritiqueIssue[] = [];
    const ALLOWED_SEVERITIES: ReadonlySet<CritiqueIssue['severity']> = new Set(["high", "medium", "low"]);

    for (const issue of rawIssuesFromResponse) {
       let validatedSeverity: CritiqueIssue['severity'] = "medium"; // Default
       if (issue.severity && typeof issue.severity === 'string') {
          const lowerSeverity = issue.severity.toLowerCase();
          if (ALLOWED_SEVERITIES.has(lowerSeverity as CritiqueIssue['severity'])) {
             validatedSeverity = lowerSeverity as CritiqueIssue['severity'];
          }
       }
    
       const issueToAdd: CritiqueIssue = {
          id: issue.id || uuidv4(), // Use existing ID if available (e.g., from mock)
          title: String(issue.title || 'Untitled Issue'),
          description: String(issue.description || 'No description.'),
          fixSuggestion: String(issue.fixSuggestion || 'No suggestion.'),
          severity: validatedSeverity, 
       };
       validatedIssues.push(issueToAdd);
    }
    // --- End Validation ---

    const id = critiqueResponse.id || uuidv4(); // Use ID from generateCritique if available
    
    // Create the final critique result with validated issues
    const critiqueResult: CritiqueResult = {
      id,
      summary: critiqueResponse.summary || 'No summary provided.',
      language,
      issues: validatedIssues, // Use the validated array
      timestamp: critiqueResponse.timestamp || new Date().toISOString()
    };
    
    // Save the critique (with validated issues) to the database
    try {
      await saveCritique(critiqueResult, code);
      
      // Add to vector store - ensure object passed has correct structure if needed by addToVectorStore
      // Consider passing critiqueResult instead of critiqueResponse if addToVectorStore relies on CritiqueResult type
      await addToVectorStore(
        code,
        id,
        language,
        critiqueResult // Pass the validated result object
      );
    } catch (dbError) {
      console.error("Error saving critique to database/vector store:", dbError);
    }
    
    return critiqueResult;
  } catch (error) {
    console.error("Error generating critique:", error);
    throw error;
  }
} 