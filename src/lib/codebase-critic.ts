import { Ollama } from '@langchain/community/llms/ollama';
import { getActivePromptTemplate, recordPromptUsage, updatePromptPerformance, findSimilarExamples, recordExampleInVectorStore } from './self-improvement-loop';

// Import types from codebase-explorer
interface CodeFile {
  path: string;
  content: string;
}

interface DependencyGraph {
  [filePath: string]: string[];
}

interface CodebaseStructure {
  files: CodeFile[];
  dependencyGraph: DependencyGraph;
  fileTypes: { [extension: string]: number };
  codeMetrics: {
    totalLines: number;
    totalFiles: number;
    averageLinesPerFile: number;
    filesByExtension: { [key: string]: number };
  };
}

interface CodebaseCritique {
  summary: string;
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    files: string[];
    recommendation: string;
  }>;
  strengths: string[];
  improvement_areas: string[];
}

export class CodebaseCritic {
  private structure: CodebaseStructure;
  private ollama: Ollama | null = null;
  private ruleBasedFindings: CodebaseCritique | null = null;
  private options: any; // Define specific options type if available
  
  constructor(structure: CodebaseStructure, options?: any) {
    // Validate structure basics first
    if (!structure || !structure.files || !structure.codeMetrics) {
        throw new Error("Invalid CodebaseStructure provided to CodebaseCritic constructor: Missing essential properties.");
    }

    // Filter the files array to ensure all entries are valid { path: string; content: string; }
    const validFiles = structure.files.filter(file => 
      file && 
      typeof file.path === 'string' && 
      file.path.trim() !== '' && 
      typeof file.content === 'string' // Ensure content is also a string
    );

    // Check if filtering removed any files
    if (validFiles.length !== structure.files.length) {
      console.warn(`CodebaseCritic constructor: Filtered out ${structure.files.length - validFiles.length} invalid file entries.`);
    }

    // Use the validated structure
    this.structure = {
      ...structure,
      files: validFiles, 
    };

    this.options = options || {};
    
    // Try to initialize Ollama
    try {
      this.ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: 'codellama:latest', // Use the latest CodeLlama model specifically
        temperature: 0.1, // Lower temperature for more focused and precise analysis
        maxRetries: 3, // Retry up to 3 times on failure
        cache: false, // Disable caching to ensure fresh analysis
      });
      
