"use server";

import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OllamaEmbeddings } from "@langchain/ollama";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import fs from 'node:fs';
import path from 'node:path';

// Helper to walk a directory and collect files
async function walkDir(dir: string, callback: (filePath: string) => void) {
  try {
    const files = await fs.promises.readdir(dir);
    
    for (const file of files) {
      // Skip node_modules, .git, etc.
      if (file === 'node_modules' || file === '.git' || file === '.next' || file === 'temp') {
        continue;
      }
      
      try {
        const filePath = path.join(dir, file);
        const stat = await fs.promises.stat(filePath);
        
        if (stat.isDirectory()) {
          await walkDir(filePath, callback);
        } else {
          callback(filePath);
        }
      } catch (err) {
        console.error(`Error processing ${path.join(dir, file)}:`, err);
        // Continue with next file
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
    // Return without failing
  }
}

// Find files relevant to a specific issue or query
export async function findRelevantFiles(issue: {
  title: string;
  description: string;
}, basePath: string): Promise<string[]> {
  try {
    // Extract the query from the issue
    const query = `${issue.title} ${issue.description}`;
    
    // Define extensions to target
    const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs'];
    const configExtensions = ['.json', '.yaml', '.yml', '.xml', '.toml'];
    const testExtensions = ['.test.js', '.test.ts', '.spec.js', '.spec.ts', 'Test.java', 'Tests.cs'];
    const supportedExtensions = [...codeExtensions, ...configExtensions];
    
    // Check if basePath exists before walking
    if (!fs.existsSync(basePath)) {
      console.error(`Base path does not exist: ${basePath}`);
      return ['unknown']; 
    }

    // First, try to extract specific code entities from the description
    const codeEntities = extractCodeEntities(issue.title, issue.description);
    if (codeEntities.length > 0) {
      console.log(`Found specific code entities: ${codeEntities.join(', ')}`);
      
      // Search for files containing these entities
      const filesWithEntities = await findFilesContainingEntities(basePath, codeEntities);
      if (filesWithEntities.length > 0) {
        console.log(`Found ${filesWithEntities.length} files containing the specific entities`);
        return filesWithEntities;
      }
    }

    // Next, try to categorize the issue to target specific files
    const issueType = categorizeIssue(query);
    console.log(`Issue type detected: ${issueType}`);
    
    // For specific issue types, we can target files more precisely
    if (issueType === 'test') {
      return await findFilesByPattern(basePath, testExtensions, ['test', 'spec']);
    } else if (issueType === 'security' || issueType === 'auth') {
      return await findSecurityRelatedFiles(basePath, query);
    } else if (issueType === 'config') {
      return await findFilesByPattern(basePath, configExtensions);
    } else if (issueType === 'performance') {
      return await findPerformanceRelatedFiles(basePath);
    }
    
    // Find by simple matching if query is short or if Ollama is not available
    if (query.length < 20) {
      return findFilesByTextMatch(issue, basePath, supportedExtensions);
    }
    
    // Collect all files
    const files: string[] = [];
    await walkDir(basePath, (filePath) => {
      // Skip node_modules and .git
      if (filePath.includes('node_modules') || filePath.includes('.git')) {
        return;
      }
      
      // Only collect files with supported extensions
      if (supportedExtensions.includes(path.extname(filePath))) {
        files.push(filePath);
      }
    });
    
    // If no files found, return unknown
    if (files.length === 0) {
      console.log(`No supported files found in ${basePath}`);
      return ['unknown'];
    }
    
    // Try Ollama embeddings first
    try {
      return await findFilesWithEmbeddings(query, files, basePath);
    } catch (embeddingError) {
      console.error('Error with embeddings search:', embeddingError);
      // Fall back to text matching
      return findFilesByTextMatch(issue, basePath, supportedExtensions);
    }
  } catch (error) {
    console.error("Error finding relevant files:", error);
    return ['unknown'];
  }
}

// Helper function to categorize the issue
function categorizeIssue(query: string): string {
  query = query.toLowerCase();
  
  if (query.includes('test') || query.includes('spec') || query.includes('magic number') || 
      query.includes('unit test') || query.includes('mock')) {
    return 'test';
  }
  
  if (query.includes('security') || query.includes('vulnerability') || query.includes('auth') ||
      query.includes('password') || query.includes('token') || query.includes('sanitize')) {
    return 'security';
  }
  
  if (query.includes('config') || query.includes('environment') || query.includes('setting') ||
      query.includes('var') || query.includes('constant') || query.includes('parameter')) {
    return 'config';
  }
  
  if (query.includes('performance') || query.includes('slow') || query.includes('optimize') ||
      query.includes('inefficient') || query.includes('sort') || query.includes('loop')) {
    return 'performance';
  }
  
  return 'general';
}

// Find files by extension and optional search terms
async function findFilesByPattern(
  basePath: string,
  extensions: string[],
  searchTerms: string[] = []
): Promise<string[]> {
  const matchedFiles: string[] = [];
  
  await walkDir(basePath, (filePath) => {
    const ext = path.extname(filePath);
    const fileName = path.basename(filePath).toLowerCase();
    
    // Check if extension matches
    if (extensions.includes(ext)) {
      matchedFiles.push(filePath);
      return;
    }
    
    // Check for test file patterns like .test.js
    for (const testExt of extensions) {
      if (testExt.includes('.test.') || testExt.includes('.spec.')) {
        if (fileName.includes('.test.') || fileName.includes('.spec.')) {
          matchedFiles.push(filePath);
          return;
        }
      }
    }
    
    // Check if filename contains any of the search terms
    if (searchTerms.length > 0) {
      for (const term of searchTerms) {
        if (fileName.includes(term.toLowerCase())) {
          matchedFiles.push(filePath);
          return;
        }
      }
    }
  });
  
  if (matchedFiles.length === 0) {
    return ['unknown'];
  }
  
  // Return relative paths
  return matchedFiles.map(file => path.relative(basePath, file));
}

// Find security-related files
async function findSecurityRelatedFiles(basePath: string, query: string): Promise<string[]> {
  const securityPatterns = [
    'auth', 'security', 'permission', 'role', 'user', 'password', 
    'token', 'login', 'jwt', 'oauth', 'api'
  ];
  
  // Additional patterns based on query
  const queryTerms = query.toLowerCase().split(/\s+/)
    .filter(term => term.length > 3 && !securityPatterns.includes(term));
  
  if (queryTerms.length > 0) {
    securityPatterns.push(...queryTerms.slice(0, 3)); // Add top 3 query terms
  }
  
  const matchedFiles: string[] = [];
  
  await walkDir(basePath, (filePath) => {
    const fileName = path.basename(filePath).toLowerCase();
    
    // Check file name patterns
    for (const pattern of securityPatterns) {
      if (fileName.includes(pattern)) {
        matchedFiles.push(filePath);
        return;
      }
    }
    
    // Check file content if it's a JavaScript/TypeScript file
    const ext = path.extname(filePath);
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for security-related keywords in content
        if (content.includes('authenticate') || 
            content.includes('authorize') || 
            content.includes('permission') ||
            content.includes('token') ||
            content.includes('password')) {
          matchedFiles.push(filePath);
        }
      } catch (err) {
        // Skip files with read errors
      }
    }
  });
  
  if (matchedFiles.length === 0) {
    return ['unknown'];
  }
  
  // Return relative paths
  return matchedFiles.map(file => path.relative(basePath, file));
}

