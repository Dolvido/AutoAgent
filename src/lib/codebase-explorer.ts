import path from 'path';
import fs from 'fs';

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

export class CodebaseExplorer {
  private files: CodeFile[];
  
  constructor(files: CodeFile[]) {
    this.files = files;
  }
  
  /**
   * Static method to create an instance from a local directory
   */
  static async fromDirectory(directoryPath: string): Promise<CodebaseExplorer> {
    const files = await CodebaseExplorer.loadFilesFromDirectory(directoryPath);
    return new CodebaseExplorer(files);
  }
  
  /**
   * Recursively load files from a directory
   */
  private static async loadFilesFromDirectory(
    dirPath: string, 
    basePath: string = '', 
    ignorePatterns: string[] = [
      // Git directories
      '.git', 
      // Build and output directories
      'node_modules', 'dist', 'build', '.next', 'out', 'coverage',
      // Cache directories
      '.cache', '.vscode', '.idea', '.github', '.husky',
      // Package manager directories
      '.npm', '.yarn',
      // Large data directories
      'data/vectors', 'public/assets',
      // Common binary or large file directories
      'assets/videos', 'public/videos', 'public/images'
    ]
  ): Promise<CodeFile[]> {
    const files: CodeFile[] = [];
    
    // Read all entries in the directory
    const entries = fs.readdirSync(path.join(dirPath, basePath), { withFileTypes: true });
    
    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      const fullPath = path.join(dirPath, relativePath);
      
      // Skip ignored directories
      if (entry.isDirectory()) {
        // Check exact directory name match
        if (ignorePatterns.includes(entry.name)) continue;
        
        // Check if any path component matches ignore patterns (handles nested patterns)
        const pathComponents = relativePath.split(path.sep);
        if (pathComponents.some(component => ignorePatterns.includes(component))) continue;
        
        // Check if directory starts with dot or underscore (common convention for system/temp dirs)
        if (entry.name.startsWith('_') || entry.name.startsWith('.')) {
          // Still allow some useful dot directories
          if (!['components', 'pages', 'lib', 'src', 'test', 'tests', 'utils'].some(allowed => entry.name.includes(allowed))) {
            continue;
          }
        }
        
        // Recursively process subdirectories
        const subDirFiles = await CodebaseExplorer.loadFilesFromDirectory(
          dirPath, 
          relativePath, 
          ignorePatterns
        );
        files.push(...subDirFiles);
      } else {
        // Process files (text files only)
        try {
          // Skip binary files and very large files
          const stats = fs.statSync(fullPath);
          if (stats.size > 1024 * 1024) continue; // Skip files larger than 1MB
          
          // Skip files with binary extensions
          const ext = path.extname(entry.name).toLowerCase();
          if ([
            // Images
            '.jpg', '.jpeg', '.png', '.gif', '.ico', '.webp', '.svg', '.bmp',
            // Executables and binaries
            '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
            // Media
            '.mp4', '.mp3', '.wav', '.avi', '.mov', '.ogg',
            // Compressed
            '.zip', '.rar', '.7z', '.tar', '.gz', '.tgz',
            // Documents
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt'
          ].includes(ext)) {
            continue;
          }
          
          // Skip lock files and large generated files
          if (entry.name.includes('lock.json') || 
              entry.name.endsWith('.lock') || 
              entry.name.endsWith('-lock.yaml') || 
              entry.name.endsWith('.min.js') || 
              entry.name.endsWith('.min.css')) {
            continue;
          }
          
          // Read file content
          const content = fs.readFileSync(fullPath, 'utf8');
          
          // Use forward slashes for consistency across platforms
          const normalizedPath = relativePath.replace(/\\/g, '/');
          
          files.push({
            name: normalizedPath,
            content
          });
        } catch (error) {
          console.warn(`Failed to read file ${fullPath}:`, error);
          // Continue with other files
        }
      }
    }
    
