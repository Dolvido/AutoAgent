import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { CodebaseCritic } from "@/lib/codebase-critic";
import { runCritiqueAgent, CritiqueResultForAgent } from "@/lib/agents/critique-agent";
import { saveCritique } from "@/lib/db/database";
import { CritiqueResult } from "@/components/CritiqueResults";
import { v4 as uuidv4 } from "uuid";

// Simple types
interface CodeFile {
  name: string;
  content: string;
}

interface CodebaseStructure {
  files: CodeFile[];
  dependencyGraph: { [filePath: string]: string[] };
  fileTypes: { [extension: string]: number };
  codeMetrics: {
    totalLines: number;
    totalFiles: number;
    averageLinesPerFile: number;
    filesByExtension: { [key: string]: number };
  };
}

// Helper function to build CodebaseStructure from files
function buildCodebaseStructure(files: CodeFile[]): CodebaseStructure {
  // Count files by type
  const fileTypes: { [extension: string]: number } = {};
  let totalLines = 0;
  
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    
    // Count lines
    const lineCount = file.content.split('\n').length;
    totalLines += lineCount;
  }
  
  // Generate a basic dependency graph (simple approach)
  // This is a simplified version - a real implementation would parse imports/requires
  const dependencyGraph: { [filePath: string]: string[] } = {};
  
  for (const file of files) {
    dependencyGraph[file.name] = [];
    
    // Different import patterns based on file types
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    
    // For JavaScript/TypeScript files
    if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
      const importMatches = file.content.matchAll(/from\s+['"](.+?)['"]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        // Convert relative imports to absolute paths
        if (importPath.startsWith('.')) {
          const fileDir = path.dirname(file.name);
          const resolvedPath = path.resolve(fileDir, importPath);
          const matchingFile = files.find(f => f.name.includes(resolvedPath));
          if (matchingFile) {
            dependencyGraph[file.name].push(matchingFile.name);
          }
        }
      }
    }
    
    // For Python files
    if (ext === 'py') {
      const importMatches = file.content.matchAll(/import\s+(\w+)|from\s+(\w+)\s+import/g);
      for (const match of importMatches) {
        const importName = match[1] || match[2];
        // Find matching Python files
        const matchingFile = files.find(f => f.name.endsWith(`/${importName}.py`));
        if (matchingFile) {
          dependencyGraph[file.name].push(matchingFile.name);
        }
      }
    }
  }
  
  return {
    files,
    dependencyGraph,
    fileTypes,
    codeMetrics: {
      totalLines,
      totalFiles: files.length,
      averageLinesPerFile: files.length > 0 ? Math.round(totalLines / files.length) : 0,
      filesByExtension: fileTypes
    }
  };
}

