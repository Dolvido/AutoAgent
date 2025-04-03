import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

// File types to analyze
const CODE_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', // JavaScript/TypeScript
  '.py', // Python
  '.java', // Java
  '.cs', // C#
  '.go', // Go
  '.rs', // Rust
  '.c', '.cpp', '.h', '.hpp', // C/C++
  '.rb', // Ruby
  '.php', // PHP
  '.swift', // Swift
  '.kt', // Kotlin
]);

// Directories to ignore by default
const DEFAULT_IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  '__pycache__',
  'venv',
  'env',
  '.next',
  'out',
]);

// Interface for a codebase file
export interface CodeFile {
  path: string;
  relativePath: string;
  content: string;
  extension: string;
  language: string;
  size: number;
  lastModified: Date;
  imports: string[]; // Files this file imports/depends on
}

// Interface for codebase analysis result
export interface CodebaseAnalysis {
  files: CodeFile[];
  rootDir: string;
  fileCount: number;
  totalSize: number;
  languages: Record<string, number>; // language -> file count
  dependencies: Record<string, string[]>; // file -> imported files
}

// Interface for analysis options
export interface CodebaseAnalysisOptions {
  ignorePatterns?: string[];
  maxFiles?: number;
  includeContents?: boolean;
}

// Get language from file extension
export function getLanguageFromExtension(extension: string): string {
  const extensionMap: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cs': 'csharp',
    '.go': 'go',
    '.rs': 'rust',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
  };
  
  return extensionMap[extension.toLowerCase()] || 'plaintext';
}

// Simple import detection based on regex
function detectImports(content: string, extension: string): string[] {
  const imports: string[] = [];
  
  // Different regex patterns for different file types
  if (['.js', '.jsx', '.ts', '.tsx'].includes(extension)) {
    // JavaScript/TypeScript import patterns
    const importRegex = /import\s+(?:[\w*\s{},]*)\s+from\s+['"]([^'"]+)['"]/g;
    const requireRegex = /(?:const|let|var)\s+(?:[\w*\s{},]*)\s+=\s+require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  } else if (extension === '.py') {
    // Python import patterns
    const importRegex = /(?:from\s+([^\s]+)\s+import|import\s+([^\s]+))/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }
  }
  // Add more language-specific import detection as needed
  
  return imports;
}

// Recursive function to scan directory
async function scanDirectory(
  dirPath: string,
  rootDir: string,
  analysis: CodebaseAnalysis,
  options: CodebaseAnalysisOptions = {}
): Promise<void> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    
    // Create combined set of ignore patterns
    const ignoreSet = new Set(DEFAULT_IGNORE_DIRS);
    if (options.ignorePatterns) {
      options.ignorePatterns.forEach(pattern => ignoreSet.add(pattern));
    }
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      
      if (entry.isDirectory()) {
        // Skip ignored directories
        if (!ignoreSet.has(entry.name)) {
          await scanDirectory(fullPath, rootDir, analysis, options);
        }
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name);
        
        if (CODE_EXTENSIONS.has(extension)) {
          try {
            const fileStat = await stat(fullPath);
            
            // Apply file limit
            if (options.maxFiles && analysis.files.length >= options.maxFiles) {
              continue;
            }
            
            // Read content based on options
            const content = options.includeContents === false 
              ? '' 
              : await readFile(fullPath, 'utf-8');
              
            const language = getLanguageFromExtension(extension);
            const imports = options.includeContents === false 
              ? [] 
              : detectImports(content, extension);
            
            const codeFile: CodeFile = {
              path: fullPath,
              relativePath,
              content,
              extension,
              language,
              size: fileStat.size,
              lastModified: fileStat.mtime,
              imports,
            };
            
            analysis.files.push(codeFile);
            analysis.totalSize += fileStat.size;
            analysis.languages[language] = (analysis.languages[language] || 0) + 1;
            analysis.dependencies[relativePath] = imports;
          } catch (error) {
            console.error(`Error processing file ${fullPath}:`, error);
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error);
  }
}

// Main function to analyze a codebase
export async function analyzeCodebase(
  rootDir: string, 
  options: CodebaseAnalysisOptions = {}
): Promise<CodebaseAnalysis> {
  const analysis: CodebaseAnalysis = {
    files: [],
    rootDir,
    fileCount: 0,
    totalSize: 0,
    languages: {},
    dependencies: {},
  };
  
  await scanDirectory(rootDir, rootDir, analysis, options);
  analysis.fileCount = analysis.files.length;
  
  return analysis;
}

// Extract a smaller relevant subset of files based on a focus file
export function extractRelevantFiles(
  analysis: CodebaseAnalysis,
  focusFilePath: string,
  depth: number = 2
): CodeFile[] {
  const relativeFocusPath = path.relative(analysis.rootDir, focusFilePath);
  const relevantFiles = new Set<string>([relativeFocusPath]);
  
  // Dependency graph exploration (both ways)
  const visited = new Set<string>();
  const toVisit = [relativeFocusPath];
  let currentDepth = 0;
  
  while (toVisit.length > 0 && currentDepth < depth) {
    const currentBatch = [...toVisit];
    toVisit.length = 0;
    
    for (const filePath of currentBatch) {
      if (visited.has(filePath)) continue;
      visited.add(filePath);
      
      // Add files that this file imports
      const dependencies = analysis.dependencies[filePath] || [];
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          relevantFiles.add(dep);
          toVisit.push(dep);
        }
      }
      
      // Add files that import this file
      for (const [path, deps] of Object.entries(analysis.dependencies)) {
        if (deps.includes(filePath) && !visited.has(path)) {
          relevantFiles.add(path);
          toVisit.push(path);
        }
      }
    }
    
    currentDepth++;
  }
  
  // Filter the files array to only include relevant files
  return analysis.files.filter(file => relevantFiles.has(file.relativePath));
}

// Summarize codebase structure
export function summarizeCodebase(analysis: CodebaseAnalysis): string {
  const { fileCount, totalSize, languages } = analysis;
  
  const languageSummary = Object.entries(languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count} files`)
    .join(', ');
  
  return `Codebase Summary:
- Total Files: ${fileCount}
- Total Size: ${(totalSize / 1024).toFixed(2)} KB
- Languages: ${languageSummary}`;
} 