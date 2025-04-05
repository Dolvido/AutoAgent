// src/lib/agents/critique-tools/analyze-code-structure.tool.ts
import { Tool } from "@langchain/core/tools";
// Use require for potential CJS/ESM interop issues
const TreeSitter = require('web-tree-sitter');
// Import Zod for schema definition
import { z } from "zod";

// --- Helper Types ---
interface StructureItem {
  name: string;
  type: 'class' | 'function' | 'method' | 'interface' | 'type_alias';
  start_line: number; // 1-based
  end_line: number;   // 1-based
}

interface ParserLanguage {
  // Use explicit types from the required module if possible
  // WORKAROUND: Use 'any' due to persistent type resolution issues
  parser: any; // WAS: TreeSitter.Parser;
  language: any; // WAS: TreeSitter.Language;
}

// Cache for initialized parsers/languages to avoid reloading WASM
const languageCache: { [lang: string]: Promise<ParserLanguage> } = {};

// Flag to ensure init is called only once
let parserInitialized = false;

// --- Tool Definition ---
export class AnalyzeCodeStructureTool extends Tool {
  name = "AnalyzeCodeStructureTool";
  description = `Analyzes code content using Tree-sitter to accurately identify structures like class, function, method definitions and their start/end line numbers. Output is a JSON string list of findings. Input requires 'code_content' (string) and 'language' (string).`;

  // ** Define Input Schema using Zod **
  argsSchema = z.object({
    code_content: z.string().describe("The full source code content of the file."),
    language: z.string().describe("The programming language of the code (e.g., python, javascript).")
  });

  // --- Helper to Load Language ---
  private async getLanguageParser(language: string): Promise<ParserLanguage | null> {
    const languageMap: { [key: string]: string } = {
      python: '/tree-sitter-python.wasm',
      javascript: '/tree-sitter-javascript.wasm',
      typescript: '/tree-sitter-typescript.wasm',
      // Add paths for other language WASM files placed in /public
    };

    const wasmPath = languageMap[language];
    if (!wasmPath) {
      console.error(`AnalyzeCodeStructureTool: Unsupported language '${language}', no WASM path defined.`);
      return null;
    }

    // Initialize Parser once using require'd module
    if (!parserInitialized) {
         try {
             if (typeof TreeSitter.init !== 'function') {
                 throw new Error('TreeSitter.init function not found on the required module.');
             }
             await TreeSitter.init({
                 locateFile(scriptName: string, scriptDirectory: string) {
                     return '/tree-sitter.wasm'; 
                 }
             });
             parserInitialized = true; 
             console.log("Tree-sitter parser initialized.");
         } catch (initError) {
             console.error("AnalyzeCodeStructureTool: Failed to initialize Tree-sitter parser:", initError);
             // Prevent further attempts if init fails fundamentally
             parserInitialized = true; // Set flag anyway to prevent retries on subsequent calls
             throw new Error("Tree-sitter parser initialization failed.");
         }
     }

    // Use cache to avoid re-fetching/re-initializing language grammar
    if (!languageCache[language]) {
      languageCache[language] = (async () => {
          try {
            console.log(`Loading Tree-sitter grammar for ${language} from ${wasmPath}...`);
            if (!TreeSitter.Language || typeof TreeSitter.Language.load !== 'function') {
                throw new Error('TreeSitter.Language.load function not found.');
            }
            const langObj = await TreeSitter.Language.load(wasmPath);
            
            // WORKAROUND: Check for Parser constructor existence before calling
            // Assuming it exists directly on the required module object based on common patterns
            let ParserConstructor = TreeSitter.Parser; // Attempt direct access
            if (typeof ParserConstructor !== 'function') {
                // Fallback: Maybe it's the module itself?
                 ParserConstructor = TreeSitter; 
                 if (typeof ParserConstructor !== 'function') {
                     throw new Error('TreeSitter.Parser constructor not found on module or as default.');
                 }
                 console.warn("AnalyzeCodeStructureTool: Using TreeSitter module itself as constructor.");
            }
            const parser = new ParserConstructor(); // Use the resolved constructor

            parser.setLanguage(langObj);
            console.log(`Grammar for ${language} loaded successfully.`);
            return { parser, language: langObj };
          } catch (error) {
             console.error(`AnalyzeCodeStructureTool: Failed to load Tree-sitter grammar for ${language} from ${wasmPath}:`, error);
             delete languageCache[language];
             throw new Error(`Failed to load grammar for ${language}`);
          }
      })();
    }
     try {
         return await languageCache[language];
     } catch (e) {
         return null;
     }
  }

