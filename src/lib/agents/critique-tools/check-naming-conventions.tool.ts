import { Tool } from "@langchain/core/tools";
import { Ollama } from '@langchain/community/llms/ollama';
import { z } from "zod";

// Structure assumed from AnalyzeCodeStructureTool output
interface StructureItem {
  name: string;
  type: 'class' | 'function' | 'method' | 'interface' | 'type_alias';
  start_line: number;
  end_line: number;
}

interface NamingViolationFinding {
  name: string;
  type: string;
  line: number;
  rule_violated: string; // e.g., "Expected snake_case for function", "Expected PascalCase for class"
  language: string;
}

export class CheckNamingConventionsLLMTool extends Tool {
  name = "CheckNamingConventionsLLMTool";
  description = `Analyzes a list of identified code structure items (functions, classes, etc. provided as a JSON string in 'code_structure') against standard naming conventions for the given 'language'. Uses an LLM to identify violations. Returns a JSON list of violations found within the input list. Requires 'language' and 'code_structure' inputs.`;

  // ** Define Input Schema **
  argsSchema = z.object({
    language: z.string().describe("The programming language (e.g., python, javascript)."),
    code_structure: z.string().describe("A JSON string representing the output of AnalyzeCodeStructureTool (a list of functions, classes, etc.).")
  });

  private llm: Ollama;

  constructor() {
    super();
    this.llm = new Ollama({
      baseUrl: 'http://localhost:11434',
      model: 'codellama:latest',
      temperature: 0.1, // Low temp for structured output
      format: 'json', // Request JSON output if model supports it
    });
  }

  private getConventionRules(language: string): string {
    if (language === 'python') {
      return `Python PEP 8 Conventions:
- Functions: snake_case
- Methods: snake_case
- Variables: snake_case (Check not implemented by this tool)
- Classes: PascalCase`;
    } else if (language === 'javascript' || language === 'typescript') {
      return `Standard JS/TS Conventions:
- Functions: camelCase
- Methods: camelCase
- Variables: camelCase (Check not implemented by this tool)
- Classes: PascalCase
- Interfaces: PascalCase (Often prefixed with 'I')
- Type Aliases: PascalCase`;
    }
    // Add rules for other languages
    return "No specific convention rules defined for this language.";
  }

  async _call(input: z.infer<typeof this.argsSchema>): Promise<string> {
    const { language, code_structure } = input;
    let structureItems: StructureItem[] = [];

    try {
      // Input from AnalyzeCodeStructureTool is already expected to be a flat list
      const parsedInput = JSON.parse(code_structure);
       if (Array.isArray(parsedInput)) {
           structureItems = parsedInput.filter(item => item && typeof item.name === 'string' && typeof item.start_line === 'number' && typeof item.type === 'string');
       } else {
           // Handle cases where it might be nested (though current Analyze tool provides flat list)
           console.warn("CheckNamingConventionsLLMTool: Received unexpected code_structure format, expected flat array.");
           return JSON.stringify({ error: "Invalid code_structure input format." });
       }

    } catch (e) {
      console.error("CheckNamingConventionsLLMTool: Failed to parse code_structure JSON.", e);
      return JSON.stringify({ error: "Invalid code_structure input. Expected valid JSON array.", input: code_structure });
    }

    if (!structureItems || structureItems.length === 0) {
      console.log("CheckNamingConventionsLLMTool: No structure items provided to check.");
      return JSON.stringify([]); // No items to check, no violations
    }

    const conventionRules = this.getConventionRules(language);
    const itemsToCheckJson = JSON.stringify(structureItems.map(item => ({ name: item.name, type: item.type, line: item.start_line })), null, 2);

    const prompt = `
You are a code style analyzer. Your task is to identify violations of standard naming conventions in a given list of code elements.

Language: ${language}
Standard Naming Conventions for ${language}:
${conventionRules}

List of Code Elements (name, type, line number):
\`\`\`json
${itemsToCheckJson}
\`\`\`

Instructions:
1. Analyze ONLY the names provided in the JSON list above.
2. Identify which items violate the specified naming conventions for their type in ${language}.
3. Return ONLY a valid JSON list containing ONLY the items that VIOLATE the conventions.
4. Each item in the output list must include: "name" (string), "type" (string), "line" (number), and "rule_violated" (string, explaining the violation, e.g., "Expected snake_case for function").
5. If NO items in the input list violate the conventions, return an empty JSON list: [].
6. Do NOT hallucinate items not present in the input list. Do not include items that follow the conventions.

Output JSON List of Violations:`;

    try {
      console.log(`CheckNamingConventionsLLMTool: Calling LLM with ${structureItems.length} items to check...`);
      const response = await this.llm.call(prompt);
      const responseJson = response.trim();
      console.log(`CheckNamingConventionsLLMTool Raw LLM Response: ${responseJson}`);

      // Attempt to parse the response as JSON
      let findings: NamingViolationFinding[];
      try {
          findings = JSON.parse(responseJson);
          // Basic validation of the parsed structure
          if (!Array.isArray(findings)) {
              throw new Error("LLM response is not a JSON array.");
          }
          // Optional: More rigorous validation of each item in the array
          findings = findings.filter(item =>
              item && typeof item.name === 'string' &&
              typeof item.type === 'string' &&
              typeof item.line === 'number' &&
              typeof item.rule_violated === 'string'
          ).map(item => ({ ...item, language })); // Add language field

          console.log(`CheckNamingConventionsLLMTool Parsed ${findings.length} violations.`);
          return JSON.stringify(findings);

      } catch (parseError: any) {
           console.error(`CheckNamingConventionsLLMTool: Failed to parse LLM response as JSON. Error: ${parseError.message}. Response:\n${responseJson}`);
           // Attempt to extract JSON from potential markdown fences
           const jsonMatch = responseJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
           if (jsonMatch && jsonMatch[1]) {
               try {
                   findings = JSON.parse(jsonMatch[1]);
                    if (!Array.isArray(findings)) {
                        throw new Error("LLM response (extracted) is not a JSON array.");
                    }
                    findings = findings.filter(item =>
                        item && typeof item.name === 'string' &&
                        typeof item.type === 'string' &&
                        typeof item.line === 'number' &&
                        typeof item.rule_violated === 'string'
                    ).map(item => ({ ...item, language }));
                   console.log(`CheckNamingConventionsLLMTool Parsed ${findings.length} violations after extracting from markdown.`);
                   return JSON.stringify(findings);
               } catch (nestedParseError: any) {
                    console.error(`CheckNamingConventionsLLMTool: Failed to parse extracted JSON. Error: ${nestedParseError.message}`);
               }
           }
           return JSON.stringify({ error: "LLM response was not valid JSON.", response: responseJson });
      }

    } catch (error: any) {
      console.error(`CheckNamingConventionsLLMTool: LLM call failed:`, error);
      return JSON.stringify({ error: `LLM call failed: ${error.message || 'Unknown error'}` });
    }
  }
}
