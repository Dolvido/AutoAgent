import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getTicket, updateTicketWithModification } from '@/lib/virtual-ticket';
import { Ollama } from '@langchain/community/llms/ollama';

// Helper function to map file extensions to markdown language identifiers
function getLanguageFromExtension(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  const mapping: { [key: string]: string } = {
    '.py': 'python',
    '.js': 'javascript',
    '.ts': 'typescript',
    '.jsx': 'jsx',
    '.tsx': 'tsx',
    '.java': 'java',
    '.cs': 'csharp',
    '.go': 'go',
    '.rb': 'ruby',
    '.php': 'php',
    '.html': 'html',
    '.css': 'css',
    '.json': 'json',
    '.yaml': 'yaml',
    '.md': 'markdown',
    // Add more mappings as needed
  };
  return mapping[extension] || ''; // Return empty string if no mapping found
}

// Helper to generate more specific instructions based on the description
function generateSpecificInstruction(description: string, language: string): string {
  const lowerDesc = description.toLowerCase();
  let instruction = `Based on the issue description ("${description}"), generate a fix for the provided code.`; // Default

  // --- Add specific instructions based on known issue types --- 
  if (lowerDesc.includes('naming convention')) {
    if (language === 'python') {
      instruction = `Analyze the provided Python code. Identify any function names, variable names, or class names that do NOT follow PEP 8 conventions (snake_case for functions/variables, PascalCase for classes). Generate a diff to correct ONLY these naming inconsistencies. Do not make any other changes.`;
    } else if (language === 'javascript' || language === 'typescript') {
      instruction = `Analyze the provided ${language} code. Identify any function or variable names that do NOT follow standard camelCase conventions, or class names that do not follow PascalCase. Generate a diff to correct ONLY these naming inconsistencies. Do not make any other changes.`;
    } // Add other language conventions
  } else if (lowerDesc.includes('empty exception block') || lowerDesc.includes('except: pass')) {
     instruction = `Analyze the provided ${language} code. Find any empty exception blocks (e.g., 'except: pass' in Python, 'catch {}' in JS/TS). Modify these blocks to either log the exception details or re-raise the exception. Generate a diff for these changes ONLY.`;
  }
  // Add more rules for other common issue types...

  return instruction;
}