    return files;
  }
  
  /**
   * Analyze the codebase structure and return insights
   */
  async analyzeCodebase(): Promise<CodebaseStructure> {
    // Build the dependency graph
    const dependencyGraph = this.buildDependencyGraph();
    
    // Count file types
    const fileTypes = this.countFileTypes();
    
    // Calculate code metrics
    const codeMetrics = this.calculateCodeMetrics();
    
    // Return the complete structure
    return {
      files: this.files,
      dependencyGraph,
      fileTypes,
      codeMetrics
    };
  }
  
  /**
   * Build a graph of file dependencies
   */
  private buildDependencyGraph(): DependencyGraph {
    const graph: DependencyGraph = {};
    
    for (const file of this.files) {
      // Skip non-code files
      if (!this.isCodeFile(file.name)) continue;
      
      // Initialize the graph entry
      graph[file.name] = [];
      
      // Look for imports/requires in the file content
      const dependencies = this.extractDependencies(file);
      
      // Add found dependencies
      for (const dep of dependencies) {
        // Resolve the dependency to an actual file in our list
        const resolvedDep = this.resolveDependencyPath(file.name, dep);
        if (resolvedDep) {
          graph[file.name].push(resolvedDep);
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Extract dependencies from a file
   */
  private extractDependencies(file: CodeFile): string[] {
    const dependencies: string[] = [];
    const ext = this.getFileExtension(file.name);
    
    // Simple regex-based detection for different file types
    if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') {
      // ES modules
      const importMatches = file.content.matchAll(/import\s+(?:.*?from\s+)?['"]([^'"]+)['"]/g);
      for (const match of importMatches) {
        if (match[1]) dependencies.push(match[1]);
      }
      
      // CommonJS
      const requireMatches = file.content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
      for (const match of requireMatches) {
        if (match[1]) dependencies.push(match[1]);
      }
    } else if (ext === 'py') {
      // Python imports
      const importMatches = file.content.matchAll(/import\s+([^\s;]+)|from\s+([^\s;]+)\s+import/g);
      for (const match of importMatches) {
        const moduleName = match[1] || match[2];
        if (moduleName) dependencies.push(moduleName);
      }
    }
    // Add more language-specific patterns as needed
    
    return dependencies;
  }
  
  /**
   * Resolve a dependency path to an actual file in our codebase
   */
  private resolveDependencyPath(currentFile: string, dependency: string): string | null {
    // Skip external/library dependencies
    if (this.isExternalDependency(dependency)) return null;
    
    // Get the directory of the current file
    const currentDir = this.getDirectory(currentFile);
    
    // Handle relative imports
    if (dependency.startsWith('./') || dependency.startsWith('../')) {
      const resolvedPath = this.normalizePath(`${currentDir}/${dependency}`);
      return this.findMatchingFile(resolvedPath);
    }
    
    // Handle absolute imports
    return this.findMatchingFile(dependency);
  }
  
  /**
   * Check if a dependency is external (library)
   */
  private isExternalDependency(dep: string): boolean {
    // Simplified check: not a relative path and doesn't contain a file extension
    return !dep.startsWith('.') && !dep.includes('/') && !dep.includes('.');
  }
  
  /**
   * Find a file in our codebase that matches the dependency path
   */
  private findMatchingFile(path: string): string | null {
    // First, try exact match
    if (this.files.some(f => f.name === path)) return path;
    
    // Try with common extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.java'];
    for (const ext of extensions) {
      const pathWithExt = `${path}${ext}`;
      if (this.files.some(f => f.name === pathWithExt)) return pathWithExt;
    }
    
    // Try with /index.* files
    for (const ext of extensions) {
      const indexPath = `${path}/index${ext}`;
      if (this.files.some(f => f.name === indexPath)) return indexPath;
    }
    
    return null;
  }
  
  /**
   * Count the types of files in the codebase
   */
  private countFileTypes(): { [extension: string]: number } {
    const types: { [extension: string]: number } = {};
    
    for (const file of this.files) {
      const ext = this.getFileExtension(file.name);
      types[ext] = (types[ext] || 0) + 1;
    }
    
    return types;
  }
  
  /**
   * Calculate code metrics
   */
  private calculateCodeMetrics() {
    let totalLines = 0;
    let totalCodeLines = 0;
    let totalCommentLines = 0;
    let totalBlankLines = 0;
    let totalFiles = this.files.length;
    let complexityScore = 0;
    
    const filesByExtension: { [key: string]: number } = {};
    const languages: { [key: string]: { 
      files: number, 
      lines: number, 
      codeLines: number,
      commentLines: number,
      complexityScore: number
    } } = {};
    
    // Code smells counters
    const codeSmells = {
      longFunctions: 0,
      deepNesting: 0,
      longLines: 0,
      duplicatedPatterns: 0,
      magicNumbers: 0,
      todoComments: 0
    };
    
    // Common regular expressions for analysis
    const commentRegexes: Record<string, RegExp> = {
      js: /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
      py: /(#.*$)|('''[\s\S]*?''')|("""[\s\S]*?""")/gm,
      java: /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm,
      default: /(\/\/.*$)|(\/\*[\s\S]*?\*\/)/gm
    };
    
    const functionRegexes: Record<string, RegExp> = {
      js: /function\s+\w+\s*\(|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{/g,
      py: /def\s+\w+\s*\(/g,
      java: /(?:public|private|protected|static)?\s+\w+\s+\w+\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*{/g,
      default: /function\s+\w+\s*\(|def\s+\w+\s*\(|(?:public|private|protected|static)?\s+\w+\s+\w+\s*\(/g
    };
    
    // Conditional complexity markers (if, for, while, switch, catch, etc.)
    const complexityRegex = /\b(if|for|while|switch|catch|&&|\|\|)\b/g;
    
    // Deep nesting detection
    const nestingRegex = /^(\s{4,}|\t{2,})/gm; // Lines with significant indentation
    
    // Long lines detection
    const longLineThreshold = 100;
    
    // Long functions detection (in lines)
    const longFunctionThreshold = 50;
    
    // Find potential magic numbers (numeric literals not in common patterns)
    const magicNumberRegex = /(?<![.\w])(?<!const\s+\w+\s*=\s*)(?<!\w\s*=\s*)(?<!case\s+)(?<!\w\()\d+(?!\s*\/\*|\/\/)/g;
    
    // Find TODO comments
    const todoRegex = /TODO|FIXME|HACK|XXX/gi;
    
    // Set of common repeated code patterns
    const commonPatterns = new Map<string, number>();
    
    for (const file of this.files) {
      const ext = this.getFileExtension(file.name);
      const language = this.getLanguageFromExtension(ext);
      
      // Count files by extension
      filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;
      
      // Initialize language stats if not exists
      if (!languages[language]) {
        languages[language] = { files: 0, lines: 0, codeLines: 0, commentLines: 0, complexityScore: 0 };
      }
      languages[language].files++;
      
      // Split content into lines for analysis
      const lines = file.content.split('\n');
      const totalLinesInFile = lines.length;
      totalLines += totalLinesInFile;
      languages[language].lines += totalLinesInFile;
      
      // Detect comments
      const commentRegex = commentRegexes[language as keyof typeof commentRegexes] || commentRegexes.default;
      const commentMatches = file.content.match(commentRegex) || [];
      const commentLinesInFile = commentMatches.reduce((count, comment) => count + comment.split('\n').length, 0);
      totalCommentLines += commentLinesInFile;
      languages[language].commentLines += commentLinesInFile;
      
      // Count blank lines
      const blankLinesInFile = lines.filter(line => line.trim() === '').length;
      totalBlankLines += blankLinesInFile;
      
      // Calculate code lines (total - comments - blank)
      const codeLinesInFile = totalLinesInFile - commentLinesInFile - blankLinesInFile;
      totalCodeLines += codeLinesInFile;
      languages[language].codeLines += codeLinesInFile;
      
      // Detect complexity markers
      const complexityMatches = file.content.match(complexityRegex) || [];
      const fileComplexity = complexityMatches.length;
      complexityScore += fileComplexity;
      languages[language].complexityScore += fileComplexity;
      
      // Long functions detection
      const functionRegex = functionRegexes[language as keyof typeof functionRegexes] || functionRegexes.default;
      const functionMatches = file.content.matchAll(functionRegex);
      
      let lastFunctionStartIndex = -1;
      for (const match of functionMatches) {
        if (match.index === undefined) continue;
        
        // If we found a previous function, measure its length
        if (lastFunctionStartIndex >= 0) {
          const functionContent = file.content.substring(lastFunctionStartIndex, match.index);
          const functionLines = functionContent.split('\n').length;
          
          if (functionLines > longFunctionThreshold) {
            codeSmells.longFunctions++;
          }
        }
        
        lastFunctionStartIndex = match.index;
      }
      
      // Check the last function too
      if (lastFunctionStartIndex >= 0) {
        const functionContent = file.content.substring(lastFunctionStartIndex);
        const functionLines = functionContent.split('\n').length;
        
        if (functionLines > longFunctionThreshold) {
          codeSmells.longFunctions++;
        }
      }
      
      // Detect deep nesting
      const nestingMatches = file.content.match(nestingRegex) || [];
      codeSmells.deepNesting += nestingMatches.filter(line => 
        (line.startsWith(' ') && line.length >= 12) || // 3+ levels of 4-space indent 
        (line.startsWith('\t') && line.length >= 3)    // 3+ levels of tab indent
      ).length;
      
      // Detect long lines
      codeSmells.longLines += lines.filter(line => line.length > longLineThreshold).length;
      
      // Detect magic numbers
      const magicNumberMatches = file.content.match(magicNumberRegex) || [];
      codeSmells.magicNumbers += magicNumberMatches.length;
      
      // Detect TODO comments
      const todoMatches = file.content.match(todoRegex) || [];
      codeSmells.todoComments += todoMatches.length;
      
      // Look for potential code duplication (simplistic approach)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip very short lines, blank lines, and comment lines
        if (line.length < 20 || line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) continue;
        
        // Use 20-char snippets as pattern identifiers
        if (line.length >= 20) {
          const pattern = line.substring(0, 20);
          commonPatterns.set(pattern, (commonPatterns.get(pattern) || 0) + 1);
        }
      }
    }
    
    // Count duplicated patterns
    for (const [_, count] of commonPatterns) {
      if (count > 3) { // More than 3 occurrences might suggest duplication
        codeSmells.duplicatedPatterns++;
      }
    }
    
    // Calculate aggregate metrics
    const codeDuplicationRatio = codeSmells.duplicatedPatterns / totalCodeLines * 1000; // per thousand lines
    const commentRatio = totalCodeLines > 0 ? totalCommentLines / totalCodeLines : 0;
    const complexityRatio = totalCodeLines > 0 ? complexityScore / totalCodeLines * 100 : 0;
    const codeSmellDensity = totalCodeLines > 0 ? 
      (codeSmells.longFunctions + codeSmells.deepNesting + codeSmells.longLines + codeSmells.magicNumbers) / totalCodeLines * 1000 : 0;
    
    return {
      totalLines,
      totalCodeLines,
      totalCommentLines,
      totalBlankLines,
      totalFiles,
      averageLinesPerFile: Math.round(totalLines / (totalFiles || 1)),
      commentRatio: parseFloat(commentRatio.toFixed(2)),
      complexityScore,
      complexityRatio: parseFloat(complexityRatio.toFixed(2)),
      filesByExtension,
      languageBreakdown: languages,
      codeSmells,
      codeSmellDensity: parseFloat(codeSmellDensity.toFixed(2)),
      codeDuplicationRatio: parseFloat(codeDuplicationRatio.toFixed(2)),
      maintainabilityIndex: parseFloat((100 - complexityRatio * 0.2 - codeSmellDensity * 0.3 + commentRatio * 10).toFixed(2))
    };
  }
  
  /**
   * Map file extension to language for analysis
   */
  private getLanguageFromExtension(ext: string): string {
    const languageMap: Record<string, string> = {
      'js': 'js', 'jsx': 'js', 'ts': 'js', 'tsx': 'js',
      'py': 'py',
      'java': 'java', 'kt': 'java',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'c': 'c', 'cpp': 'c', 'h': 'c',
      'cs': 'csharp',
      'html': 'html', 'css': 'css', 'scss': 'css', 'less': 'css',
      'json': 'json',
      'md': 'markdown'
    };
    
    return languageMap[ext.toLowerCase()] || 'other';
  }
  
  /**
   * Utility: Get the file extension
   */
  private getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : 'unknown';
  }
  
  /**
   * Utility: Get the directory of a file
   */
  private getDirectory(filepath: string): string {
    const parts = filepath.split('/');
    parts.pop(); // Remove the filename
    return parts.join('/');
  }
  
  /**
   * Utility: Normalize a path (resolve ../ and ./)
   */
  private normalizePath(path: string): string {
    const parts = path.split('/');
    const result = [];
    
    for (const part of parts) {
      if (part === '..') {
        result.pop();
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }
    
    return result.join('/');
  }
  
  /**
   * Utility: Check if file is a code file
   */
  private isCodeFile(filename: string): boolean {
    const codeExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'rb', 'c', 'cpp', 'h', 'go', 'rs', 'php', 'html', 'css', 'scss'];
    const ext = this.getFileExtension(filename);
    return codeExtensions.includes(ext);
  }
} 