// Find performance-related files
async function findPerformanceRelatedFiles(basePath: string): Promise<string[]> {
  const performancePatterns = [
    'data', 'service', 'processor', 'handler', 'controller', 'util', 
    'query', 'fetch', 'sort', 'filter', 'loop'
  ];
  
  const matchedFiles: string[] = [];
  
  await walkDir(basePath, (filePath) => {
    const fileName = path.basename(filePath).toLowerCase();
    
    // Check file name patterns
    for (const pattern of performancePatterns) {
      if (fileName.includes(pattern)) {
        matchedFiles.push(filePath);
        return;
      }
    }
    
    // Check file content for data processing code
    const ext = path.extname(filePath);
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Check for data processing or performance-related patterns
        if (content.includes('.map(') || 
            content.includes('.filter(') || 
            content.includes('.reduce(') ||
            content.includes('.sort(') ||
            content.includes('for (') ||
            content.includes('while (')) {
          matchedFiles.push(filePath);
        }
      } catch (err) {
        // Skip files with read errors
      }
    }
  });
  
  if (matchedFiles.length === 0) {
    return ['unknown'];
  }
  
  // Return relative paths
  return matchedFiles.map(file => path.relative(basePath, file));
}

// Simple text matching fallback
async function findFilesByTextMatch(
  issue: { title: string; description: string },
  basePath: string, 
  supportedExtensions: string[]
): Promise<string[]> {
  const keywords = extractKeywords(`${issue.title} ${issue.description}`);
  const matchedFiles: Array<{path: string, score: number}> = [];
  
  console.log(`Searching with keywords: ${keywords.join(', ')}`);
  
  const files: string[] = [];
  await walkDir(basePath, (filePath) => {
    if (supportedExtensions.includes(path.extname(filePath))) {
      files.push(filePath);
    }
  });
  
  for (const filePath of files) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      let score = 0;
      
      for (const keyword of keywords) {
        if (content.toLowerCase().includes(keyword.toLowerCase())) {
          score += 1;
          // Bonus if keyword appears in filename
          if (path.basename(filePath).toLowerCase().includes(keyword.toLowerCase())) {
            score += 2;
          }
        }
      }
      
      if (score > 0) {
        matchedFiles.push({
          path: path.relative(basePath, filePath),
          score
        });
      }
    } catch (error) {
      // Skip files with errors
    }
  }
  
  if (matchedFiles.length === 0) {
    return ['unknown'];
  }
  
  return matchedFiles
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(match => match.path);
}