// Helper function to recursively load files from a directory
function loadFilesFromDirectory(
  dirPath: string, 
  basePath: string = '', 
  ignorePatterns: string[] = ['.git', 'node_modules', 'dist', 'build', '.next', '.vscode']
): CodeFile[] {
  const files: CodeFile[] = [];
  
  try {
    // Check if dirPath is an absolute path (already normalized by the caller)
    const isAbsolutePath = path.isAbsolute(dirPath);
    console.log(`Loading directory: ${dirPath} (absolute: ${isAbsolutePath}), basePath: ${basePath}`);
    
    // Construct the full path to read
    let fullPath;
    if (basePath === '') {
      // For the root directory, use dirPath directly
      fullPath = dirPath;
    } else {
      // For subdirectories, join with basePath
      fullPath = path.join(dirPath, basePath);
    }
    
    console.log(`Reading directory at: ${fullPath}`);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      const entryFullPath = path.join(dirPath, relativePath);
      
      // Skip ignored directories
      if (entry.isDirectory()) {
        if (ignorePatterns.includes(entry.name)) {
          console.log(`Skipping ignored directory: ${entry.name}`);
          continue;
        }
        
        // Recursively process subdirectories with the same root dirPath
        const subDirFiles = loadFilesFromDirectory(
          dirPath, 
          relativePath, 
          ignorePatterns
        );
        files.push(...subDirFiles);
      } else {
        // Process files (text files only)
        try {
          // Skip binary files and very large files
          const stats = fs.statSync(entryFullPath);
          if (stats.size > 1024 * 1024) {
            console.log(`Skipping large file: ${entryFullPath} (${stats.size} bytes)`);
            continue; // Skip files larger than 1MB
          }
          
          // Skip files with binary extensions
          const ext = path.extname(entry.name).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.ico', '.exe', '.dll', '.so', '.dylib'].includes(ext)) {
            console.log(`Skipping binary file: ${entry.name}`);
            continue;
          }
          
          // Read file content
          const content = fs.readFileSync(entryFullPath, 'utf8');
          
          // Use forward slashes for consistency across platforms
          const normalizedPath = relativePath.replace(/\\/g, '/');
          
          files.push({
            name: normalizedPath,
            content
          });
        } catch (error) {
          console.warn(`Failed to read file ${entryFullPath}:`, error);
          // Continue with other files
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${path.join(dirPath, basePath)}:`, error);
  }
  
  return files;
}

// Helper to get language from filename
function getLanguageFromFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const langMap: { [key: string]: string } = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'jsx',
        '.tsx': 'tsx',
        // Add more
    };
    return langMap[ext] || 'unknown';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Inputs can be single code or directory path
    const { code, language: singleLanguage, directoryPath, excludedPatterns } = body;

    let critiqueResults: CritiqueResultForAgent[] = [];
    let allFilesAnalyzed: CodeFile[] = [];
    let errorsEncountered: string[] = [];
    let finalSummary = "Critique generated by agent."; // Default summary
    let finalLanguage = singleLanguage || 'multiple'; // Default if multiple files

    if (code && singleLanguage) {
      // --- Scenario 1: Single Code Input --- 
      console.log(`Received single critique request for language: ${singleLanguage}. Running CritiqueAgent...`);
      const agentResult = await runCritiqueAgent(code, singleLanguage);
      if ("error" in agentResult) {
        console.error("Critique Agent failed:", agentResult.error);
        return NextResponse.json({ error: `Critique generation failed: ${agentResult.error}` }, { status: 500 });
      }
      critiqueResults.push(agentResult);
      allFilesAnalyzed.push({ name: 'input.txt', content: code }); // Placeholder filename
      finalSummary = agentResult.summary || finalSummary;

    } else if (directoryPath && typeof directoryPath === 'string') {
      // --- Scenario 2: Directory Path Input --- 
      console.log(`Received critique request for directory: ${directoryPath}. Loading files...`);
      
      // Simple path handling - use exactly what was provided
      let fullDirectoryPath = directoryPath;
      
      // Get the directory name from the request (to check if it's from File System Access API)
      const dirName = path.basename(directoryPath);
      
      // Only resolve absolute path if it's not already absolute
      if (!path.isAbsolute(directoryPath)) {
        // Check if this is likely from the File System Access API - handle specially
        // File System API just sends directory names, not paths
        const cwd = process.cwd();
        const projectRoot = path.dirname(cwd);
        
        // Check if the requested directory exists at cwd, parent dir, or common project locations
        const possiblePaths = [
          // Current directory
          path.join(cwd, directoryPath),
          // Parent directory (for sibling projects)
          path.join(projectRoot, directoryPath),
          // Sibling next to the project
          path.join(projectRoot, dirName)
        ];
        
        // Find the first path that exists
        let pathExists = false;
        for (const testPath of possiblePaths) {
          try {
            if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
              fullDirectoryPath = testPath;
              pathExists = true;
              console.log(`Found directory at: ${fullDirectoryPath}`);
              break;
            }
          } catch (err) {
            // Ignore path access errors and try the next one
          }
        }
        
        if (!pathExists) {
          // If no matching path was found, use the standard CWD resolution as fallback
          fullDirectoryPath = path.resolve(cwd, directoryPath);
          console.log(`No exact match found, using standard path resolution: ${fullDirectoryPath}`);
        }
      } else {
        console.log(`Using absolute path as provided: ${fullDirectoryPath}`);
      }
      
      // Validate directory exists
      if (!fs.existsSync(fullDirectoryPath) || !fs.statSync(fullDirectoryPath).isDirectory()) {
        console.error(`Directory not found or not accessible: ${fullDirectoryPath}`);
        return NextResponse.json({ 
          error: `Directory not found or not accessible: ${directoryPath}`,
          details: { 
            checkedPath: fullDirectoryPath,
            requestedPath: directoryPath,
            cwd: process.cwd(),
            dirName: dirName
          }
        }, { status: 400 });
      }

      const ignorePatterns = excludedPatterns || ['.git', 'node_modules', 'dist', 'build', '.next', '.vscode', '.*ignore', '*.lock'];
      // Use the full directory path when loading files
      allFilesAnalyzed = loadFilesFromDirectory(fullDirectoryPath, '', ignorePatterns);
      
      if (allFilesAnalyzed.length === 0) {
        console.warn(`No analyzable files found in directory: ${directoryPath}`);
        return NextResponse.json({ error: `No analyzable files found in directory: ${directoryPath}` }, { status: 400 });
      }
      console.log(`Found ${allFilesAnalyzed.length} files. Running CritiqueAgent for each...`);

      // Run agent for each file concurrently (can be slow for many files!)
      const agentPromises = allFilesAnalyzed.map(async (file) => {
        const fileLang = getLanguageFromFilename(file.name);
        if (fileLang === 'unknown') {
          console.log(`Skipping file with unknown language: ${file.name}`);
          return null; // Skip unknown file types
        }
        console.log(` - Running agent for: ${file.name} (${fileLang})`);
        const result = await runCritiqueAgent(file.content, fileLang);
        // Include filename with the result for later mapping
        return { ...result, filename: file.name }; 
      });

      const resultsWithNulls = await Promise.all(agentPromises);
      const allAgentResults = resultsWithNulls.filter(r => r !== null) as (CritiqueResultForAgent & { filename: string } | { error: string; filename: string })[];

      // Separate successful results and errors
      allAgentResults.forEach(res => {
        if ("error" in res) {
          console.error(`Agent failed for ${res.filename}:`, res.error);
          errorsEncountered.push(`Failed analysis for ${res.filename}: ${res.error}`);
        } else {
          critiqueResults.push(res); // Add successful result
        }
      });
      
      // Generate a combined summary (simple for now)
      const totalIssues = critiqueResults.reduce((sum, r) => sum + (r.issues?.length || 0), 0);
      finalSummary = `Analysis of ${critiqueResults.length} files complete. Found ${totalIssues} potential issues.`;
      if (errorsEncountered.length > 0) {
        finalSummary += ` Encountered ${errorsEncountered.length} errors during analysis.`;
        console.error("Errors during directory analysis:", errorsEncountered);
      }
    }

    // Save results to database
    const critiqueId = `crit-${uuidv4().slice(0, 8)}`;
    
    // Convert to proper CritiqueResult format
    let allIssues: any[] = [];
    
    // Extract issues from all critique results
    critiqueResults.forEach(agentResult => {
      const filename = (agentResult as any).filename || 'input.txt';
      (agentResult.issues || []).forEach(issue => {
        allIssues.push({
          id: `iss-${uuidv4().slice(0, 8)}`,
          title: issue.title || 'Untitled Issue',
          description: issue.description || 'No description provided',
          severity: issue.severity || 'medium',
          lineNumber: issue.line,
          affectedFile: filename,
          fixSuggestion: ''
        });
      });
    });
    
    // Create the final critique result in the correct format
    const finalCritiqueResult: CritiqueResult = {
      id: critiqueId,
      summary: finalSummary,
      language: finalLanguage,
      issues: allIssues,
      strengths: [],
      improvement_areas: [],
      timestamp: new Date().toISOString()
    };
    
    // Get code from the first file or use empty string
    const codeToSave = allFilesAnalyzed.length > 0 ? allFilesAnalyzed[0].content : '';
    
    try {
      await saveCritique(finalCritiqueResult, codeToSave);
      console.log(`Critique ${critiqueId} saved successfully`);
    } catch (saveError) {
      console.error("Error saving critique:", saveError);
    }

    // Add directoryPath to response if it was provided
    const responseData = directoryPath ? { ...finalCritiqueResult, directoryPath } : finalCritiqueResult;
    
    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}