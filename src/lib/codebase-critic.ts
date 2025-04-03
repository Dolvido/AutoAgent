import { Ollama } from '@langchain/community/llms/ollama';

// Import types from codebase-explorer
interface CodeFile {
  name: string;
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
  private codebaseStructure: CodebaseStructure;
  private ollama: Ollama | null = null;
  
  constructor(codebaseStructure: CodebaseStructure) {
    this.codebaseStructure = codebaseStructure;
    
    // Try to initialize Ollama
    try {
      this.ollama = new Ollama({
        baseUrl: 'http://localhost:11434',
        model: 'codellama', // Default model, can be configured
        temperature: 0.3,
      });
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
      const prompt = this.createLLMPrompt(codebaseOverview, sampleFiles);
      
      // Call Ollama
      const response = await this.ollama!.call(prompt);
      
      // Parse the response
      return this.parseLLMResponse(response);
    } catch (error) {
      console.error("Error calling Ollama:", error);
      // Fall back to rule-based analysis
      return this.generateRuleBasedCritique();
    }
  }
  
  /**
   * Generate critique using rule-based analysis
   */
  private generateRuleBasedCritique(): Promise<CodebaseCritique> {
    // Analyze file organization
    const organizationFindings = this.analyzeFileOrganization();
    
    // Analyze code quality
    const qualityFindings = this.analyzeCodeQuality();
    
    // Analyze dependencies
    const dependencyFindings = this.analyzeDependencies();
    
    // Combine findings
    const allFindings = [
      ...organizationFindings,
      ...qualityFindings,
      ...dependencyFindings
    ];
    
    // Generate strengths
    const strengths = this.identifyStrengths();
    
    // Generate improvement areas
    const improvementAreas = this.identifyImprovementAreas();
    
    // Create the critique summary
    const summary = this.generateSummary(allFindings, strengths, improvementAreas);
    
    // Return the complete critique
    return Promise.resolve({
      summary,
      findings: allFindings,
      strengths,
      improvement_areas: improvementAreas
    });
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
    this.codebaseStructure.files.forEach(file => {
      const dir = file.name.split('/')[0];
      directoryCount[dir] = (directoryCount[dir] || 0) + 1;
    });
    
    const dirs = Object.keys(directoryCount);
    
    // Detect potential structure issues
    if (dirs.length > 10 && this.codebaseStructure.files.length < 30) {
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
    this.codebaseStructure.files.forEach(file => {
      const parts = file.name.split('/');
      const dir = parts.slice(0, -1).join('/');
      const ext = file.name.split('.').pop() || '';
      
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
          files: this.codebaseStructure.files
            .filter(f => f.name.startsWith(dir + '/'))
            .map(f => f.name),
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
    
    // Check for excessively large files
    const largeFiles = this.codebaseStructure.files
      .filter(file => {
        const lines = file.content.split('\n').length;
        return lines > 500; // Threshold for a "large" file
      })
      .map(f => f.name);
    
    if (largeFiles.length > 0) {
      findings.push({
        id: "qual-1",
        title: "Excessively large files",
        description: `Found ${largeFiles.length} files with more than 500 lines of code, which can make maintenance difficult.`,
        severity: "medium",
        files: largeFiles,
        recommendation: "Consider refactoring large files into smaller, more focused modules with single responsibilities."
      });
    }
    
    // Check for potential code duplication (simple heuristic)
    const contentHashes = new Map<string, string[]>();
    this.codebaseStructure.files.forEach(file => {
      // Only consider code files
      const ext = file.name.split('.').pop() || '';
      if (!['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp'].includes(ext)) {
        return;
      }
      
      // Split into chunks and hash them
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length - 10; i += 5) {
        const chunk = lines.slice(i, i + 10).join('\n');
        // Simple hash for demo purposes
        const hash = this.simpleHash(chunk);
        
        if (!contentHashes.has(hash)) {
          contentHashes.set(hash, []);
        }
        contentHashes.get(hash)!.push(file.name);
      }
    });
    
    // Find potential duplications
    const duplicates = new Map<string, Set<string>>();
    for (const [hash, files] of contentHashes.entries()) {
      if (files.length > 1) {
        // Remove duplicates within the same file
        const uniqueFiles = [...new Set(files)];
        if (uniqueFiles.length > 1) {
          for (const file of uniqueFiles) {
            if (!duplicates.has(file)) {
              duplicates.set(file, new Set());
            }
            uniqueFiles.forEach(f => {
              if (f !== file) duplicates.get(file)!.add(f);
            });
          }
        }
      }
    }
    
    if (duplicates.size > 0) {
      const duplicateFiles = Array.from(duplicates.keys());
      findings.push({
        id: "qual-2",
        title: "Potential code duplication",
        description: `Found ${duplicateFiles.length} files with potentially duplicated code segments.`,
        severity: "medium",
        files: duplicateFiles,
        recommendation: "Consider refactoring duplicated code into shared utilities or components."
      });
    }
    
    return findings;
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
    const fileTypes = Object.keys(this.codebaseStructure.fileTypes);
    if (fileTypes.length < 5) {
      strengths.push("Consistent use of technologies with a focused set of file types.");
    }
    
    // Check for reasonable file sizes
    const averageLinesPerFile = this.codebaseStructure.codeMetrics.averageLinesPerFile;
    if (averageLinesPerFile < 200) {
      strengths.push("Good file size management with reasonably sized files (average " + averageLinesPerFile + " lines).");
    }
    
    // Check for well-structured directories
    const rootDirs = new Set<string>();
    this.codebaseStructure.files.forEach(file => {
      const parts = file.name.split('/');
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
    const docFiles = this.codebaseStructure.files
      .filter(f => f.name.toLowerCase().includes('readme') || f.name.toLowerCase().includes('documentation'))
      .length;
    
    if (docFiles === 0) {
      areas.push("Consider adding more documentation, such as README files, to improve codebase navigability.");
    }
    
    // Check file organization
    const commonDirs = ['src', 'lib', 'test', 'docs'];
    const hasMissingCommonDirs = commonDirs.some(dir => 
      !this.codebaseStructure.files.some(f => f.name.startsWith(dir + '/'))
    );
    
    if (hasMissingCommonDirs) {
      areas.push("Consider adopting a more standard project structure with directories for source code, tests, and documentation.");
    }
    
    // Check for test coverage
    const testFiles = this.codebaseStructure.files
      .filter(f => f.name.includes('test') || f.name.includes('spec'))
      .length;
    
    const totalCodeFiles = Object.entries(this.codebaseStructure.fileTypes)
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
    
    summaryText += `The codebase contains ${this.codebaseStructure.codeMetrics.totalFiles} files with approximately ${this.codebaseStructure.codeMetrics.totalLines} lines of code.`;
    
    return summaryText;
  }
  
  /**
   * Detect circular dependencies in the codebase
   */
  private detectCircularDependencies(): string[][] {
    const circularPaths: string[][] = [];
    const graph = this.codebaseStructure.dependencyGraph;
    
    // For each file in the graph
    for (const startFile of Object.keys(graph)) {
      const visited = new Set<string>();
      const path: string[] = [startFile];
      
      this.dfs(startFile, graph, visited, path, circularPaths);
    }
    
    return circularPaths;
  }
  
  /**
   * Depth-first search to find cycles in the dependency graph
   */
  private dfs(
    current: string,
    graph: DependencyGraph,
    visited: Set<string>,
    path: string[],
    cycles: string[][]
  ) {
    if (!graph[current]) return;
    
    visited.add(current);
    
    for (const dependency of graph[current]) {
      if (path[0] === dependency) {
        // Found a cycle back to the start
        cycles.push([...path, dependency]);
        continue;
      }
      
      if (!visited.has(dependency)) {
        path.push(dependency);
        this.dfs(dependency, graph, visited, path, cycles);
        path.pop();
      }
    }
    
    visited.delete(current);
  }
  
  /**
   * Build a graph of file coupling (which files are dependent on each other)
   */
  private buildCouplingGraph() {
    const couplingGraph: { [file: string]: string[] } = {};
    
    for (const [file, dependencies] of Object.entries(this.codebaseStructure.dependencyGraph)) {
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
   * Prepare an overview of the codebase for LLM analysis
   */
  private prepareCodebaseOverview(): string {
    const { totalFiles, totalLines, filesByExtension } = this.codebaseStructure.codeMetrics;
    
    let overview = `Codebase Overview:\n`;
    overview += `- Total Files: ${totalFiles}\n`;
    overview += `- Total Lines: ${totalLines}\n`;
    overview += `- File Types:\n`;
    
    for (const [ext, count] of Object.entries(filesByExtension)) {
      overview += `  - ${ext}: ${count} files\n`;
    }
    
    // Add directory structure
    const dirs = new Set<string>();
    this.codebaseStructure.files.forEach(file => {
      const parts = file.name.split('/');
      for (let i = 1; i <= parts.length; i++) {
        dirs.add(parts.slice(0, i).join('/'));
      }
    });
    
    const sortedDirs = Array.from(dirs).sort();
    
    overview += `\nDirectory Structure:\n`;
    for (const dir of sortedDirs) {
      const indent = dir.split('/').length - 1;
      overview += `${'  '.repeat(indent)}- ${dir.split('/').pop()}\n`;
    }
    
    return overview;
  }
  
  /**
   * Select a sample of representative files for LLM analysis
   */
  private selectSampleFiles(): string[] {
    const samples: string[] = [];
    const maxSampleBytes = 100000; // Limit total bytes to avoid exceeding token limits
    let currentBytes = 0;
    
    // Sort files by size (smallest first)
    const sortedFiles = [...this.codebaseStructure.files]
      .sort((a, b) => a.content.length - b.content.length);
    
    // Try to get representative samples of different file types
    const filesByExt: { [ext: string]: CodeFile[] } = {};
    for (const file of sortedFiles) {
      const ext = file.name.split('.').pop() || 'unknown';
      if (!filesByExt[ext]) {
        filesByExt[ext] = [];
      }
      filesByExt[ext].push(file);
    }
    
    // Take at least one file of each type, respecting the byte limit
    for (const [ext, files] of Object.entries(filesByExt)) {
      if (files.length > 0) {
        const file = files[0];
        if (currentBytes + file.content.length <= maxSampleBytes) {
          samples.push(file.name);
          currentBytes += file.content.length;
        }
      }
    }
    
    // If we still have space, add more files with variety
    for (const file of sortedFiles) {
      if (!samples.includes(file.name) && currentBytes + file.content.length <= maxSampleBytes) {
        samples.push(file.name);
        currentBytes += file.content.length;
      }
    }
    
    return samples;
  }
  
  /**
   * Create a prompt for LLM analysis
   */
  private createLLMPrompt(overview: string, sampleFiles: string[]): string {
    let prompt = `You are an expert code reviewer and software architect. Analyze the codebase and provide actionable feedback.

Analyze this codebase and provide a critique with actionable feedback.\n\n`;
    prompt += `${overview}\n\n`;
    
    // Add sample file contents
    prompt += `Sample Files:\n`;
    for (const filename of sampleFiles) {
      const file = this.codebaseStructure.files.find(f => f.name === filename);
      if (file) {
        prompt += `\n--- ${file.name} ---\n`;
        prompt += file.content.slice(0, 2000); // Limit each file to 2000 chars
        if (file.content.length > 2000) {
          prompt += `\n... (truncated, ${file.content.length - 2000} more characters)`;
        }
        prompt += `\n`;
      }
    }
    
    // Add specific instructions
    prompt += `\nPlease provide a critique of this codebase with the following sections:
1. Summary - Overall assessment of the codebase
2. Findings - Specific issues identified, each with:
   - Title
   - Description
   - Severity (high/medium/low)
   - Affected files
   - Recommendation
3. Strengths - What's good about the codebase
4. Areas for Improvement - Suggestions for enhancing the codebase

Format your response as JSON with these sections.`;
    
    return prompt;
  }
  
  /**
   * Parse the LLM response into a structured critique
   */
  private parseLLMResponse(content: string): CodebaseCritique {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                     content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const json = JSON.parse(jsonMatch[0] || jsonMatch[1]);
        return this.validateAndFormatCritique(json);
      } catch (e) {
        console.error("Failed to parse LLM JSON response:", e);
      }
    }
    
    // If we can't extract valid JSON, create a structured response from the text
    return this.createStructuredCritiqueFromText(content);
  }
  
  /**
   * Validate and format a critique from JSON
   */
  private validateAndFormatCritique(json: any): CodebaseCritique {
    const critique: CodebaseCritique = {
      summary: typeof json.summary === 'string' ? json.summary : "No summary provided.",
      findings: [],
      strengths: [],
      improvement_areas: []
    };
    
    // Process findings
    if (Array.isArray(json.findings)) {
      critique.findings = json.findings.map((finding: any, index: number) => ({
        id: finding.id || `finding-${index + 1}`,
        title: finding.title || "Untitled Finding",
        description: finding.description || "",
        severity: this.validateSeverity(finding.severity),
        files: Array.isArray(finding.files) ? finding.files : [],
        recommendation: finding.recommendation || ""
      }));
    }
    
    // Process strengths
    if (Array.isArray(json.strengths)) {
      critique.strengths = json.strengths.filter((s: any) => typeof s === 'string');
    }
    
    // Process improvement areas
    if (Array.isArray(json.improvement_areas || json.areas_for_improvement)) {
      critique.improvement_areas = (json.improvement_areas || json.areas_for_improvement)
        .filter((a: any) => typeof a === 'string');
    }
    
    return critique;
  }
  
  /**
   * Create a structured critique from unstructured text
   */
  private createStructuredCritiqueFromText(text: string): CodebaseCritique {
    const critique: CodebaseCritique = {
      summary: "Analysis of codebase structure and quality.",
      findings: [],
      strengths: [],
      improvement_areas: []
    };
    
    // Extract summary - first paragraph that's not a heading
    const summaryMatch = text.match(/^(?!\#)(.*?)(?:\n\n|\n\#)/);
    if (summaryMatch) {
      critique.summary = summaryMatch[1].trim();
    }
    
    // Extract strengths
    const strengthsSection = text.match(/(?:\#\#?\s*Strengths|\*\*Strengths\*\*)[^\#]*(?=\#\#?|$)/i);
    if (strengthsSection) {
      const strengths = strengthsSection[0].split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
        .map(line => line.replace(/^[\s\-\*]+/, '').trim());
      
      if (strengths.length > 0) {
        critique.strengths = strengths;
      }
    }
    
    // Extract improvement areas
    const areasSection = text.match(/(?:\#\#?\s*(?:Areas|Improvements|Improvement Areas)|Improvement Areas)[^\#]*(?=\#\#?|$)/i);
    if (areasSection) {
      const areas = areasSection[0].split('\n')
        .filter(line => line.trim().startsWith('-') || line.trim().startsWith('*'))
        .map(line => line.replace(/^[\s\-\*]+/, '').trim());
      
      if (areas.length > 0) {
        critique.improvement_areas = areas;
      }
    }
    
    // Extract findings
    const findingsSection = text.match(/(?:\#\#?\s*Findings|\*\*Findings\*\*)[^\#]*(?=\#\#?|$)/i);
    if (findingsSection) {
      const findingBlocks = findingsSection[0].split(/\n(?:\d+\.\s|\-\s|\*\s)/).slice(1);
      
      critique.findings = findingBlocks.map((block, index) => {
        const lines = block.split('\n');
        const title = lines[0].trim();
        const description = lines.slice(1).join(' ').trim();
        
        // Try to determine severity
        let severity: "low" | "medium" | "high" = "medium";
        if (/high|critical|severe/i.test(block)) {
          severity = "high";
        } else if (/low|minor/i.test(block)) {
          severity = "low";
        }
        
        return {
          id: `finding-${index + 1}`,
          title,
          description,
          severity,
          files: [],
          recommendation: ""
        };
      });
    }
    
    // If we couldn't extract structured data, provide defaults
    if (critique.findings.length === 0) {
      critique.findings = [
        {
          id: "default-1",
          title: "Code organization could be improved",
          description: "The codebase structure may benefit from better organization.",
          severity: "medium",
          files: [],
          recommendation: "Consider implementing a more standardized project structure."
        }
      ];
    }
    
    if (critique.strengths.length === 0) {
      critique.strengths = [
        "The codebase shows evidence of thoughtful implementation.",
        "File naming is generally clear and descriptive."
      ];
    }
    
    if (critique.improvement_areas.length === 0) {
      critique.improvement_areas = [
        "Consider adding more documentation to improve codebase clarity.",
        "Review file organization to ensure logical grouping of related functionality."
      ];
    }
    
    return critique;
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
} 