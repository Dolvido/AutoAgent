import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import fs from 'fs';
import path from 'path';

// Helper to walk a directory and collect files
function walkDirectorySync(dir: string, fileList: string[] = [], excludedDirs = ['node_modules', '.git', 'dist', 'build', '.next']) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      if (!excludedDirs.includes(file)) {
        walkDirectorySync(filePath, fileList, excludedDirs);
      }
    } else {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

// Function to collect code files with content
export async function collectCodeFiles(basePath: string) {
  try {
    if (!basePath || !fs.existsSync(basePath)) {
      console.error(`Invalid base path: ${basePath}`);
      return [];
    }
    
    console.log(`Collecting code files from ${basePath}...`);
    const allFiles = walkDirectorySync(basePath);
    
    // Filter for code files and read their contents
    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.cs', '.c', '.cpp', '.java', '.html', '.css', '.scss'];
    const codeFiles = allFiles.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return codeExtensions.includes(ext);
    });
    
    console.log(`Found ${codeFiles.length} code files out of ${allFiles.length} total files`);
    
    const documents = [];
    for (const file of codeFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (content.trim()) {
          documents.push({
            pageContent: content,
            metadata: {
              file: path.relative(basePath, file),
              path: file,
              extension: path.extname(file).toLowerCase()
            }
          });
        }
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
    
    console.log(`Successfully loaded ${documents.length} code files`);
    return documents;
  } catch (error) {
    console.error("Error collecting code files:", error);
    return [];
  }
}

// Find relevant files for an issue using in-memory vector store
export async function findRelevantFiles(
  issue: { title: string; description: string },
  basePath: string,
  maxResults = 3
): Promise<string[]> {
  try {
    console.log(`Finding relevant files for issue "${issue.title}"...`);
    
    // Create embeddings with Ollama (fallback to simple matching if it fails)
    let embeddings;
    try {
      embeddings = new OllamaEmbeddings({
        model: "mistral",  // Use whichever model you have installed
        baseUrl: "http://localhost:11434"
      });
      await embeddings.embedQuery("test"); // Test if Ollama is available
      console.log("Successfully connected to Ollama");
    } catch (error) {
      console.warn("Ollama not available for embeddings, will use fallback method:", error);
      return findRelevantFilesSimple(issue, basePath, maxResults);
    }
    
    // Collect code files
    const documents = await collectCodeFiles(basePath);
    if (documents.length === 0) {
      console.warn("No code files found to search");
      return [];
    }
    
    // Create in-memory vector store
    console.log("Creating in-memory vector store...");
    const vectorStore = await MemoryVectorStore.fromDocuments(
      documents,
      embeddings
    );
    
    // Query for similar documents
    const query = `${issue.title} ${issue.description}`;
    console.log(`Searching for files relevant to: ${query.substring(0, 100)}...`);
    
    const results = await vectorStore.similaritySearch(query, maxResults);
    
    const relevantFiles = results.map(doc => doc.metadata.file);
    console.log(`Found ${relevantFiles.length} relevant files:`, relevantFiles);
    
    return relevantFiles;
  } catch (error) {
    console.error("Error in semantic search:", error);
    // Fall back to simple text matching
    return findRelevantFilesSimple(issue, basePath, maxResults);
  }
}

// Simple fallback method using text matching when Ollama isn't available
function findRelevantFilesSimple(
  issue: { title: string; description: string }, 
  basePath: string,
  maxResults = 3
): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      console.log("Using simple text matching to find relevant files...");
      // Extract keywords from issue title and description
      const text = `${issue.title} ${issue.description}`.toLowerCase();
      const keywords = extractKeywords(text);
      
      if (keywords.length === 0) {
        console.warn("No meaningful keywords extracted from issue");
        resolve([]);
        return;
      }
      
      console.log(`Extracted keywords: ${keywords.join(', ')}`);
      
      // Get all code files
      const files = walkDirectorySync(basePath);
      const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.cs', '.c', '.cpp', '.java', '.html', '.css', '.scss'];
      const codeFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return codeExtensions.includes(ext);
      });
      
      console.log(`Scanning ${codeFiles.length} code files for keyword matches...`);
      
      const matchedFiles: Array<{path: string, score: number}> = [];
      
      for (const file of codeFiles) {
        try {
          const content = fs.readFileSync(file, 'utf8').toLowerCase();
          // Calculate match score
          let score = 0;
          for (const keyword of keywords) {
            if (content.includes(keyword)) {
              score += 1;
              // Bonus if keyword appears in the file path
              if (file.toLowerCase().includes(keyword)) {
                score += 2;
              }
            }
          }
          
          if (score > 0) {
            matchedFiles.push({
              path: path.relative(basePath, file),
              score
            });
          }
        } catch (err) {
          // Skip files that can't be read
        }
      }
      
      // Return top matches
      const result = matchedFiles
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(match => match.path);
      
      console.log(`Found ${result.length} files using text matching:`, result);
      resolve(result);
    } catch (error) {
      console.error("Error in simple text matching:", error);
      resolve([]);
    }
  });
}

function extractKeywords(text: string): string[] {
  // Ignore common words and keep meaningful terms
  const stopwords = [
    'the', 'and', 'is', 'in', 'it', 'to', 'that', 'this', 'with', 'for', 'as', 'be', 'by', 'on', 'not', 
    'are', 'from', 'at', 'an', 'was', 'have', 'has', 'had', 'were', 'would', 'could', 'should'
  ];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .split(/\s+/)
    .filter(word => word.length > 3)  // Only words longer than 3 chars
    .filter(word => !stopwords.includes(word));
} 