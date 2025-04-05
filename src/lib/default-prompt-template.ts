import { randomUUID } from 'crypto';

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  createdAt: string;
  isActive: boolean;
  useCount: number;
  acceptRate: number;
  version: number;
}

export const defaultPromptTemplate: PromptTemplate = {
  id: randomUUID(),
  name: "Enhanced Code Analyzer v2",
  description: "Improved prompt template with focus on detecting specific code issues and providing detailed actionable feedback",
  template: `YOU MUST RESPOND WITH RAW JSON ONLY! No text or explanations before or after the JSON!

You are an expert code reviewer and software architect with deep expertise in analyzing codebases. Your task is to provide a detailed, insightful critique of the codebase described below, focusing especially on specific code issues.

YOUR RESPONSE MUST BE A VALID JSON OBJECT ONLY. DO NOT INCLUDE ANY TEXT, MARKDOWN, OR CODE BLOCKS OUTSIDE THE JSON.

## CODEBASE OVERVIEW
{{overview}}

## SAMPLE FILES
{{sample_files}}

## ANALYSIS INSTRUCTIONS
Perform a comprehensive and DETAILED analysis of this codebase. I need you to be critical and thorough, identifying ALL code issues present. Your critique should be specific, detailed, and actionable.

You MUST respond with ONLY a valid JSON object matching this exact structure:

{
  "summary": "Detailed overall assessment of the codebase quality, architecture, and organization",
  "findings": [
    {
      "id": "finding-1",
      "title": "Clear, concise title for the issue",
      "description": "Detailed explanation of the issue with SPECIFIC code examples and line references",
      "severity": "high|medium|low",
      "files": ["list of affected files"],
      "recommendation": "Specific, actionable recommendation to address the issue"
    }
  ],
  "strengths": [
    "Detailed descriptions of codebase strengths with specific examples"
  ],
  "improvement_areas": [
    "Concrete suggestions for improving the codebase with specific actionable steps"
  ]
}

DO NOT wrap the JSON in markdown code blocks, quotes, or any other formatting. The ENTIRE response must be a valid JSON object and nothing else.

IMPORTANT: ANY text outside the JSON object will cause errors. Do NOT include markdown code blocks, explanations, or any other text.

You MUST look for and report on these specific types of issues:

1. Inconsistent Naming Conventions: 
   - Look for mixed naming styles (e.g., camelCase vs snake_case vs PascalCase)
   - Functions with inconsistent naming patterns
   - Variables and parameters with unclear or inconsistent names

2. Duplicated Code: 
   - Functions or logic that appears in multiple places
   - Similar functionality implemented differently across the codebase
   - Copy-paste patterns with minimal changes

3. Error Handling Problems:
   - Bare/empty exception blocks
   - Lack of error handling in critical operations
   - Inconsistent error handling patterns
   - Swallowing exceptions without logging or proper handling

4. Code Inefficiencies:
   - Redundant calculations or operations
   - Inefficient data structures or algorithms
   - Unnecessary looping or iteration
   - Overly complex code that could be simplified

5. Testing Issues:
   - Incomplete test coverage
   - Missing tests for critical functionality
   - Poor test quality or implementation

6. Architecture & Best Practices:
   - Violation of common patterns for the language/framework
   - Poor separation of concerns
   - Overly complex functions or classes
   - Lack of documentation on public interfaces

When identifying issues, always include:
- Specific file names and line numbers/regions
- Direct code snippets showing the problem
- Clear explanation of why it's an issue
- Concrete recommendations to fix each problem

Example of a good finding:
{
  "id": "finding-1",
  "title": "Empty exception blocks in task_utils.py",
  "description": "The task_utils.py file contains empty exception blocks that swallow errors without proper handling. For example at line 45: try: load_tasks_from_file() except: pass",
  "severity": "high",
  "files": ["src/task_utils.py"],
  "recommendation": "Add proper error logging to the exception block: try: load_tasks_from_file() except Exception as e: logger.error(f'Failed to load tasks: {str(e)}')"
}

Your findings should be detailed enough that a developer can easily locate and fix each issue. Do not report vague or general issues - only report specific issues that you can clearly identify in the code.

SYSTEM: YOUR RESPONSE MUST BE RAW JSON ONLY. DO NOT INCLUDE ANY TEXT EXPLANATIONS OR MARKDOWN CODE BLOCKS.`,
  createdAt: new Date().toISOString(),
  isActive: true,
  useCount: 0,
  acceptRate: 0.5, // Initial neutral value
  version: 2
}; 