// Find files using embeddings
async function findFilesWithEmbeddings(
  query: string,
  files: string[],
  basePath: string
): Promise<string[]> {
  try {
    // Read content of files
    const fileContents: { path: string; content: string }[] = [];
    for (const filePath of files) {
      try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        fileContents.push({
          path: path.relative(basePath, filePath),
          content
        });
      } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
      }
    }
    
    // Import LangChain components inside function to prevent client-side errors
    const { RecursiveCharacterTextSplitter } = await import('langchain/text_splitter');
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    const { Chroma } = await import('@langchain/community/vectorstores/chroma');
    
    // Split file contents into chunks for embedding
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const documents = [];
    for (const { path: filePath, content } of fileContents) {
      const chunks = await textSplitter.createDocuments(
        [content],
        [{ source: filePath }]
      );
      documents.push(...chunks);
    }
    
    // Create embeddings
    const embeddings = new OllamaEmbeddings({
      model: "codellama",
      baseUrl: "http://localhost:11434",
    });
    
    // Create vector store in memory (not persisted)
    const vectorStore = await Chroma.fromDocuments(documents, embeddings, {
      url: "http://localhost:8000", // ChromaDB URL if you have it running
      collectionName: "code-rag-temp",
    });
    
    // Similarity search
    const results = await vectorStore.similaritySearch(query, 5);
    
    // Extract unique file paths
    const relevantFiles = [...new Set(results.map(doc => doc.metadata.source))];
    console.log(`Found ${relevantFiles.length} relevant files for query "${query.slice(0, 50)}..."`);
    
    return relevantFiles.length > 0 ? relevantFiles : ['unknown'];
  } catch (error) {
    console.error('Error in embeddings search:', error);
    throw error; // Propagate to try fallback
  }
}

