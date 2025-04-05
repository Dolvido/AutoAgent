// src/lib/agents/critique-tools/check-documentation-exists.tool.ts
import { Tool } from "@langchain/core/tools";
import { z } from "zod";

// Structure assumed from AnalyzeCodeStructureTool output
interface CodeStructureItem {
  name: string;
  type: 'class' | 'function' | 'method'; // Or other types as needed
  start_line: number; // Assuming 1-based line number
}

interface MissingDocstringFinding {
  type: string;
  name: string;
  line: number; // Line where the definition starts
  language: string;
}

export class CheckDocumentationExistsTool extends Tool {
  name = "CheckDocumentationExistsTool";
  description = "Checks functions and classes identified in the code_structure JSON string to see if they have a docstring immediately following their definition line. Requires 'code_content', 'language', and 'code_structure' (JSON string) inputs.";

  // ** Define Input Schema **
  argsSchema = z.object({
    code_content: z.string().describe("The full source code content of the file."),
    language: z.string().describe("The programming language (e.g., python, javascript)."),
    code_structure: z.string().describe("A JSON string representing the output of AnalyzeCodeStructureTool (a list of functions, classes, etc.).")
  });

  async _call(input: z.infer<typeof this.argsSchema>): Promise<string> {
    const { code_content, language, code_structure } = input;
    const findings: MissingDocstringFinding[] = [];
    const lines = code_content.split('\\n');

    let structure: CodeStructureItem[] = [];
    try {
      // Combine parsing for different potential structures
      const parsedStructure = JSON.parse(code_structure);
      // Assuming structure might be like: {"classes": [...], "functions": [...]}
      // Or potentially a flat list depending on AnalyzeCodeStructureTool's output design
      if (Array.isArray(parsedStructure)) {
          structure = parsedStructure;
      } else {
          structure = [
              ...(parsedStructure.classes || []).map((item: any) => ({ ...item, type: 'class' })),
              ...(parsedStructure.functions || []).map((item: any) => ({ ...item, type: 'function' })),
              ...(parsedStructure.methods || []).map((item: any) => ({ ...item, type: 'method' })) // If methods are separate
          ];
      }
       // Basic validation of items
       structure = structure.filter(item => item && typeof item.name === 'string' && typeof item.start_line === 'number');

    } catch (e) {
      console.error("CheckDocumentationExistsTool: Failed to parse code_structure JSON.", e);
      return JSON.stringify({ error: "Invalid code_structure input. Expected valid JSON.", input: code_structure });
    }

    if (!structure || structure.length === 0) {
        console.log("CheckDocumentationExistsTool: No structure items provided or parsed.");
        return JSON.stringify([]);
    }

    let docstringPatterns: RegExp[] = [];

    // --- Language-Specific Regex ---
    if (language === 'python') {
      // Looking for triple quotes (double or single), potentially raw/f-string prefixed
      docstringPatterns = [
          /^\s*"""/,
          /^\s*'''/,
          /^\s*r"""/, /^\s*r'''/,
          /^\s*f"""/, /^\s*f'''/,
          /^\s*u"""/, /^\s*u'''/,
      ];
    } else if (language === 'javascript' || language === 'typescript') {
      // Looking for /**
      docstringPatterns = [
          /^\s*\/\*\*/,
      ];
    }
    // Add patterns for other languages...

    if (docstringPatterns.length === 0) {
        console.warn(`CheckDocumentationExistsTool: Language '${language}' has no defined docstring patterns.`);
        // Decide if we should report all as missing or none
        return JSON.stringify([]); // Reporting none if language unknown
    }

    // --- Check Each Item ---
    structure.forEach(item => {
      // Adjust start_line to 0-based index for accessing the lines array
      // Check if the line *after* the start line exists
      const lineIndexToCheck = item.start_line; // 1-based start_line means the next line is at index start_line
      
      if (lineIndexToCheck >= 0 && lineIndexToCheck < lines.length) {
        const lineAfterDefinition = lines[lineIndexToCheck];
        
        // Check if the line after definition matches any docstring pattern
        const hasDocstring = docstringPatterns.some(pattern => pattern.test(lineAfterDefinition));

        if (!hasDocstring) {
          findings.push({
            type: item.type,
            name: item.name,
            line: item.start_line, // Report the line where the definition starts
            language: language,
          });
        }
      } else {
          console.warn(`CheckDocumentationExistsTool: Cannot check line after definition for ${item.type} ${item.name} at line ${item.start_line}. Index out of bounds.`);
      }
    });

    console.log(`CheckDocumentationExistsTool found ${findings.length} items potentially missing docstrings.`);
    return JSON.stringify(findings); // Return findings as a JSON string
  }
}