      console.log("Initialized CodebaseCritic with Ollama model: codellama:latest");
    } catch (error) {
      console.warn("Failed to initialize Ollama:", error);
      this.ollama = null;
    }
  }
  
  /**
   * Generate a critique of the codebase
   */
  async generateCritique(): Promise<CodebaseCritique> {
    // If Ollama is configured, use it for analysis
    if (this.ollama) {
      return this.generateLLMCritique();
    }
    
    // Otherwise, use rule-based analysis
    return this.generateRuleBasedCritique();
  }
  
  /**
   * Generate critique using Ollama
   */
  private async generateLLMCritique(): Promise<CodebaseCritique> {
    try {
      // Prepare the data for the LLM
      const codebaseOverview = this.prepareCodebaseOverview();
      const sampleFiles = this.selectSampleFiles();
      
      // Create the prompt
      const prompt = await this.createLLMPrompt(codebaseOverview, sampleFiles);
      
      // Call Ollama
      const response = await this.ollama!.call(prompt);
      
      // Parse the response
      const llmCritique = this.parseLLMResponse(response);
      
      // Integrate rule-based findings
      console.log("Integrating rule-based findings with LLM critique...");
      return this.integrateRuleBasedFindings(llmCritique);
    } catch (error) {
      console.error("Error calling Ollama:", error);
      // Fall back to rule-based analysis
      console.log("Falling back to pure rule-based analysis due to LLM error");
      return this.generateRuleBasedCritique();
    }
  }
  
  /**
   * Generate critique using rule-based analysis
   */
  private generateRuleBasedCritique(): CodebaseCritique {
    console.log("Generating rule-based analysis findings...");
    
    // Analyze file organization
    const organizationFindings = this.analyzeFileOrganization();
    console.log(`Found ${organizationFindings.length} file organization findings`);
    organizationFindings.forEach(finding => {
      console.log(`[Rule] ${finding.severity.toUpperCase()} - ${finding.title}: ${finding.description}`);
    });
    
    // Analyze code quality
    const qualityFindings = this.analyzeCodeQuality();
    console.log(`Found ${qualityFindings.length} code quality findings`);
    qualityFindings.forEach(finding => {
      console.log(`[Rule] ${finding.severity.toUpperCase()} - ${finding.title}: ${finding.description}`);
    });
    
    // Analyze dependencies
    const dependencyFindings = this.analyzeDependencies();
    console.log(`Found ${dependencyFindings.length} dependency findings`);
    dependencyFindings.forEach(finding => {
      console.log(`[Rule] ${finding.severity.toUpperCase()} - ${finding.title}: ${finding.description}`);
    });
    
    // Combine findings
    const allFindings = [
      ...organizationFindings,
      ...qualityFindings,
      ...dependencyFindings
    ];
    
    // Generate strengths
    const strengths = this.identifyStrengths();
    console.log(`Identified ${strengths.length} codebase strengths`);
    
    // Generate improvement areas
    const improvementAreas = this.identifyImprovementAreas();
    console.log(`Identified ${improvementAreas.length} improvement areas`);
    
    // Create the critique summary
    const summary = this.generateSummary(allFindings, strengths, improvementAreas);
    
    console.log("Rule-based analysis complete");
    console.log(`Total findings: ${allFindings.length} (${allFindings.filter(f => f.severity === "high").length} high, ${allFindings.filter(f => f.severity === "medium").length} medium, ${allFindings.filter(f => f.severity === "low").length} low)`);
    
    // Store the rule-based findings for later reference
    this.ruleBasedFindings = {
      findings: allFindings,
      strengths,
      improvement_areas: improvementAreas,
      summary
    };
    
    // Return the complete critique
    return {
      summary,
      findings: allFindings,
      strengths,
      improvement_areas: improvementAreas
    };
  }
  
  /**
   * Analyze the file organization of the codebase
   */
  private analyzeFileOrganization() {
    const findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "low" | "medium" | "high";
      files: string[];
      recommendation: string;
    }> = [];
    
    // Check for consistent file structure
    const directoryCount: { [dir: string]: number } = {};
    this.structure.files.forEach(file => {
      if (!file || !file.path) return;
      const dir = file.path.split('/')[0];
      directoryCount[dir] = (directoryCount[dir] || 0) + 1;
    });
    
    const dirs = Object.keys(directoryCount);
    
    // Detect potential structure issues
    if (dirs.length > 10 && this.structure.files.length < 30) {
      findings.push({
        id: "org-1",
        title: "Too many top-level directories",
        description: "The codebase has a large number of top-level directories with few files, which may indicate a lack of cohesive organization.",
        severity: "medium",
        files: [],
        recommendation: "Consider consolidating related functionality into fewer, well-named directories."
      });
    }
    
    // Check for mixed file types in same directory
    const dirFileTypes: { [dir: string]: Set<string> } = {};
    this.structure.files.forEach(file => {
      if (!file || !file.path) return;
      const parts = file.path.split('/');
      const dir = parts.slice(0, -1).join('/');
      const ext = file.path.split('.').pop() || '';
      
      if (!dirFileTypes[dir]) {
        dirFileTypes[dir] = new Set();
      }
      dirFileTypes[dir].add(ext);
    });
    
    for (const [dir, types] of Object.entries(dirFileTypes)) {
      if (types.size > 5 && dir !== '') {
        findings.push({
          id: "org-2",
          title: "Mixed file types in directory",
          description: `Directory '${dir}' contains many different file types (${types.size}), which may indicate mixed responsibilities.`,
          severity: "low",
          files: this.structure.files
            .filter(f => f.path.startsWith(dir + '/'))
            .map(f => f.path),
          recommendation: "Consider organizing files by their function rather than mixing different types in the same directory."
        });
      }
    }
    
    return findings;
  }
  
  /**
   * Analyze the code quality
   */
  private analyzeCodeQuality() {
    const findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "low" | "medium" | "high";
      files: string[];
      recommendation: string;
    }> = [];
    
    // Check for excessively large files - use relative sizing for small codebases
    const isSmallCodebase = this.structure.files.length < 10;
    const largeFileThreshold = isSmallCodebase ? 300 : 500; // Lower threshold for small codebases
    
    const largeFiles = this.structure.files
      .filter(file => {
        if (!file || !file.content) return false;
        const lines = file.content.split('\n').length;
        return lines > largeFileThreshold;
      })
      .map(f => f.path);
    
    if (largeFiles.length > 0) {
      findings.push({
        id: "qual-1",
        title: "Excessively large files",
        description: `Found ${largeFiles.length} files with more than ${largeFileThreshold} lines of code, which can make maintenance difficult.`,
        severity: "medium",
        files: largeFiles,
        recommendation: "Consider refactoring large files into smaller, more focused modules with single responsibilities."
      });
    }
    
    // Check for inconsistent naming conventions
    const namingIssues = this.detectInconsistentNaming();
    if (namingIssues.files.length > 0) {
      findings.push({
        id: "qual-2",
        title: "Inconsistent naming conventions",
        description: namingIssues.description,
        severity: "medium",
        files: namingIssues.files,
        recommendation: "Standardize naming conventions across the codebase to improve readability and maintainability."
      });
    }
    
    // Check for empty exception blocks
    const emptyExceptionFiles = this.detectEmptyExceptionBlocks();
    if (emptyExceptionFiles.length > 0) {
      findings.push({
        id: "qual-3",
        title: "Empty exception handling",
        description: `Found ${emptyExceptionFiles.length} files with empty exception blocks that swallow errors without proper handling.`,
        severity: "high",
        files: emptyExceptionFiles,
        recommendation: "Add proper error handling to exception blocks, including logging or appropriate error propagation."
      });
    }
    
    // Check for potential code duplication (improved algorithm)
    const duplicatedFiles = this.detectCodeDuplication();
    if (duplicatedFiles.length > 0) {
      findings.push({
        id: "qual-4",
        title: "Potential code duplication",
        description: `Found potential duplicated code across ${duplicatedFiles.length} files. This can lead to maintenance issues when changes are needed.`,
        severity: "medium",
        files: duplicatedFiles,
        recommendation: "Extract duplicated code into reusable functions or classes to improve maintainability."
      });
    }
    
    return findings;
  }
  
  /**
   * Detect inconsistent naming conventions in the codebase
   */
  private detectInconsistentNaming(): { description: string, files: string[] } {
    const fileNamingStyles: { [file: string]: { camelCase: number, snake_case: number, PascalCase: number } } = {};
    const affectedFiles: string[] = [];
    
    // Regular expressions for different naming styles
    const camelCaseRegex = /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g;
    const snake_case_regex = /\b[a-z][a-z0-9]*_[a-z0-9_]*\b/g;
    const PascalCaseRegex = /\b[A-Z][a-zA-Z0-9]*\b/g;
    
    for (const file of this.structure.files) {
      if (!file || !file.path || !file.content) continue;
      
      // Only analyze code files
      const ext = file.path.split('.').pop() || '';
      if (!['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb'].includes(ext)) {
        continue;
      }
      
      // Count occurrences of each naming style
      const camelCaseMatches = (file.content.match(camelCaseRegex) || []).length;
      const snakeCaseMatches = (file.content.match(snake_case_regex) || []).length;
      const pascalCaseMatches = (file.content.match(PascalCaseRegex) || []).length;
      
      fileNamingStyles[file.path] = {
        camelCase: camelCaseMatches,
        snake_case: snakeCaseMatches,
        PascalCase: pascalCaseMatches
      };
      
      // Check if this file uses multiple naming styles consistently
      const styles = fileNamingStyles[file.path];
      const total = styles.camelCase + styles.snake_case + styles.PascalCase;
      
      // Only consider files with a significant number of identifiers
      if (total > 5) {
        const primaryStyle = Math.max(styles.camelCase, styles.snake_case, styles.PascalCase);
        const primaryPercentage = (primaryStyle / total) * 100;
        
        // If less than 70% of identifiers follow the primary style, flag as inconsistent
        if (primaryPercentage < 70) {
          affectedFiles.push(file.path);
        }
      }
    }
    
    let description = "Inconsistent naming conventions detected across the codebase.";
    if (affectedFiles.length > 0) {
      description += ` Found ${affectedFiles.length} files with mixed naming styles (camelCase, snake_case, PascalCase).`;
    }
    
    return { description, files: affectedFiles };
  }
  
  /**
   * Detect empty exception blocks
   */
  private detectEmptyExceptionBlocks(): string[] {
    const affectedFiles: string[] = [];
    
    for (const file of this.structure.files) {
      if (!file || !file.path || !file.content) continue;
      
      const ext = file.path.split('.').pop() || '';
      
      // Python empty exception blocks
      if (ext === 'py' && (/except\s*:[\s\r\n]*pass/.test(file.content) || 
                          /except\s*:[\s\r\n]*(?:#|$)/.test(file.content))) {
        affectedFiles.push(file.path);
        continue;
      }
      
      // JavaScript/TypeScript empty catch blocks
      if (['js', 'jsx', 'ts', 'tsx'].includes(ext) && 
          /catch\s*\([^)]*\)\s*\{[\s\r\n]*\}/.test(file.content)) {
        affectedFiles.push(file.path);
        continue;
      }
      
      // Java/C#/C++ empty catch blocks
      if (['java', 'cs', 'c', 'cpp'].includes(ext) && 
          /catch\s*\([^)]*\)\s*\{[\s\r\n]*\}/.test(file.content)) {
        affectedFiles.push(file.path);
      }
    }
    
    return affectedFiles;
  }
  
  /**
   * Detect code duplication with a more sensitive algorithm for small codebases
   */
  private detectCodeDuplication(): string[] {
    const isSmallCodebase = this.structure.files.length < 10;
    const minChunkSize = isSmallCodebase ? 5 : 10; // Smaller chunks for small codebases
    const similarityThreshold = isSmallCodebase ? 0.2 : 0.3; // Lower threshold for small codebases
    
    // Map to store files with potential duplication
    const duplicatedFiles = new Set<string>();
    
    // Only consider code files
    const codeFiles = this.structure.files.filter(file => {
      if (!file || !file.path) return false;
      const ext = file.path.split('.').pop() || '';
      return ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb'].includes(ext);
    });
    
    // Skip if too few code files
    if (codeFiles.length < 2) {
      return [];
    }
    
    // Compare each file against others
    for (let i = 0; i < codeFiles.length; i++) {
      const fileA = codeFiles[i];
      if (!fileA || !fileA.content || !fileA.path) continue;
      const linesA = fileA.content.split('\n');
      
      for (let j = i + 1; j < codeFiles.length; j++) {
        const fileB = codeFiles[j];
        if (!fileB || !fileB.content || !fileB.path) continue;
        const linesB = fileB.content.split('\n');
        
        // Skip if files are very different in size (helps performance)
        if (linesA.length < 5 || linesB.length < 5) {
          continue;
        }
        
        // Count similar lines
        let similarLines = 0;
        const processedLines = new Set<string>();
        
        for (const lineA of linesA) {
          const trimmedA = lineA.trim();
          // Skip empty lines and very short lines
          if (trimmedA.length < 5 || processedLines.has(trimmedA)) {
            continue;
          }
          
          // Mark as processed to avoid double counting
          processedLines.add(trimmedA);
          
          // Check if this line appears in file B
          if (linesB.some(lineB => lineB.trim() === trimmedA)) {
            similarLines++;
          }
        }
        
        // Calculate similarity percentage
        const totalUniqueLines = processedLines.size;
        const similarity = similarLines / totalUniqueLines;
        
        // If similarity exceeds threshold, mark both files
        if (similarity > similarityThreshold) {
          duplicatedFiles.add(fileA.path);
          duplicatedFiles.add(fileB.path);
        }
      }
    }
    
    return Array.from(duplicatedFiles);
  }
  
  /**
   * Analyze the dependencies between files
   */
  private analyzeDependencies() {
    const findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "low" | "medium" | "high";
      files: string[];
      recommendation: string;
    }> = [];
    
    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies();
    if (circularDeps.length > 0) {
      findings.push({
        id: "dep-1",
        title: "Circular dependencies detected",
        description: `Found ${circularDeps.length} circular dependency chains in the codebase.`,
        severity: "high",
        files: circularDeps.flat(),
        recommendation: "Refactor the code to break circular dependencies, possibly by introducing a new abstraction or moving shared code to a common dependency."
      });
    }
    
    // Check for highly coupled files
    const couplingGraph = this.buildCouplingGraph();
    const highlyCoupledFiles = Object.entries(couplingGraph)
      .filter(([_, dependencies]) => dependencies.length > 10)
      .map(([file, _]) => file);
    
    if (highlyCoupledFiles.length > 0) {
      findings.push({
        id: "dep-2",
        title: "Highly coupled files",
        description: `Found ${highlyCoupledFiles.length} files that are coupled to many other files (>10 dependencies).`,
        severity: "medium",
        files: highlyCoupledFiles,
        recommendation: "Reduce coupling by breaking down highly connected files into smaller, more focused modules."
      });
    }
    
    return findings;
  }
  
  /**
   * Identify strengths of the codebase
   */
  private identifyStrengths(): string[] {
    const strengths: string[] = [];
    
    // Check for consistent file types
    const fileTypes = Object.keys(this.structure.fileTypes);
    if (fileTypes.length < 5) {
      strengths.push("Consistent use of technologies with a focused set of file types.");
    }
    
    // Check for reasonable file sizes
    const averageLinesPerFile = this.structure.codeMetrics.averageLinesPerFile;
    if (averageLinesPerFile < 200) {
      strengths.push("Good file size management with reasonably sized files (average " + averageLinesPerFile + " lines).");
    }
    
    // Check for well-structured directories
    const rootDirs = new Set<string>();
    this.structure.files.forEach(file => {
      if (!file || !file.path) return;
      const parts = file.path.split('/');
      if (parts.length > 1) {
        rootDirs.add(parts[0]);
      }
    });
    
    if (rootDirs.size > 0 && rootDirs.size <= 5) {
      strengths.push("Well-organized top-level directory structure with clear separation of concerns.");
    }
    
    // For demonstration purposes, add some default strengths
    if (strengths.length < 2) {
      strengths.push("The codebase structure shows attention to organization and maintainability.");
      strengths.push("Files are named meaningfully, making navigation easier.");
    }
    
    return strengths;
  }
  
  /**
   * Identify areas for improvement
   */
  private identifyImprovementAreas(): string[] {
    const areas: string[] = [];
    
    // Check for missing documentation
    const docFiles = this.structure.files
      .filter(f => f.path.toLowerCase().includes('readme') || f.path.toLowerCase().includes('documentation'))
      .length;
    
    if (docFiles === 0) {
      areas.push("Consider adding more documentation, such as README files, to improve codebase navigability.");
    }
    
    // Check file organization
    const commonDirs = ['src', 'lib', 'test', 'docs'];
    const hasMissingCommonDirs = commonDirs.some(dir => 
      !this.structure.files.some(f => f.path.startsWith(dir + '/'))
    );
    
    if (hasMissingCommonDirs) {
      areas.push("Consider adopting a more standard project structure with directories for source code, tests, and documentation.");
    }
    
    // Check for test coverage
    const testFiles = this.structure.files
      .filter(f => f.path.includes('test') || f.path.includes('spec'))
      .length;
    
    const totalCodeFiles = Object.entries(this.structure.fileTypes)
      .filter(([ext, _]) => ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp'].includes(ext))
      .reduce((acc, [_, count]) => acc + count, 0);
    
    if (testFiles < totalCodeFiles / 5) { // Less than 20% test files
      areas.push("Improve test coverage by adding more test files to ensure code reliability.");
    }
    
    // For demonstration purposes, add some default areas
    if (areas.length < 2) {
      areas.push("Consider implementing a more consistent error handling strategy across the codebase.");
      areas.push("Review the dependency management to ensure all dependencies are necessary and up-to-date.");
    }
    
    return areas;
  }
  
  /**
   * Generate a summary of the critique
   */
  private generateSummary(
    findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "low" | "medium" | "high";
      files: string[];
      recommendation: string;
    }>,
    strengths: string[],
    improvementAreas: string[]
  ): string {
    const highSeverity = findings.filter(f => f.severity === "high").length;
    const mediumSeverity = findings.filter(f => f.severity === "medium").length;
    const lowSeverity = findings.filter(f => f.severity === "low").length;
    
    let summaryText = `This codebase analysis identified ${findings.length} findings (${highSeverity} high, ${mediumSeverity} medium, and ${lowSeverity} low severity issues). `;
    
    if (strengths.length > 0) {
      summaryText += `The codebase shows ${strengths.length} notable strengths, particularly in ${strengths[0].toLowerCase()} `;
    }
    
    if (improvementAreas.length > 0) {
      summaryText += `Key areas for improvement include ${improvementAreas[0].toLowerCase()} and ${improvementAreas.length > 1 ? improvementAreas[1].toLowerCase() : 'overall code organization'}. `;
    }
    
    summaryText += `The codebase contains ${this.structure.codeMetrics.totalFiles} files with approximately ${this.structure.codeMetrics.totalLines} lines of code.`;
    
    return summaryText;
  }
  
  /**
   * Detect circular dependencies in the codebase
   */
  private detectCircularDependencies(): string[][] {
    const graph = this.structure.dependencyGraph;
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const circularDeps: string[][] = [];
    
    const dfs = (node: string, path: string[] = []): boolean => {
      // Skip if node doesn't exist in graph
      if (!graph[node]) return false;
      
      // Mark current node as visited and add to recursion stack
      visited.add(node);
      recStack.add(node);
      path.push(node);
      
      // Visit all dependencies
      for (const dep of graph[node]) {
        // If not visited, check if we find a cycle through it
        if (!visited.has(dep)) {
          if (dfs(dep, [...path])) return true;
        } 
        // If already in recursion stack, we found a cycle
        else if (recStack.has(dep)) {
          // Find where the cycle starts
          const cycleStartIndex = path.indexOf(dep);
          if (cycleStartIndex >= 0) {
            const cycle = path.slice(cycleStartIndex).concat(dep);
            circularDeps.push(cycle);
          }
          return true;
        }
      }
      
      // Remove from recursion stack
      recStack.delete(node);
      return false;
    };
    
    // Try DFS from each unvisited node
    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }
    
    return circularDeps;
  }
  
  /**
   * Build a graph of file coupling (which files are dependent on each other)
   */
  private buildCouplingGraph() {
    const couplingGraph: { [file: string]: string[] } = {};
    
    for (const [file, dependencies] of Object.entries(this.structure.dependencyGraph)) {
      couplingGraph[file] = dependencies;
      
      // Add reverse dependencies
      for (const dep of dependencies) {
        if (!couplingGraph[dep]) {
          couplingGraph[dep] = [];
        }
        if (!couplingGraph[dep].includes(file)) {
          couplingGraph[dep].push(file);
        }
      }
    }
    
    return couplingGraph;
  }
  
  /**
   * Prepare an overview of the codebase for analysis
   */
  private prepareCodebaseOverview(): string {
    const { files, fileTypes, codeMetrics } = this.structure;
    
    // Basic statistics
    const overview = [
      `The codebase contains ${files.length} files with approximately ${codeMetrics.totalLines} lines of code.`,
      `Average file size is ${codeMetrics.averageLinesPerFile.toFixed(1)} lines.`,
    ];
    
    // File type distribution
    const fileTypeEntries = Object.entries(fileTypes);
    if (fileTypeEntries.length > 0) {
      const fileTypeList = fileTypeEntries
        .sort((a, b) => b[1] - a[1])
        .map(([ext, count]) => `${ext}: ${count} files`)
        .join(", ");
      
      overview.push(`File types: ${fileTypeList}.`);
    }
    
    // Analyze file structure
    const topDirs = new Map<string, number>();
    files.forEach(file => {
      if (!file || !file.path) return;
      const parts = file.path.split('/');
      if (parts.length > 1) {
        const topDir = parts[0];
        topDirs.set(topDir, (topDirs.get(topDir) || 0) + 1);
      }
    });
    
    if (topDirs.size > 0) {
      const topDirsList = Array.from(topDirs.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([dir, count]) => `${dir} (${count} files)`)
        .join(", ");
      
      overview.push(`Top-level directories: ${topDirsList}.`);
    }
    
    // Analyze function naming conventions
    const functionPatterns = this.analyzeFunctionNamingPatterns();
    if (functionPatterns.length > 0) {
      overview.push(`Function naming conventions: ${functionPatterns}.`);
    }
    
    // Check for potential duplicated code
    const duplicationInfo = this.checkForPotentialDuplication();
    if (duplicationInfo) {
      overview.push(duplicationInfo);
    }
    
    // Check for error handling patterns
    const errorHandlingInfo = this.analyzeErrorHandlingPatterns();
    if (errorHandlingInfo) {
      overview.push(errorHandlingInfo);
    }
    
    // Check for test coverage
    const testCoverageInfo = this.analyzeTestCoverage();
    if (testCoverageInfo) {
      overview.push(testCoverageInfo);
    }
    
    return overview.join("\n\n");
  }
  
  /**
   * Analyze function naming patterns in the codebase
   */
  private analyzeFunctionNamingPatterns(): string {
    // Function name regex patterns
    const camelCaseRegex = /function\s+([a-z][a-zA-Z0-9]*)\s*\(/g;
    const pascalCaseRegex = /function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g;
    const snake_case_regex = /function\s+([a-z][a-z0-9_]*)\s*\(/g;
    const pythonDefRegex = /def\s+([a-zA-Z0-9_]+)\s*\(/g;
    
    // Count patterns
    let camelCaseCount = 0;
    let pascalCaseCount = 0;
    let snakeCaseCount = 0;
    let mixedCount = 0;
    
    // Example of mixed naming functions
    const mixedNamingExamples: string[] = [];
    
    // Analyze each file
    for (const file of this.structure.files) {
      if (!file || !file.path || !file.content) continue;
      const content = file.content;
      const fileExt = file.path.split('.').pop()?.toLowerCase() || '';
      
      if (fileExt === 'py') {
        // Python files
        let match;
        while ((match = pythonDefRegex.exec(content)) !== null) {
          const funcName = match[1];
          if (funcName.includes('_')) {
            snakeCaseCount++;
          } else if (/^[a-z]/.test(funcName)) {
            camelCaseCount++;
          } else if (/^[A-Z]/.test(funcName)) {
            pascalCaseCount++;
          } else {
            mixedCount++;
            if (mixedNamingExamples.length < 3) {
              mixedNamingExamples.push(`'${funcName}' in ${file.path}`);
            }
          }
        }
      } else if (['js', 'ts', 'jsx', 'tsx'].includes(fileExt)) {
        // JavaScript/TypeScript files
        let match;
        
        // Reset regex lastIndex
        camelCaseRegex.lastIndex = 0;
        pascalCaseRegex.lastIndex = 0;
        snake_case_regex.lastIndex = 0;
        
        while ((match = camelCaseRegex.exec(content)) !== null) {
          camelCaseCount++;
        }
        
        while ((match = pascalCaseRegex.exec(content)) !== null) {
          pascalCaseCount++;
          if (mixedNamingExamples.length < 3 && camelCaseCount > 0) {
            mixedNamingExamples.push(`'${match[1]}' in ${file.path} (PascalCase mixed with camelCase)`);
          }
        }
        
        while ((match = snake_case_regex.exec(content)) !== null) {
          snakeCaseCount++;
          if (mixedNamingExamples.length < 3 && (camelCaseCount > 0 || pascalCaseCount > 0)) {
            mixedNamingExamples.push(`'${match[1]}' in ${file.path} (snake_case mixed with other conventions)`);
          }
        }
      }
    }
    
    // Build the report
    const conventions: string[] = [];
    if (camelCaseCount > 0) conventions.push(`camelCase (${camelCaseCount})`);
    if (pascalCaseCount > 0) conventions.push(`PascalCase (${pascalCaseCount})`);
    if (snakeCaseCount > 0) conventions.push(`snake_case (${snakeCaseCount})`);
    
    if (conventions.length === 0) return '';
    
    let report = conventions.join(', ');
    if (mixedNamingExamples.length > 0) {
      report += `. Potential naming inconsistencies found: ${mixedNamingExamples.join('; ')}`;
    }
    
    return report;
  }
  
  /**
   * Check for potential code duplication
   */
  private checkForPotentialDuplication(): string | null {
    const duplicateCandidates: { file1: string; file2: string; similarity: number }[] = [];
    const files = this.structure.files;
    
    // Check each pair of files for similarity
    for (let i = 0; i < files.length; i++) {
      const file1 = files[i];
      if (!file1 || !file1.path || !file1.content || file1.content.length < 100) continue;
      
      for (let j = i + 1; j < files.length; j++) {
        const file2 = files[j];
        if (!file2 || !file2.path || !file2.content || file2.content.length < 100) continue;
        
        // Quick similarity check by common line count
        const lines1 = file1.content.split('\n');
        const lines2 = file2.content.split('\n');
        
        let commonLineCount = 0;
        for (const line of lines1) {
          if (line.trim().length > 5 && lines2.includes(line)) {
            commonLineCount++;
          }
        }
        
        const similarity = commonLineCount / Math.min(lines1.length, lines2.length);
        if (similarity > 0.2) {  // 20% or more similar
          duplicateCandidates.push({
            file1: file1.path,
            file2: file2.path,
            similarity: similarity
          });
        }
      }
    }
    
    if (duplicateCandidates.length === 0) return null;
    
    // Sort by similarity descending
    duplicateCandidates.sort((a, b) => b.similarity - a.similarity);
    
    // Take top 3
    const topDuplicates = duplicateCandidates.slice(0, 3);
    
    return `Potential code duplication detected between: ${topDuplicates.map(
      d => `${d.file1} and ${d.file2} (${Math.round(d.similarity * 100)}% similar)`
    ).join('; ')}`;
  }
  
  /**
   * Analyze error handling patterns
   */
  private analyzeErrorHandlingPatterns(): string | null {
    let bareExceptCount = 0;
    let emptyExceptCount = 0;
    let noErrorHandlingCount = 0;
    const problemFiles: string[] = [];
    
    for (const file of this.structure.files) {
      if (!file || !file.path || !file.content) continue;
      const content = file.content;
      const fileExt = file.path.split('.').pop()?.toLowerCase() || '';
      
      if (fileExt === 'py') {
        // Check for bare except
        const bareExceptMatches = content.match(/except:/g) || [];
        bareExceptCount += bareExceptMatches.length;
        
        // Check for empty except blocks
        const emptyExceptMatches = content.match(/except[^:]*:\s*\n\s*pass/g) || [];
        emptyExceptCount += emptyExceptMatches.length;
        
        if (bareExceptMatches.length > 0 || emptyExceptMatches.length > 0) {
          problemFiles.push(file.path);
        }
      } else if (['js', 'ts', 'jsx', 'tsx'].includes(fileExt)) {
        // Check for try without catch
        const tryWithoutCatchMatches = content.match(/try\s*{[^}]*}\s*(?!catch)/g) || [];
        noErrorHandlingCount += tryWithoutCatchMatches.length;
        
        // Check for empty catch blocks
        const emptyCatchMatches = content.match(/catch\s*\([^)]*\)\s*{\s*}/g) || [];
        emptyExceptCount += emptyCatchMatches.length;
        
        if (tryWithoutCatchMatches.length > 0 || emptyCatchMatches.length > 0) {
          problemFiles.push(file.path);
        }
      }
    }
    
    if (bareExceptCount === 0 && emptyExceptCount === 0 && noErrorHandlingCount === 0) return null;
    
    let report = 'Error handling issues detected: ';
    const issues: string[] = [];
    
    if (bareExceptCount > 0) issues.push(`${bareExceptCount} bare except clauses`);
    if (emptyExceptCount > 0) issues.push(`${emptyExceptCount} empty catch/except blocks`);
    if (noErrorHandlingCount > 0) issues.push(`${noErrorHandlingCount} try blocks without proper error handling`);
    
    report += issues.join(', ');
    
    if (problemFiles.length > 0) {
      report += ` in files: ${problemFiles.slice(0, 3).join(', ')}${problemFiles.length > 3 ? ` and ${problemFiles.length - 3} more` : ''}`;
    }
    
    return report;
  }
  
  /**
   * Analyze test coverage
   */
  private analyzeTestCoverage(): string | null {
    // Count test files
    const testFiles = this.structure.files.filter(file => {
      if (!file || !file.path) return false;
      const name = file.path.toLowerCase();
      return name.includes('test') || name.includes('spec');
    });
    
    // Count source files (exclude tests, configs, etc.)
    const sourceFiles = this.structure.files.filter(file => {
      if (!file || !file.path) return false;
      const name = file.path.toLowerCase();
      const ext = name.split('.').pop() || '';
      
      // Check if it's a code file
      const isCodeFile = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb'].includes(ext);
      
      // Exclude test files and common non-source files
      const isNotTestOrConfig = !name.includes('test') && !name.includes('spec') && 
                               !name.includes('config') && !name.includes('package.json');
      
      return isCodeFile && isNotTestOrConfig;
    });
    
    if (testFiles.length === 0 && sourceFiles.length > 0) {
      return `No test files found for ${sourceFiles.length} source files. Test coverage appears to be missing.`;
    }
    
    const coverageRatio = testFiles.length / (sourceFiles.length || 1);
    
    if (coverageRatio < 0.2) {
      return `Low test coverage: ${testFiles.length} test files for ${sourceFiles.length} source files (${Math.round(coverageRatio * 100)}% ratio).`;
    }
    
    return null;
  }
  
  /**
   * Select a sample of representative files for LLM analysis
   */
  private selectSampleFiles(): string[] {
    const samples: string[] = [];
    const maxSampleBytes = 150000; // Increased limit for more comprehensive analysis
    let currentBytes = 0;
    
    // Get total size of all files to check if this is a small project
    const totalBytes = this.structure.files.reduce((sum, file) => sum + (file.content.length || 0), 0);
    const isSmallProject = totalBytes < 200000; // Consider projects under 200KB as small
    
    // For small projects, try to include all files if possible
    if (isSmallProject) {
      console.log("Small project detected, attempting to include all files in analysis");
      
      // Sort files by importance (entry points first, then by size)
      const sortedFiles = [...this.structure.files].sort((a, b) => {
        if (!a || !b || !a.path || !b.path) return 0;
        
        // First prioritize entry point files
        const aIsEntryPoint = a.path.includes("app.") || a.path.includes("main.") || a.path.includes("index.");
        const bIsEntryPoint = b.path.includes("app.") || b.path.includes("main.") || b.path.includes("index.");
        
        if (aIsEntryPoint && !bIsEntryPoint) return -1;
        if (!aIsEntryPoint && bIsEntryPoint) return 1;
        
        // Then prioritize code files over non-code files
        const aIsCode = [".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".cs"].some(ext => a.path.endsWith(ext));
        const bIsCode = [".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".c", ".cpp", ".cs"].some(ext => b.path.endsWith(ext));
        
        if (aIsCode && !bIsCode) return -1;
        if (!aIsCode && bIsCode) return 1;
        
        // Then prioritize smaller files to maximize diversity
        return (a.content.length || 0) - (b.content.length || 0);
      });
      
      // Add as many files as possible
      for (const file of sortedFiles) {
        if (!file || !file.path || !file.content) continue;
        if (currentBytes + file.content.length <= maxSampleBytes) {
          samples.push(file.path);
          currentBytes += file.content.length;
        }
      }
      
      // If we've included all or most files, return immediately
      if (samples.length >= this.structure.files.length * 0.8) {
        console.log(`Included ${samples.length}/${this.structure.files.length} files in analysis`);
        return samples;
      }
    }
    
    // If it's not a small project or we couldn't include enough files, use the regular logic
    // Clear samples and start over
    samples.length = 0;
    currentBytes = 0;
    
    // Try to get important files first
    const importantFiles = this.findImportantFiles();
    for (const file of importantFiles) {
      if (!file || !file.path || !file.content) continue;
      if (currentBytes + file.content.length <= maxSampleBytes) {
        samples.push(file.path);
        currentBytes += file.content.length;
      }
    }
    
    // Then get representative samples of different file types
    const filesByExt: { [ext: string]: CodeFile[] } = {};
    for (const file of this.structure.files) {
      if (!file || !file.path || !file.content) continue;
      if (samples.includes(file.path)) continue;
      
      const ext = file.path.split('.').pop() || 'unknown';
      if (!filesByExt[ext]) {
        filesByExt[ext] = [];
      }
      filesByExt[ext].push(file);
    }
    
    // Take at least one file of each type, respecting the byte limit
    for (const [_, files] of Object.entries(filesByExt)) {
      if (files.length > 0) {
        // Sort by size (smallest first) to maximize diversity
        files.sort((a, b) => (a.content.length || 0) - (b.content.length || 0));
        
        const file = files[0];
        if (!file || !file.path || !file.content) continue;
        if (currentBytes + file.content.length <= maxSampleBytes) {
          samples.push(file.path);
          currentBytes += file.content.length;
        }
      }
    }
    
    // If we haven't reached our limit, add more diverse files
    if (currentBytes < maxSampleBytes) {
      const remainingFiles = this.structure.files
        .filter(file => file && file.path && file.content && !samples.includes(file.path))
        .sort((a, b) => {
          if (!a || !b || !a.path || !b.path) return 0;
          
          // Prioritize files with reasonable size (not too small, not too large)
          const aLines = a.content.split('\n').length;
          const bLines = b.content.split('\n').length;
          const aScore = Math.abs(aLines - 100); // Ideal size around 100 lines
          const bScore = Math.abs(bLines - 100);
          return aScore - bScore;
        });
      
      for (const file of remainingFiles) {
        if (!file || !file.path || !file.content) continue;
        if (currentBytes + file.content.length <= maxSampleBytes) {
          samples.push(file.path);
          currentBytes += file.content.length;
        }
      }
    }
    
    return samples;
  }
  
  /**
   * Find important files in the codebase for analysis
   */
  private findImportantFiles(): CodeFile[] {
    const importantFiles: CodeFile[] = [];
    
    // Find entry point files
    const entryPointPatterns = [
      '/index.ts', '/index.js', '/main.ts', '/main.js', 
      '/app.ts', '/app.js', '/server.ts', '/server.js'
    ];
    
    for (const pattern of entryPointPatterns) {
      const entryFiles = this.structure.files.filter(file => 
        file && file.path && file.path.endsWith(pattern)
      );
      importantFiles.push(...entryFiles);
    }
    
    // Find files with many imports (potentially important)
    const importCounts: { [file: string]: number } = {};
    for (const [file, deps] of Object.entries(this.structure.dependencyGraph)) {
      for (const dep of deps) {
        importCounts[dep] = (importCounts[dep] || 0) + 1;
      }
    }
    
    // Get the top 5 most imported files
    const mostImported = Object.entries(importCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([file]) => file);
    
    // Add the most imported files if they exist in our files list
    for (const importFile of mostImported) {
      const file = this.structure.files.find(f => f && f.path === importFile);
      if (file && !importantFiles.some(f => f.path === file.path)) {
        importantFiles.push(file);
      }
    }
    
    // Sort by name for consistent results
    return importantFiles.sort((a, b) => a.path.localeCompare(b.path));
  }
  
  /**
   * Create a prompt for LLM analysis
   */
  private async createLLMPrompt(overview: string, sampleFiles: string[]): Promise<string> {
    try {
      // Get the active prompt template from the learning loop
      const activePrompt = await getActivePromptTemplate();
      
      // Record usage of this prompt
      await recordPromptUsage(activePrompt.id);
      
      // Store the prompt ID for later feedback
      this.currentPromptId = activePrompt.id;
      
      // Use the template
      let prompt = activePrompt.template;
      
      // Replace placeholders with actual content
      prompt = prompt.replace('{{overview}}', overview);
      
      // Build the sample files section
      let sampleFilesContent = '';
      for (const filename of sampleFiles) {
        const file = this.structure.files.find(f => f && f.path === filename);
        if (file && file.content) {
          sampleFilesContent += `\n### FILE: ${file.path}\n\`\`\`\n`;
          sampleFilesContent += file.content.slice(0, 3000);
          if (file.content.length > 3000) {
            sampleFilesContent += `\n... (truncated, ${file.content.length - 3000} more characters)`;
          }
          sampleFilesContent += `\n\`\`\`\n`;
        }
      }
      prompt = prompt.replace('{{sample_files}}', sampleFilesContent);
      
      // Try to find similar code examples from the vector store
      const codeSnippet = sampleFiles.length > 0 ? 
        this.structure.files.find(f => f && f.path === sampleFiles[0])?.content : '';
      
      if (codeSnippet) {
        try {
          const similarExamples = await findSimilarExamples(codeSnippet, 1);
          
          if (similarExamples.length > 0) {
            // Add a similar example that was previously critiqued
            prompt += `\n\n## SIMILAR CODE PREVIOUSLY ANALYZED\nHere is a similar code example from a previous analysis that may be relevant:\n\n\`\`\`\n${similarExamples[0].pageContent.substring(0, 500)}\n\`\`\`\n`;
          }
        } catch (error) {
          // Continue without similar examples if there's an error
          console.warn("Error finding similar examples:", error);
        }
      }
      
      return prompt;
    } catch (error) {
      console.error("Error creating dynamic LLM prompt:", error);
      
      // Fall back to the old method if there's an error
      return this.createStaticPrompt(overview, sampleFiles);
    }
  }
  
  /**
   * The original static prompt creation method (as a fallback)
   */
  private createStaticPrompt(overview: string, sampleFiles: string[]): string {
    let prompt = `You are an expert code reviewer and software architect with deep expertise in analyzing codebases. Your task is to provide a detailed, insightful critique of the codebase provided below.

## CODEBASE OVERVIEW
${overview}

## SAMPLE FILES
`;

    // Add sample file contents with more context
    for (const filename of sampleFiles) {
      const file = this.structure.files.find(f => f && f.path === filename);
      if (file && file.content) {
        prompt += `\n### FILE: ${file.path}\n\`\`\`\n`;
        prompt += file.content.slice(0, 3000); // Allow for more content per file (3000 chars)
        if (file.content.length > 3000) {
          prompt += `\n... (truncated, ${file.content.length - 3000} more characters)`;
        }
        prompt += `\n\`\`\`\n`;
      }
    }
    
    // Add more detailed analysis instructions
    prompt += `
## ANALYSIS INSTRUCTIONS
Perform a comprehensive analysis of this codebase. Your critique should be detailed, specific, and actionable.

Please structure your response in JSON format with the following sections:
{
  "summary": "Detailed overall assessment of the codebase quality, architecture, and organization",
  "findings": [
    {
      "id": "unique-id",
      "title": "Clear, concise title for the issue",
      "description": "Detailed explanation of the issue with specific examples",
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

Focus on the following aspects in your analysis:
1. **Architecture & Design**: Assess the overall structure, patterns used, and architectural decisions
2. **Code Quality**: Look for issues with code complexity, readability, and maintainability
3. **Best Practices**: Identify adherence to or deviation from language/framework best practices
4. **Performance Considerations**: Note any potential performance bottlenecks or optimizations
5. **Security Concerns**: Identify any security issues or vulnerabilities
6. **Documentation**: Assess the quality and completeness of documentation

Ensure your findings are specific rather than generic. Reference actual code snippets and files from the codebase to support your analysis. Provide clear, actionable recommendations that would genuinely improve the codebase.`;
    
    return prompt;
  }
  
  // Store the current prompt ID for feedback
  private currentPromptId: string = '';
  
  /**
   * Process user feedback on the critique
   */
  public async processFeedback(
    feedbackType: 'accept' | 'reject' | 'ignore',
    codeSnippet?: string,
    critique?: any
  ): Promise<boolean> {
    try {
      // If we have a current prompt ID, update its performance
      if (this.currentPromptId) {
        await updatePromptPerformance(this.currentPromptId, feedbackType);
      }
      
      // If we have a code snippet and critique, record it in the vector store
      if (codeSnippet && critique) {
        await recordExampleInVectorStore(codeSnippet, critique, feedbackType);
      }
      
      return true;
    } catch (error) {
      console.error("Error processing feedback:", error);
      return false;
    }
  }
  
  /**
   * Parse the LLM response into a structured critique
   */
  private parseLLMResponse(content: string): CodebaseCritique {
    console.log("Parsing LLM response...");
    
    try {
      // Try to extract and parse JSON from the response
      const jsonContent = this.preprocessJsonResponse(content);
      let parsedContent;
      
      try {
        // First attempt: direct JSON parse
        parsedContent = JSON.parse(jsonContent);
      } catch (jsonError) {
        console.warn("Initial JSON parse failed, attempting repair:", jsonError);
        
        // Second attempt: try to repair the JSON
        parsedContent = this.attemptJsonRepair(jsonContent);
      }
      
      // Process the response into our expected format
      if (parsedContent) {
        console.log("Successfully parsed LLM response as JSON");
        
        // Validate and format the JSON structure
        const critique = this.validateAndFormatCritique(parsedContent);
        
        // Validate that we have real content, not just placeholders
        if (this.containsOnlyPlaceholders(critique)) {
          console.warn("JSON response contains only placeholders, falling back to text parsing");
          return this.createStructuredCritiqueFromText(content);
        }
        
        // Perform validation to ensure consistent JSON output
        return this.validateJsonOutput(critique);
      }
    } catch (error) {
      console.error("Failed to parse JSON from LLM response:", error);
    }
    
    // Fallback: parse the text response
    console.log("Falling back to text-based parsing");
    return this.createStructuredCritiqueFromText(content);
  }
  
  /**
   * Validate the JSON output to ensure consistent structure and required fields
   */
  private validateJsonOutput(critique: CodebaseCritique): CodebaseCritique {
    // Create a validated copy of the critique
    const validated: CodebaseCritique = {
      summary: critique.summary || "Analysis of the codebase structure and quality.",
      findings: [...critique.findings],
      strengths: [...(critique.strengths || [])],
      improvement_areas: [...(critique.improvement_areas || [])]
    };
    
    // Ensure each finding has all required fields
    validated.findings = validated.findings.map(finding => ({
      id: finding.id || `finding-${this.simpleHash(finding.title)}`,
      title: finding.title,
      description: finding.description || `Issue related to ${finding.title}`,
      severity: this.validateSeverity(finding.severity),
      files: Array.isArray(finding.files) ? finding.files : [],
      recommendation: finding.recommendation || "Review and refactor the affected code."
    }));
    
    // Ensure we have at least some strengths and improvement areas
    if (validated.strengths.length === 0) {
      validated.strengths = ["Code organization follows a recognizable pattern"];
    }
    
    if (validated.improvement_areas.length === 0) {
      validated.improvement_areas = ["Consider adding more comprehensive documentation"];
    }
    
    return validated;
  }
  
  /**
   * Preprocess the LLM response to make it more JSON-compatible
   */
  private preprocessJsonResponse(content: string): string {
    // Remove any leading/trailing whitespace and markdown markers
    let processed = content.trim()
      .replace(/^---+$|^\*\*\*+$/gm, '')
      .replace(/^#+\s+.*$/gm, '');
    
    // If the content starts with text before the opening brace, remove it
    const openBraceIndex = processed.indexOf('{');
    if (openBraceIndex > 0) {
      processed = processed.substring(openBraceIndex);
    }
    
    // If there's text after the closing brace, remove it
    const lastCloseBraceIndex = processed.lastIndexOf('}');
    if (lastCloseBraceIndex !== -1 && lastCloseBraceIndex < processed.length - 1) {
      processed = processed.substring(0, lastCloseBraceIndex + 1);
    }
    
    // Ensure proper JSON quotes - replace any smart quotes with straight quotes
    processed = processed
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'");
    
    return processed;
  }
  
  /**
   * Attempt to repair malformed JSON
   */
  private attemptJsonRepair(content: string): any {
    try {
      // Basic JSON repair technique - handle missing quotes, commas, etc.
      const repaired = content
        // Ensure property names are quoted
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        // Fix trailing commas in arrays and objects
        .replace(/,(\s*[\]}])/g, '$1');
      
      // Ensure balanced braces
      const openBraces = (repaired.match(/\{/g) || []).length;
      const closeBraces = (repaired.match(/\}/g) || []).length;
      
      let finalRepaired = repaired;
      if (openBraces > closeBraces) {
        // Add missing closing braces
        finalRepaired += '}'.repeat(openBraces - closeBraces);
      }
      
      return JSON.parse(finalRepaired);
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Check if the critique contains only placeholder text
   */
  private containsOnlyPlaceholders(critique: CodebaseCritique): boolean {
    // Check summary for template placeholders
    const summaryPlaceholders = [
      "overall assessment", 
      "detailed overall assessment",
      "assessment of the codebase"
    ];
    
    if (summaryPlaceholders.some(p => critique.summary.toLowerCase().includes(p))) {
      // Also check if any findings are just placeholders
      if (critique.findings.length === 0 || 
          critique.findings.some(f => 
            f.title.toLowerCase().includes("clear, concise") ||
            f.description.toLowerCase().includes("detailed explanation")
          )) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Process findings from the JSON
   */
  private processJsonFindings(findings: any[]): Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    files: string[];
    recommendation: string;
  }> {
    if (!Array.isArray(findings)) return [];
    
    return findings
      .filter((finding: any) => typeof finding === 'object' && finding)
      .map((finding: any, index: number) => ({
        id: finding.id || `finding-${index + 1}`,
        title: finding.title || "Code structure finding",
        description: finding.description || "This finding relates to code structure and organization.",
        severity: this.validateSeverity(finding.severity),
        files: Array.isArray(finding.files) ? finding.files : [],
        recommendation: finding.recommendation || "Consider reviewing this aspect of the codebase."
      }));
  }
  
  /**
   * Validate and format a critique from JSON
   */
  private validateAndFormatCritique(json: any): CodebaseCritique {
    const critique: CodebaseCritique = {
      summary: typeof json.summary === 'string' && json.summary.trim() ? 
        json.summary : "This codebase analysis examined its structure, patterns, and overall architecture.",
      findings: [],
      strengths: [],
      improvement_areas: []
    };
    
    // Process findings
    if (Array.isArray(json.findings)) {
      critique.findings = this.processJsonFindings(json.findings);
    }
    
    // Process strengths
    if (Array.isArray(json.strengths)) {
      critique.strengths = json.strengths
        .filter((s: any) => typeof s === 'string' && s.trim());
    }
    
    // If no strengths were found or they're empty, add some defaults
    if (critique.strengths.length === 0) {
      critique.strengths = [
        "The codebase has a clear file organization structure.",
        "File naming conventions are consistent throughout the project."
      ];
    }
    
    // Process improvement areas
    if (Array.isArray(json.improvement_areas || json.areas_for_improvement)) {
      critique.improvement_areas = (json.improvement_areas || json.areas_for_improvement)
        .filter((a: any) => typeof a === 'string' && a.trim());
    }
    
    // If no improvement areas were found or they're empty, add some defaults
    if (critique.improvement_areas.length === 0) {
      critique.improvement_areas = [
        "Consider adding more documentation to improve code clarity.",
        "Review file organization to ensure logical grouping of related functionality."
      ];
    }
    
    return critique;
  }
  
  /**
   * Create a structured critique from unstructured text
   */
  private createStructuredCritiqueFromText(text: string): CodebaseCritique {
    // Initialize with rule-based analysis to ensure we have reasonable defaults
    const ruleBasedCritique = this.generateRuleBasedCritique();
    console.log("Using rule-based analysis as baseline for text-based critique");
    
    // Now try to extract information from the text
    let summary = ruleBasedCritique.summary;
    const strengths: string[] = [];
    const improvementAreas: string[] = [];
    const findings: Array<{
      id: string;
      title: string;
      description: string;
      severity: "low" | "medium" | "high";
      files: string[];
      recommendation: string;
    }> = [];
    
    // Extract summary - first paragraph that's not a heading
    const summaryMatch = text.match(/^(?!\#)(.*?)(?:\n\n|\n\#)/);
    if (summaryMatch && summaryMatch[1].trim().length > 20) {
      summary = summaryMatch[1].trim();
    }
    
    // Extract strengths - look for "Strengths" section with various heading formats
    const strengthsSection = text.match(/(?:\#\#?\s*Strengths|\*\*Strengths\*\*|Strengths:)[^\#]*?(?=\n\s*\n\#|\n\s*\n\*\*|\n\s*\n\d\.|\n\s*\n[\w\s]+:|\s*\Z)/i);
    if (strengthsSection) {
      // Extract bullet points or numbered lists
      const extractedStrengths = strengthsSection[0].split('\n')
        .filter(line => {
          const trimmed = line.trim();
          return trimmed.match(/^[\s\-\*\d\.]+/) && !trimmed.match(/^[\s\-\*]+Strengths/i);
        })
        .map(line => line.replace(/^[\s\-\*\d\.]+/, '').trim())
        .filter(line => line.length > 5); // Only keep non-empty strengths
      
      if (extractedStrengths.length > 0) {
        strengths.push(...extractedStrengths);
      }
    }
    
    // Extract improvement areas - try multiple section headings
    const areasSectionPatterns = [
      /(?:\#\#?\s*(?:Areas for Improvement|Improvement Areas|Areas to Improve))[^\#]*?(?=\n\s*\n\#|\n\s*\n\*\*|\n\s*\n\d\.|\s*\Z)/i,
      /(?:\*\*(?:Areas for Improvement|Improvement Areas|Areas to Improve)\*\*)[^\#]*?(?=\n\s*\n\#|\n\s*\n\*\*|\n\s*\n\d\.|\s*\Z)/i,
      /(?:Areas for Improvement|Improvement Areas|Areas to Improve):.*?(?=\n\s*\n\#|\n\s*\n\*\*|\n\s*\n\d\.|\s*\Z)/i
    ];
    
    // Try each pattern
    for (const pattern of areasSectionPatterns) {
      const areasSection = text.match(pattern);
      if (areasSection) {
        // Extract bullet points or numbered lists
        const extractedAreas = areasSection[0].split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return trimmed.match(/^[\s\-\*\d\.]+/) && !trimmed.match(/^[\s\-\*]+(?:Areas|Improvement)/i);
          })
          .map(line => line.replace(/^[\s\-\*\d\.]+/, '').trim())
          .filter(line => line.length > 5); // Only keep non-empty areas
        
        if (extractedAreas.length > 0) {
          improvementAreas.push(...extractedAreas);
          break; // Found improvement areas, stop trying patterns
        }
      }
    }
    
    // Extract findings/issues - try multiple section headings and formats
    const findingsSectionPatterns = [
      /(?:\#\#?\s*(?:Findings|Issues|Problems|Code Issues))[^\#]*?(?=\n\s*\n\#|\n\s*\n\*\*|\s*\Z)/i,
      /(?:\*\*(?:Findings|Issues|Problems|Code Issues)\*\*)[^\#]*?(?=\n\s*\n\#|\n\s*\n\*\*|\s*\Z)/i,
      /\d+\.\s+(?:\*\*)?[\w\s]+(?:\*\*)?\s*(?:\(\w+\s+severity\)|:\s*\w+).*?(?=\n\s*\n\d+\.|\s*\Z)/i, // Numbered issues with severity
      /\*\s+(?:\*\*)?[\w\s]+(?:\*\*)?\s*(?:\(\w+\s+severity\)|:\s*\w+).*?(?=\n\s*\n\*|\s*\Z)/i       // Bullet issues with severity
    ];
    
    // Try each pattern for findings
    let foundFindings = false;
    for (const pattern of findingsSectionPatterns) {
      const findingsSection = text.match(pattern);
      if (findingsSection && findingsSection[0].length > 30) { // Ensure we have meaningful content
        // Try to split by numbered or bulleted points
        const findingSplitPatterns = [
          /\n\s*\d+\.\s+/g,   // Numbered list
          /\n\s*\*\s+/g,      // Bullet list
          /\n\s*\-\s+/g       // Dash list
        ];
        
        let findingBlocks: string[] = [];
        for (const splitPattern of findingSplitPatterns) {
          // Add a newline to help with the split
          const textToSplit = '\n' + findingsSection[0];
          // Split and remove first empty element
          const blocks = textToSplit.split(splitPattern).slice(1);
          if (blocks.length > 0 && blocks.some(b => b.length > 30)) {
            findingBlocks = blocks;
            break;
          }
        }
        
        // If we couldn't split properly, try section headers
        if (findingBlocks.length === 0) {
          findingBlocks = findingsSection[0].split(/\n\s*\*\*[\w\s]+\*\*\s*\n/g)
            .filter(block => block.length > 30);
        }
        
        // Process each finding block
        if (findingBlocks.length > 0) {
          findingBlocks.forEach((block, index) => {
            if (block.trim().length < 30) return; // Skip very short findings
            
            // Try to extract the title from the first line or ** highlighted text **
            const titleMatch = block.match(/^(?:\*\*)?([^:]+?)(?:\*\*)?(?::|$)/m) ||
                              block.match(/\*\*([^*]+)\*\*/);
            
            const title = titleMatch ? titleMatch[1].trim() : `Issue ${index + 1}`;
            
            // Get the description - everything after the title up to any recommendation
            let description = block.replace(/^(?:\*\*)?[^:]+(?:\*\*)?(?::|$)/m, '').trim();
            
            // Try to separate recommendation if present
            let recommendation = "";
            const recPatterns = [
              /(?:recommendation|solution|fix):\s*([^\n]+)/i,
              /(?:recommended|suggested)(?:\s+to)?\s+([^\n]+)/i
            ];
            
            for (const recPattern of recPatterns) {
              const recMatch = block.match(recPattern);
              if (recMatch) {
                recommendation = recMatch[1].trim();
                // Remove the recommendation from the description
                description = description.replace(recMatch[0], '').trim();
                break;
              }
            }
            
            // If no recommendation found, use a default
            if (!recommendation) {
              recommendation = "Refactor according to best practices.";
            }
            
            // Try to determine severity
            let severity: "low" | "medium" | "high" = "medium";
            if (/high|critical|severe|important/i.test(block)) {
              severity = "high";
            } else if (/low|minor|trivial/i.test(block)) {
              severity = "low";
            }
            
            // Try to extract affected files
            const files: string[] = [];
            const fileMatches = block.match(/(?:file|in|at):\s*([`'"]?[\w\-\.\/]+[`'"]?)/gi) ||
                               block.match(/([`'"][\w\-\.\/]+\.[\w]+[`'"])/g);
            
            if (fileMatches) {
              fileMatches.forEach(match => {
                const file = match.replace(/(?:file|in|at):\s*/i, '')
                                  .replace(/[`'"]/g, '')
                                  .trim();
                if (file && file.includes('.')) { // Basic check that it looks like a filename
                  files.push(file);
                }
              });
            }
            
            findings.push({
              id: `finding-${index + 1}`,
              title,
              description,
              severity,
              files,
              recommendation
            });
          });
          
          if (findings.length > 0) {
            foundFindings = true;
            break; // Found findings, stop trying patterns
          }
        }
      }
    }
    
    // If no findings found but we have code duplication or error handling issues
    // from rule-based analysis, include those
    if (!foundFindings && ruleBasedCritique.findings.length > 0) {
      console.log("No findings extracted from text - integrating relevant rule-based findings");
      // Look for specific issue mentions in the text
      const issueKeywords = [
        { pattern: /(?:duplicat|redundant|repeat).{0,30}(?:code|function|method)/i, type: "code duplication" },
        { pattern: /(?:error|exception).{0,30}(?:handling|catch)/i, type: "error handling" },
        { pattern: /(?:inconsistent|mixed).{0,30}(?:naming|convention)/i, type: "naming convention" },
        { pattern: /(?:inefficient|slow|performance).{0,30}/i, type: "inefficiency" }
      ];
      
      for (const issueType of issueKeywords) {
        if (issueType.pattern.test(text)) {
          // Include any findings from rule-based analysis that match this type
          const matchingFindings = ruleBasedCritique.findings.filter(f => 
            f.title.toLowerCase().includes(issueType.type) ||
            f.description.toLowerCase().includes(issueType.type)
          );
          
          if (matchingFindings.length > 0) {
            console.log(`Injecting ${matchingFindings.length} rule-based findings matching "${issueType.type}"`);
            findings.push(...matchingFindings);
          }
        }
      }
    }
    
    // Combine extracted information with rule-based defaults as needed
    const finalCritique = {
      summary,
      findings: findings.length > 0 ? findings : ruleBasedCritique.findings,
      strengths: strengths.length > 0 ? strengths : ruleBasedCritique.strengths,
      improvement_areas: improvementAreas.length > 0 ? improvementAreas : ruleBasedCritique.improvement_areas
    };
    
    // Log combined critique statistics
    console.log(`Final critique contains: ${finalCritique.findings.length} findings, ${finalCritique.strengths.length} strengths, ${finalCritique.improvement_areas.length} improvement areas`);
    console.log(`Rule-based findings contribution: ${finalCritique.findings.filter(f => 
      ruleBasedCritique.findings.some(rf => rf.id === f.id)).length}/${finalCritique.findings.length} findings`);
    
    return finalCritique;
  }
  
  /**
   * Validate a severity value
   */
  private validateSeverity(severity: any): "low" | "medium" | "high" {
    if (typeof severity === 'string') {
      const normalized = severity.toLowerCase();
      if (normalized === 'high' || normalized === 'critical' || normalized === 'severe') {
        return "high";
      }
      if (normalized === 'low' || normalized === 'minor') {
        return "low";
      }
    }
    return "medium";
  }
  
  /**
   * Simple string hash function for detecting similar code
   */
  private simpleHash(str: string): string {
    // Remove whitespace and convert to lowercase
    const normalized = str.replace(/\s+/g, '').toLowerCase();
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Explicitly integrate rule-based findings into the final critique
   * This is used when we want to ensure rule-based findings are included
   */
  private integrateRuleBasedFindings(llmCritique: CodebaseCritique): CodebaseCritique {
    // If we don't have rule-based findings, just return the LLM critique
    if (!this.ruleBasedFindings) {
      return llmCritique;
    }
    
    console.log("Integrating rule-based findings with LLM critique...");
    
    // Create a set of finding titles from the LLM critique for quick lookup
    const llmFindingTitles = new Set(llmCritique.findings.map(f => f.title.toLowerCase()));
    
    // Filter rule-based findings to only include those not already detected by the LLM
    const additionalFindings = this.ruleBasedFindings.findings.filter(
      finding => !llmFindingTitles.has(finding.title.toLowerCase())
    );
    
    // Validate if critical issues were detected
    const validatedFindings = this.validateCriticalIssueDetection(
      [...llmCritique.findings, ...additionalFindings]
    );
    
    console.log(`LLM detected ${llmCritique.findings.length} issues, rule-based added ${additionalFindings.length}, validation added or modified ${validatedFindings.length - (llmCritique.findings.length + additionalFindings.length)} issues`);
    
    // Create an integrated critique that combines both sources
    return {
      summary: this.combineTextSections(llmCritique.summary, this.ruleBasedFindings.summary),
      findings: validatedFindings,
      strengths: [...new Set([...llmCritique.strengths, ...this.ruleBasedFindings.strengths])],
      improvement_areas: [...new Set([...llmCritique.improvement_areas, ...this.ruleBasedFindings.improvement_areas])]
    };
  }
  
  /**
   * Validates that critical issues are detected and adds them if missing
   * @param findings The current list of findings
   * @returns The validated list of findings
   */
  private validateCriticalIssueDetection(findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    files: string[];
    recommendation: string;
  }>): typeof findings {
    const validatedFindings = [...findings];
    const findingTitles = new Set(findings.map(f => f.title.toLowerCase()));
    
    // Check for critical issues that should be detected
    const criticalChecks: { check: () => string[], issueType: string, severity: "low" | "medium" | "high" }[] = [
      { 
        check: this.detectEmptyExceptionBlocks.bind(this), 
        issueType: "Empty exception blocks", 
        severity: "high" 
      },
      {
        check: this.detectCodeDuplication.bind(this),
        issueType: "Code duplication",
        severity: "medium"
      }
    ];
    
    // Run each check and add any missing findings
    for (const { check, issueType, severity } of criticalChecks) {
      // Check if we already have this type of finding
      if (!findingTitles.has(issueType.toLowerCase())) {
        const affectedFiles = check();
        
        // Only add if we found affected files
        if (affectedFiles.length > 0) {
          console.log(`Validation: Adding missing critical issue type "${issueType}" affecting ${affectedFiles.length} files`);
          
          validatedFindings.push({
            id: `validation-${this.simpleHash(issueType)}`,
            title: issueType,
            description: `The codebase contains ${affectedFiles.length} instances of ${issueType.toLowerCase()}, which can lead to unexpected behavior and maintenance issues.`,
            severity: severity,
            files: affectedFiles,
            recommendation: this.generateRecommendationForIssue(issueType, affectedFiles)
          });
        }
      }
    }
    
    return validatedFindings;
  }
  
  /**
   * Generate a standardized recommendation for a specific issue type
   */
  private generateRecommendationForIssue(issueType: string, files: string[]): string {
    switch (issueType.toLowerCase()) {
      case "empty exception blocks":
        return "Always handle exceptions appropriately. Either log the error, rethrow it, or add a comment explaining why it's safe to ignore. Example:\n```\ntry {\n  // risky operation\n} catch (error) {\n  console.error('Operation failed:', error);\n  // Consider specific recovery actions\n}\n```";
      
      case "code duplication":
        return "Extract duplicated code into reusable functions or classes. Consider using the DRY (Don't Repeat Yourself) principle to reduce maintenance burden and potential for inconsistent fixes.";
      
      default:
        return "Review the affected files and apply appropriate fixes following best practices.";
    }
  }
  
  /**
   * Combines text sections from different sources
   */
  private combineTextSections(primary: string, secondary: string): string {
    // Simple combination that avoids duplication
    if (!primary) return secondary;
    if (!secondary) return primary;
    
    // If they're very similar, just use the primary
    if (this.calculateSimilarity(primary, secondary) > 0.7) {
      return primary;
    }
    
    // Otherwise combine them
    return primary + "\n\nAdditional insights: " + secondary;
  }
  
  /**
   * Calculate rough similarity between two strings
   */
  private calculateSimilarity(a: string, b: string): number {
    const aWords = new Set(a.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    const bWords = new Set(b.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    
    const intersection = new Set([...aWords].filter(x => bWords.has(x)));
    const union = new Set([...aWords, ...bWords]);
    
    return intersection.size / union.size;
  }
} 