// Extract keywords from text
function extractKeywords(text: string): string[] {
  // Common programming terms to ignore
  const stopwords = [
    'the', 'and', 'is', 'in', 'it', 'to', 'that', 'this', 'with', 'for', 'as', 'be', 'by', 'on', 'not', 
    'are', 'from', 'at', 'an', 'was', 'have', 'has', 'had', 'were', 'would', 'could', 'should',
    'function', 'class', 'method', 'variable', 'const', 'let', 'var'
  ];
  
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopwords.includes(word))
    .slice(0, 10); // Limit to top 10 keywords
}

// Extract specific code entities (functions, classes, variables) from text
function extractCodeEntities(title: string, description: string): string[] {
  const entities: string[] = [];
  const fullText = `${title} ${description}`;
  
  // Function names - look for patterns like `functionName` or `function functionName`
  const functionRegex = /`([a-zA-Z0-9_]+)`|function\s+([a-zA-Z0-9_]+)|method\s+([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = functionRegex.exec(fullText)) !== null) {
    const entity = match[1] || match[2] || match[3];
    if (entity && entity.length > 2) {
      entities.push(entity);
    }
  }
  
  // Class names - look for patterns like `ClassName` or `class ClassName`
  const classRegex = /class\s+([a-zA-Z0-9_]+)/g;
  while ((match = classRegex.exec(fullText)) !== null) {
    if (match[1] && match[1].length > 2) {
      entities.push(match[1]);
    }
  }
  
  // Variable names - look for common patterns in backticks
  const variableRegex = /`([A-Z_][A-Z0-9_]+)`/g; // Mostly for constants like `MAX_SIZE`
  while ((match = variableRegex.exec(fullText)) !== null) {
    if (match[1] && match[1].length > 2) {
      entities.push(match[1]);
    }
  }
  
  return [...new Set(entities)]; // Remove duplicates
}

// Find files containing specific code entities
async function findFilesContainingEntities(basePath: string, entities: string[]): Promise<string[]> {
  if (entities.length === 0) return [];
  
  const matchedFiles: { path: string, relevance: number }[] = [];
  
  // Build regex pattern to search for these entities
  // We want to match:
  // 1. Function declarations: function entity( or function entity (
  // 2. Class declarations: class entity{ or class entity {
  // 3. Variable declarations: const entity = or let entity = or var entity =
  // 4. Methods: entity() or entity ()
  // Adjust as needed for different languages
  const patterns = entities.map(entity => [
    `function\\s+${entity}\\s*\\(`,
    `class\\s+${entity}\\s*{`,
    `const\\s+${entity}\\s*=`,
    `let\\s+${entity}\\s*=`,
    `var\\s+${entity}\\s*=`,
    `${entity}\\s*\\(`,
    `def\\s+${entity}\\s*\\(`,  // Python
    `${entity}\\s*:`, // TypeScript type declarations
    // Add more patterns as needed
  ]).flat();
  
  const fileExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs'];
  
  await walkDir(basePath, (filePath) => {
    // Skip irrelevant files
    if (!fileExtensions.includes(path.extname(filePath))) {
      return;
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      let relevance = 0;
      
      // Check if file contains the entities
      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        
        // Direct name matches (higher relevance)
        if (path.basename(filePath, path.extname(filePath)).toLowerCase() === entity.toLowerCase()) {
          relevance += 5;
        }
        
        // Check for entity patterns in content
        for (const pattern of patterns) {
          if (new RegExp(pattern).test(content)) {
            relevance += 2;
            break; // Only count once per entity
          }
        }
        
        // Check for simple mentions of the entity name
        if (content.includes(entity)) {
          relevance += 1;
        }
      }
      
      if (relevance > 0) {
        matchedFiles.push({
          path: path.relative(basePath, filePath),
          relevance
        });
      }
    } catch (error) {
      // Skip files with read errors
    }
  });
  
  if (matchedFiles.length === 0) {
    return [];
  }
  
  // Sort by relevance and return the most relevant files (up to 5)
  return matchedFiles
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5)
    .map(match => match.path);
} 