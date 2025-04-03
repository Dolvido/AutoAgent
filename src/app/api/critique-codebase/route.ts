import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";

// Simple types
interface CodeFile {
  name: string;
  content: string;
}

// Generate a mock critique result
const generateMockCritique = (files: CodeFile[]) => {
  // Count files by type
  const fileTypes: Record<string, number> = {};
  let totalLines = 0;
  
  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
    fileTypes[ext] = (fileTypes[ext] || 0) + 1;
    
    // Count lines
    totalLines += file.content.split('\n').length;
  }
  
  // Generate a basic summary
  const summary = `Analyzed ${files.length} files with approximately ${totalLines} lines of code across ${Object.keys(fileTypes).length} file types.`;
  
  // Generate mock findings
  const findings = [
    {
      id: "finding-1",
      title: "Large files detected",
      description: "Some files in the codebase exceed recommended size limits, which can make maintenance difficult.",
      severity: "medium" as const,
      files: files.filter(f => f.content.split('\n').length > 300).map(f => f.name),
      recommendation: "Consider breaking down large files into smaller, focused modules with single responsibilities."
    },
    {
      id: "finding-2",
      title: "Potential duplicate code",
      description: "Patterns suggest there might be code duplication in some files.",
      severity: "low" as const,
      files: files.slice(0, Math.min(3, files.length)).map(f => f.name),
      recommendation: "Review these files for similar code patterns and consider refactoring into shared utilities."
    }
  ];
  
  // Filter out findings with no files
  const validFindings = findings.filter(f => f.files.length > 0);
  
  // Generate strengths
  const strengths = [
    "Project has a clear file organization structure.",
    "File names are descriptive and follow consistent naming conventions.",
    "The codebase uses consistent formatting and coding style."
  ];
  
  // Generate improvement areas
  const improvement_areas = [
    "Consider adding more documentation to improve code clarity.",
    "Implement comprehensive testing for critical components.",
    "Review error handling strategies across the codebase."
  ];
  
  return {
    summary,
    findings: validFindings.length > 0 ? validFindings : [
      {
        id: "default-1",
        title: "Basic code structure analysis",
        description: "The codebase appears to be well-structured overall.",
        severity: "low" as const,
        files: files.slice(0, Math.min(3, files.length)).map(f => f.name),
        recommendation: "Continue following good coding practices and consider adding more comprehensive documentation."
      }
    ],
    strengths,
    improvement_areas
  };
};

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    
    console.log("Received request with body:", JSON.stringify(body));
    
    // Files to analyze
    let files: CodeFile[] = [];
    
    // Handle different input types
    if (body.files && Array.isArray(body.files)) {
      // Handle files array (ZIP upload or browser directory)
      // Validate file objects
      for (const file of body.files) {
        if (!file.name || typeof file.content !== "string") {
          return new Response(
            JSON.stringify({ error: "Each file must have a name and content string" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      
      files = body.files;
      console.log(`Processing ${files.length} files from file array`);
    } 
    else if (body.directoryPath && typeof body.directoryPath === "string") {
      // Handle local directory analysis
      const directoryPath = body.directoryPath;
      
      console.log(`Attempting to load files from directory: ${directoryPath}`);
      
      // Check if the directory exists and is accessible
      try {
        const stats = fs.statSync(directoryPath);
        
        if (!stats.isDirectory()) {
          console.error(`Path exists but is not a directory: ${directoryPath}`);
          return new Response(
            JSON.stringify({ 
              error: "The specified path is not a directory", 
              path: directoryPath
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        
        // Check if we can read the directory contents
        try {
          const entries = fs.readdirSync(directoryPath);
          console.log(`Directory is readable and contains ${entries.length} entries`);
          
          // Load files from directory
          const loadedFiles = loadFilesFromDirectory(directoryPath);
          files = loadedFiles;
          console.log(`Loaded ${files.length} files from directory`);
        } catch (readErr) {
          console.error(`Cannot read directory contents: ${directoryPath}`, readErr);
          return new Response(
            JSON.stringify({ 
              error: "Directory is not readable", 
              path: directoryPath,
              details: readErr instanceof Error ? readErr.message : "Unknown error"
            }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (err) {
        console.error(`Directory not accessible: ${directoryPath}`, err);
        return new Response(
          JSON.stringify({ 
            error: "Directory not found or not accessible", 
            path: directoryPath, 
            details: err instanceof Error ? err.message : "Unknown error" 
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }
    else {
      return new Response(
        JSON.stringify({ error: "Request must include either 'files' array or 'directoryPath'" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    if (files.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid files found to analyze" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Generate the critique (mock implementation)
    console.log("Generating critique...");
    const critique = generateMockCritique(files);
    console.log("Critique generation complete");
    
    // Return the response
    return new Response(
      JSON.stringify(critique),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in critique-codebase API:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Helper function to recursively load files from a directory
function loadFilesFromDirectory(
  dirPath: string, 
  basePath: string = '', 
  ignorePatterns: string[] = ['.git', 'node_modules', 'dist', 'build', '.next', '.vscode']
): CodeFile[] {
  const files: CodeFile[] = [];
  
  try {
    // Read all entries in the directory
    const entries = fs.readdirSync(path.join(dirPath, basePath), { withFileTypes: true });
    
    for (const entry of entries) {
      const relativePath = path.join(basePath, entry.name);
      const fullPath = path.join(dirPath, relativePath);
      
      // Skip ignored directories
      if (entry.isDirectory()) {
        if (ignorePatterns.includes(entry.name)) continue;
        
        // Recursively process subdirectories
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
          const stats = fs.statSync(fullPath);
          if (stats.size > 1024 * 1024) continue; // Skip files larger than 1MB
          
          // Skip files with binary extensions
          const ext = path.extname(entry.name).toLowerCase();
          if (['.jpg', '.jpeg', '.png', '.gif', '.ico', '.exe', '.dll', '.so', '.dylib'].includes(ext)) {
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
  } catch (error) {
    console.error(`Error reading directory ${dirPath}/${basePath}:`, error);
  }
  
  return files;
} 