// Simple diff validation (basic check for format)
function isValidDiff(diff: string): boolean {
  if (typeof diff !== 'string') {
    return false; // Must be a string
  }
  const trimmedDiff = diff.trim();
  if (trimmedDiff.length === 0) {
    return true; // An empty diff is considered valid (means LLM suggests no changes)
  }
  // Check if it contains typical diff lines (---, +++, @@)
  const diffLines = trimmedDiff.split('\n');
  return diffLines.some(line => line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@'));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticketId, filePath: relativeFilePath, description } = body;

    if (!ticketId || !relativeFilePath || !description) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, filePath, description' },
        { status: 400 }
      );
    }

    // Get the ticket to find the base path
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    
    // Construct the full path
    // Ensure basePath exists and is a directory (basic check)
    if (!ticket.basePath || typeof ticket.basePath !== 'string') {
         return NextResponse.json({ error: 'Ticket is missing a valid base path.' }, { status: 400 });
    }
    const fullFilePath = path.resolve(ticket.basePath, relativeFilePath);

    // --- Phase 1 Change: Read FULL file content --- 
    let fileContent: string;
    try {
      console.log(`Reading full file content from: ${fullFilePath}`);
      fileContent = await fs.readFile(fullFilePath, 'utf-8');
    } catch (error: any) {
      console.error(`Failed to read file ${fullFilePath}:`, error);
      // Check for specific error codes
      if (error.code === 'ENOENT') {
          return NextResponse.json({ error: `File not found: ${relativeFilePath}` }, { status: 404 });
      } else if (error.code === 'EISDIR') {
           return NextResponse.json({ error: `Specified path is a directory, not a file: ${relativeFilePath}` }, { status: 400 });
      } else {
        return NextResponse.json({ error: `Failed to read file: ${relativeFilePath}` }, { status: 500 });
      }
    }
    
    // Extract necessary info from the ticket (may need refinement)
    // const description = ticket.description; // Already getting from body
    // Line number is NOT available on CritiqueIssue type
    // const lineNumber = ticket.sourceIssue?.location?.startLine; 
    const severity = ticket.sourceIssue?.severity;
    
    // --- Phase 1 Change: Determine language and generate better instruction ---
    const language = getLanguageFromExtension(relativeFilePath);
    const specificInstruction = generateSpecificInstruction(description, language);
    
    console.log(`Generating fix for ticket ${ticketId}`);
    console.log(`File: ${relativeFilePath}`);
    console.log(`Language: ${language || 'unknown'}`);
    console.log(`Issue: ${description}`);
    console.log(`Generated Instruction: ${specificInstruction}`);
    // console.log(`Full File Content Provided:\\n${fileContent.substring(0, 500)}...`); // Log snippet for brevity
    
    // --- Phase 1 Change: Construct Enhanced Prompt --- 
    const prompt = `\nAct as an expert software developer reviewing a piece of code.\nYou are given a code file and a description of an issue found within it.\nYour task is to generate ONLY a code modification in the standard unified diff format that fixes the described issue.\n\n**RULES:**\n*   **Output ONLY the diff.** Do not include explanations, apologies, introductory text, code fences (\`\`\`diff), or anything else.\n*   **Targeted Fix:** The diff must ONLY contain changes that directly address the specific issue described.\n*   **Minimal Changes:** Do not make unrelated changes (e.g., code style, whitespace, imports) unless required by the fix itself.\n*   **Language Conventions:** Ensure the fix follows standard conventions for the code's language (${language || 'unknown'}).\n*   **Context is Key:** Use the full code context provided to understand the existing style and structure.\n\n**INPUT:**\n\n*   **File Path:** \`${relativeFilePath}\`\n*   **Issue Description:** ${description}\n*   **Severity:** ${severity || 'Unknown'}\n*   **Instruction:** ${specificInstruction}\n\n**Full Code Context:**\n\`\`\`${language || ''}\n${fileContent}\n\`\`\`\n\n**Verification Checklist (Internal):**\nBefore outputting the diff, mentally verify:\n1.  Does the diff *only* modify the file specified (\`${relativeFilePath}\`)? (Answer Yes/No)\n2.  Does the diff *directly* address the core issue described (\"${description}\")? (Answer Yes/No)\n3.  Does the diff avoid unrelated changes (style, whitespace, etc.)? (Answer Yes/No)\n4.  If the answer to any of the above is No, or if the issue cannot be fixed correctly in the specified file following all rules, output *only* an empty response.\n5.  If all answers are Yes, proceed to output ONLY the diff block.\n\n**OUTPUT (Only the diff block if verification passes, otherwise empty):**\n`;

    // Call LLM
    let generatedDiff = '';
    try {
      const ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: 'codellama:latest', // Or another suitable model
        temperature: 0.1, // Low temperature for precise code edits
      });

      generatedDiff = await ollama.call(prompt);
      generatedDiff = generatedDiff.trim(); // Remove leading/trailing whitespace

    } catch (llmError: any) {
      console.error(`LLM call failed for generating fix for ticket ${ticketId}:`, llmError);
      return NextResponse.json(
        { error: 'LLM failed to generate fix.' },
        { status: 500 }
      );
    }

    // Validate LLM output
    // First, clean up potential markdown fences and extra whitespace
    generatedDiff = generatedDiff.replace(/^```(?:diff|python)?\n|```$/gm, '').trim();

    if (generatedDiff.length === 0) {
        console.log(`LLM for ticket ${ticketId} generated an empty diff (suggesting no changes needed).`);
        // Keep generatedDiff as empty string ''
    } else if (!isValidDiff(generatedDiff)) {
      console.warn(`LLM for ticket ${ticketId} generated a non-empty but INVALID diff format:\n---\n${generatedDiff}\n---`);
      // Option 1: Return an error
      // return NextResponse.json({ error: 'LLM generated an invalid fix format.' }, { status: 500 });
      // Option 2: Treat as no fix possible, return empty diff (Current choice)
      generatedDiff = ''; 
      console.log(`Proceeding with an empty diff for ticket ${ticketId} due to invalid format.`);
    } else {
        console.log(`LLM for ticket ${ticketId} generated a valid diff.`);
        // Diff is valid and non-empty, proceed with validation.
        
        // --- Phase 2 Addition: LLM-Powered Validation --- 
        console.log(`Attempting LLM validation for the generated diff...`);
        const validationPrompt = `\nReview the following code modification diff intended to address a specific issue.\n\nIssue Description: ${description}\n\nProposed Diff:\n\`\`\`diff\n${generatedDiff}\n\`\`\`\n\nQuestion: Does the Proposed Diff directly address the Issue Description?\nAnswer ONLY with the word \"Yes\" or \"No\".\n`;

        try {
            const validationOllama = new Ollama({
                baseUrl: 'http://localhost:11434',
                model: 'codellama:latest', // Could use a smaller/faster model if available
                temperature: 0.0, // Very low temperature for deterministic Yes/No
            });

            const validationResponse = await validationOllama.call(validationPrompt);
            const validationAnswer = validationResponse.trim().toLowerCase();
            console.log(`Validation LLM Answer: \"${validationAnswer}\"`);

            if (validationAnswer !== 'yes') {
                console.warn(`LLM Validation FAILED for ticket ${ticketId}. The generated diff was deemed irrelevant or incorrect by the validation LLM. Discarding diff.`);
                generatedDiff = ''; // Discard the diff
            } else {
                console.log(`LLM Validation PASSED for ticket ${ticketId}.`);
                // Keep the validated diff
            }

        } catch (validationError: any) {
            console.error(`LLM validation call failed for ticket ${ticketId}:`, validationError);
            // Treat validation error as failure - discard the diff for safety
            console.warn(`Discarding diff for ticket ${ticketId} due to validation call failure.`);
            generatedDiff = ''; 
        }
        // --- End LLM-Powered Validation ---
    }

    // Create the modification result
    const modificationResult = {
        id: `mod-${Date.now()}`,
        originalCode: fileContent,
        modifiedCode: generatedDiff,
        changes: [],
        explanation: description
    };

    // Update the ticket
    const updatedTicket = await updateTicketWithModification(ticketId, modificationResult);
    if (!updatedTicket) {
      return NextResponse.json(
        { error: 'Failed to update ticket with modification' },
        { status: 500 }
      );
    }

    // Return the result
    return NextResponse.json({
      success: true,
      ticketId: ticketId,
      codeModification: generatedDiff
    });
  } catch (error: any) {
    console.error("Error in /api/generate-fix:", error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 