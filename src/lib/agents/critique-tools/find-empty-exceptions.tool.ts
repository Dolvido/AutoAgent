// src/lib/agents/critique-tools/find-empty-exceptions.tool.ts
import { Tool } from "@langchain/core/tools";
// Import Zod
import { z } from "zod";

interface EmptyExceptionFinding {
  line: number;
  block: string;
  language: string;
}

export class FindEmptyExceptionBlocksTool extends Tool {
  name = "FindEmptyExceptionBlocksTool";
  description = "Scans code content for empty exception blocks (like 'except: pass' or 'catch {}') based on the language and returns a list of findings with line numbers. Requires 'code_content' and 'language' inputs.";

  // ** Define Input Schema **
  argsSchema = z.object({
    code_content: z.string().describe("The full source code content of the file."),
    language: z.string().describe("The programming language (e.g., python, javascript).")
  });

  // ** Update _call signature **
  async _call(input: z.infer<typeof this.argsSchema>): Promise<string> {
    const { code_content, language } = input;
    const findings: EmptyExceptionFinding[] = [];
    const lines = code_content.split('\\n');

    let patterns: RegExp[] = [];

    // --- Language-Specific Regex ---
    if (language === 'python') {
      patterns = [
        /^\s*except\s*:\s*(?:pass)?\s*(#.*)?$/, // except: pass or except:
        /^\s*except\s+Exception\s*:\s*(?:pass)?\s*(#.*)?$/, // except Exception: pass or except Exception:
        // Add more specific variations if needed
      ];
    } else if (language === 'javascript' || language === 'typescript') {
      patterns = [
        /catch\s*\(\s*\)\s*\{\s*\}/,          // catch() {}
        /catch\s*\(\s*\w+\s*\)\s*\{\s*\}/,  // catch(e) {}
      ];
    }
    // Add patterns for other languages...

    if (patterns.length === 0) {
      // Optionally return a message or empty list if language not supported
      console.warn(`FindEmptyExceptionBlocksTool: Language '${language}' not explicitly supported with regex patterns.`);
      return JSON.stringify([]);
    }

    // --- Scan Lines ---
    lines.forEach((line, index) => {
      patterns.forEach(pattern => {
        const match = line.match(pattern);
        if (match) {
          findings.push({
            line: index + 1, // 1-based line number
            block: match[0].trim(), // The matched empty block pattern
            language: language
          });
          // Optional: Break inner loop if one pattern matches to avoid duplicate line findings
          // return; 
        }
      });
    });

    console.log(`FindEmptyExceptionBlocksTool found ${findings.length} potential empty blocks.`);
    return JSON.stringify(findings); // Return findings as a JSON string for the agent
  }
}