  // --- Tool Execution ---
  async _call(input: z.infer<typeof this.argsSchema>): Promise<string> {
    const { code_content, language } = input;
    const findings: StructureItem[] = [];

    const parserLanguage = await this.getLanguageParser(language);
    if (!parserLanguage) {
      return JSON.stringify({ error: `Unsupported language or failed to load grammar: ${language}` });
    }

    const { parser, language: langObj } = parserLanguage;
    // WORKAROUND: Use 'any' for tree type
    let tree: any; // WAS: TreeSitter.Tree 
    try {
      tree = (parser as any).parse(code_content);
    } catch (parseError) {
        console.error(`AnalyzeCodeStructureTool: Failed to parse code for language ${language}:`, parseError);
        return JSON.stringify({ error: `Failed to parse code for language ${language}` });
    }

    // --- Define Tree-sitter Queries (Language Specific) ---
    // Explicitly type query objects to satisfy the StructureItem['type'] union
    let queries: { type: StructureItem['type'], query: string }[] = [];

    if (language === 'python') {
      queries = [
        { type: 'class', query: `(class_definition name: (identifier) @name) @definition` },
        { type: 'function', query: `(function_definition name: (identifier) @name) @definition` },
        { type: 'method', query: `(class_definition body: (_ (function_definition name: (identifier) @name) @definition))` }
      ];
    } else if (language === 'javascript' || language === 'typescript') {
        const baseJsQueries: { type: StructureItem['type'], query: string }[] = [
            { type: 'class', query: `(class_declaration name: (identifier) @name) @definition` },
            { type: 'function', query: `(function_declaration name: (identifier) @name) @definition` },
            { type: 'function', query: `(export_statement declaration: (function_declaration name: (identifier) @name)) @definition` },
            { type: 'function', query: `(lexical_declaration (variable_declarator name: (identifier) @name value: (arrow_function))) @definition`},
            { type: 'method', query: `(class_body (method_definition name: (property_identifier) @name)) @definition`},
        ];
        const tsQueries: { type: StructureItem['type'], query: string }[] = language === 'typescript' ? [
             { type: 'interface', query: `(interface_declaration name: (type_identifier) @name) @definition` },
             { type: 'type_alias', query: `(type_alias_declaration name: (type_identifier) @name) @definition` }
        ] : [];
        queries = [...baseJsQueries, ...tsQueries];
    }
    // Add queries for other languages...

    // --- Execute Queries and Extract Data ---
     if (queries.length > 0 && langObj) {
         try {
             for (const { type, query: queryString } of queries) {
                 const treeQuery = langObj.query(queryString);
                 if (!tree?.rootNode) {
                    console.error("AnalyzeCodeStructureTool: Failed to parse code, tree or rootNode is null.");
                    return JSON.stringify({ error: `Failed to parse code tree for ${language}` });
                 }
                 const matches = treeQuery.matches(tree.rootNode);

                 for (const match of matches) {
                     // WORKAROUND: Use 'any' for capture type
                     const definitionNode = match.captures.find((c: any) => c.name === 'definition')?.node;
                     const nameNode = match.captures.find((c: any) => c.name === 'name')?.node;

                     if (nameNode && definitionNode) {
                         findings.push({
                             name: nameNode.text,
                             type: type, // Type is already correct from the loop
                             start_line: definitionNode.startPosition.row + 1, 
                             end_line: definitionNode.endPosition.row + 1,   
                         });
                     }
                 }
             }
         } catch (queryError) {
             console.error(`AnalyzeCodeStructureTool: Error executing Tree-sitter query for ${language}:`, queryError);
             // Decide how to handle query errors - maybe return partial findings or an error message
             return JSON.stringify({ error: `Error during code analysis for ${language}` });
         }
     } else if (!langObj) {
         console.warn(`AnalyzeCodeStructureTool: Language object not available for queries in ${language}.`);
     }


    console.log(`AnalyzeCodeStructureTool (Tree-sitter) found ${findings.length} structure items.`);
    // Return findings as a JSON string.
    // Providing a flat list might be easiest for other tools to consume initially.
    // Deduplication might be needed if queries overlap (e.g., function and method)
    const uniqueFindings = findings.filter((finding, index, self) =>
        index === self.findIndex((f) => (
            f.name === finding.name && f.start_line === finding.start_line && f.type === finding.type
        ))
    );
    return JSON.stringify(uniqueFindings);
  }
}