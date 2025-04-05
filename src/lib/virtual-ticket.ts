import { v4 as uuidv4 } from 'uuid';
import type { CritiqueResult } from '@/components/CritiqueResults';
import type { CritiqueIssue } from '@/components/CritiqueCard';
import fs from 'fs';
import path from 'path';
import { findRelevantFiles } from './code-rag';

// Use CritiqueIssue as Issue for consistency with existing code
type Issue = CritiqueIssue;

export interface VirtualTicket {
  id: string;
  title: string;
  description: string;
  created: string;
  status: 'open' | 'in_progress' | 'completed' | 'rejected';
  sourceIssue: Issue;
  affectedFiles: string[];
  basePath?: string;
  modifiedCode?: {
    id: string;
    originalCode: string;
    modifiedCode: string;
    changes: Array<{
      lineStart: number;
      lineEnd: number;
      original: string;
      replacement: string;
    }>;
  };
  commitId?: string;
  commitMessage?: string;
}

export interface TicketSystemOptions {
  storageDir?: string;
}

const DEFAULT_OPTIONS: TicketSystemOptions = {
  storageDir: './data/virtual-tickets'
};

/**
 * Checks if a path is writable
 */
function isPathWritable(directory: string): boolean {
  try {
    // Get absolute path
    const absPath = path.resolve(directory);
    console.log(`Checking if path is writable: ${absPath}`);

    // Check if directory exists
    if (fs.existsSync(absPath)) {
      // Try to write a temporary file
      const testFile = path.join(absPath, `._test_${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`Path ${absPath} is writable`);
      return true;
    } else {
      // Try to create the directory
      fs.mkdirSync(absPath, { recursive: true });
      const testFile = path.join(absPath, `._test_${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`Created directory ${absPath} and confirmed it is writable`);
      return true;
    }
  } catch (error: any) {
    console.error(`Path ${directory} is not writable:`, error);
    return false;
  }
}

/**
 * Validates affected files array with RAG enhancement
 */
async function validateAffectedFiles(
  files?: any,
  issue?: any,
  basePath?: string
): Promise<string[]> {
  console.log(`Validating affected files:`, files);
  
  // Case 1: If we have valid files array, use it
  if (files && Array.isArray(files) && files.length > 0) {
    const validFiles = files
      .filter(file => file && typeof file === 'string')
      .map(file => String(file));
      
    if (validFiles.length > 0) {
      console.log(`Using provided affected files: ${validFiles.join(', ')}`);
      return validFiles;
    }
  }
  
  // Case 2: If we have issue details and basePath, try to find relevant files
  if (issue && basePath && fs.existsSync(basePath)) {
    console.log(`No valid affected files provided. Using RAG to find relevant files for issue "${issue.title}"`);
    try {
      const relevantFiles = await findRelevantFiles(
        { 
          title: issue.title || '', 
          description: issue.description || '' 
        }, 
        basePath
      );
      
      if (relevantFiles && relevantFiles.length > 0) {
        console.log(`RAG found ${relevantFiles.length} relevant files: ${relevantFiles.join(', ')}`);
        return relevantFiles;
      }
    } catch (error) {
      console.error('Error finding relevant files with RAG:', error);
    }
  }
  
  // Case 3: Fallback to 'unknown' if nothing else worked
  console.log(`No affected files found. Using "unknown" as placeholder.`);
  return ['unknown'];
}

/**
 * Creates a virtual ticket from a critique issue
 */
export async function createTicketFromIssue(
  issue: Issue,
  filePath: string,
  options: TicketSystemOptions = {},
  basePath?: string
): Promise<VirtualTicket> {
  console.log(`Creating ticket for issue "${issue.title}" affecting file "${filePath}"`);
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Check storage directory is writable
  const isWritable = isPathWritable(opts.storageDir!);
  if (!isWritable) {
    console.error(`Storage directory ${opts.storageDir} is not writable. Trying alternate location.`);
    
    // Try process.cwd() + /data/virtual-tickets as fallback
    const alternatePath = path.join(process.cwd(), 'data', 'virtual-tickets');
    console.log(`Trying alternate path: ${alternatePath}`);
    
    const alternateWritable = isPathWritable(alternatePath);
    if (alternateWritable) {
      console.log(`Using alternate writable path: ${alternatePath}`);
      opts.storageDir = alternatePath;
    } else {
      throw new Error(`Cannot find a writable directory to store tickets. Please check permissions.`);
    }
  }
  
  // Determine issue type for specialized handling
  const issueType = determineIssueType(issue);
  console.log(`Determined issue type: ${issueType}`);
  
  // Special handling for different issue types
  let affectedFiles: string[];
  if (filePath === 'unknown') {
    if (basePath) {
      switch (issueType) {
        case 'analysis_error':
          // For analysis errors, try to focus on configuration files and logs
          const configFiles = await findConfigurationFiles(basePath);
          if (configFiles.length > 0) {
            affectedFiles = configFiles;
            console.log(`Found ${configFiles.length} potential configuration files:`, configFiles);
          } else {
            // Fall back to regular RAG if no config files found
            affectedFiles = await validateAffectedFiles(null, issue, basePath);
          }
          break;
          
        case 'security_issue':
          // For security issues, focus on API routes, authentication files, and input handlers
          const securityFiles = await findSecurityRelatedFiles(basePath, issue);
          if (securityFiles.length > 0) {
            affectedFiles = securityFiles;
            console.log(`Found ${securityFiles.length} security-related files:`, securityFiles);
          } else {
            affectedFiles = await validateAffectedFiles(null, issue, basePath);
          }
          break;
          
        case 'performance_issue':
          // For performance issues, focus on data processing files and query handlers
          const performanceFiles = await findPerformanceRelatedFiles(basePath, issue);
          if (performanceFiles.length > 0) {
            affectedFiles = performanceFiles;
            console.log(`Found ${performanceFiles.length} performance-related files:`, performanceFiles);
          } else {
            affectedFiles = await validateAffectedFiles(null, issue, basePath);
          }
          break;
          
        case 'configuration_issue':
          // For configuration issues, focus on config files
          const allConfigFiles = await findConfigurationFiles(basePath);
          if (allConfigFiles.length > 0) {
            affectedFiles = allConfigFiles;
            console.log(`Found ${allConfigFiles.length} configuration files:`, allConfigFiles);
          } else {
            affectedFiles = await validateAffectedFiles(null, issue, basePath);
          }
          break;
          
        default:
          // Standard RAG-based file detection for other issues
          affectedFiles = await validateAffectedFiles(null, issue, basePath);
      }
    } else {
      affectedFiles = ['unknown'];
    }
  } else {
    affectedFiles = [filePath];
  }
  
  // Create the ticket object
  const ticket: VirtualTicket = {
    id: `VT-${uuidv4().slice(0, 8)}`,
    title: `Fix: ${issue.title}`,
    description: issue.description,
    created: new Date().toISOString(),
    status: 'open',
    sourceIssue: issue,
    affectedFiles: affectedFiles,
    basePath
  };
  
  // Add helpful suggestions based on issue type
  ticket.description = enhanceTicketDescription(ticket.description, issueType);
  
  console.log(`Ticket created with ID: ${ticket.id} for files: ${affectedFiles.join(', ')}`);
  
  // Save the ticket
  console.log(`Saving ticket to disk...`);
  await saveTicket(ticket, opts);
  console.log(`Ticket ${ticket.id} saved successfully`);
  
  return ticket;
}

/**
 * Determine the type of issue for specialized handling
 */
function determineIssueType(issue: Issue): string {
  const title = issue.title.toLowerCase();
  const description = issue.description.toLowerCase();
  const combinedText = `${title} ${description}`;
  
  // Patterns for different issue types
  if (title.includes('analysis error') || description.includes('parser error') || description.includes('analyzer encountered an issue')) {
    return 'analysis_error';
  }
  
  if (combinedText.includes('security') || 
      combinedText.includes('vulnerability') || 
      combinedText.includes('injection') || 
      combinedText.includes('xss') || 
      combinedText.includes('csrf')) {
    return 'security_issue';
  }
  
  if (combinedText.includes('performance') || 
      combinedText.includes('slow') || 
      combinedText.includes('n+1') || 
      combinedText.includes('memory leak')) {
    return 'performance_issue';
  }
  
  if (combinedText.includes('configuration') || 
      combinedText.includes('config') || 
      combinedText.includes('setup') || 
      combinedText.includes('environment')) {
    return 'configuration_issue';
  }
  
  return 'general_issue';
}

/**
 * Enhance ticket description with helpful suggestions based on issue type
 */
function enhanceTicketDescription(description: string, issueType: string): string {
  let enhancedDescription = description;
  
  // Add suggestions based on issue type
  switch (issueType) {
    case 'analysis_error':
      enhancedDescription += '\n\n**Suggested Resolution Steps:**\n' +
        '1. Check the analysis configuration files for issues\n' +
        '2. Review log files for error messages\n' +
        '3. Verify the project structure is valid\n' +
        '4. Try running the analysis with debug logging enabled';
      break;
      
    case 'security_issue':
      enhancedDescription += '\n\n**Security Recommendations:**\n' +
        '1. Validate all user inputs and sanitize data\n' +
        '2. Implement proper authentication and authorization checks\n' +
        '3. Use parameterized queries for database operations\n' +
        '4. Apply the principle of least privilege\n' +
        '5. Consider security testing tools like OWASP ZAP';
      break;
      
    case 'performance_issue':
      enhancedDescription += '\n\n**Performance Optimization Tips:**\n' +
        '1. Check for database query optimizations\n' +
        '2. Implement caching where appropriate\n' +
        '3. Review algorithms for time complexity issues\n' +
        '4. Consider memory usage patterns and potential leaks\n' +
        '5. Use profiling tools to identify bottlenecks';
      break;
      
    case 'configuration_issue':
      enhancedDescription += '\n\n**Configuration Guidelines:**\n' +
        '1. Check for missing or incorrect configuration keys\n' +
        '2. Verify environment variables are properly set\n' +
        '3. Compare against recommended configurations\n' +
        '4. Consider using configuration validation tools';
      break;
  }
  
  return enhancedDescription;
}

/**
 * Find files that might be related to security vulnerabilities
 */
async function findSecurityRelatedFiles(basePath: string, issue: Issue): Promise<string[]> {
  const securityPatterns = [
    'api/**/*.js',
    'api/**/*.ts',
    'routes/**/*.js',
    'routes/**/*.ts',
    '**/auth/**/*.js',
    '**/auth/**/*.ts',
    '**/security/**/*.js',
    '**/security/**/*.ts',
    '**/middleware/**/*.js',
    '**/middleware/**/*.ts',
    '**/user/**/*.js',
    '**/user/**/*.ts',
    '**/*controller.js',
    '**/*controller.ts',
    '**/*route.js',
    '**/*route.ts'
  ];
  
  // If the issue description has specific keywords, prioritize certain files
  const description = issue.description.toLowerCase();
  if (description.includes('sql') || description.includes('database') || description.includes('injection')) {
    securityPatterns.unshift(
      '**/database/**/*.js',
      '**/database/**/*.ts',
      '**/db/**/*.js',
      '**/db/**/*.ts',
      '**/model/**/*.js',
      '**/model/**/*.ts'
    );
  }
  
  if (description.includes('authentication') || description.includes('login') || description.includes('password')) {
    securityPatterns.unshift(
      '**/login/**/*.js',
      '**/login/**/*.ts',
      '**/authentication/**/*.js',
      '**/authentication/**/*.ts'
    );
  }
  
  return findFilesMatchingPatterns(basePath, securityPatterns);
}

/**
 * Find files that might be related to performance issues
 */
async function findPerformanceRelatedFiles(basePath: string, issue: Issue): Promise<string[]> {
  const performancePatterns = [
    '**/database/**/*.js',
    '**/database/**/*.ts',
    '**/db/**/*.js',
    '**/db/**/*.ts',
    '**/api/**/*.js',
    '**/api/**/*.ts',
    '**/service/**/*.js',
    '**/service/**/*.ts',
    '**/handler/**/*.js',
    '**/handler/**/*.ts',
    '**/processor/**/*.js',
    '**/processor/**/*.ts',
    '**/*-worker.js',
    '**/*-worker.ts',
    '**/*Worker.js',
    '**/*Worker.ts'
  ];
  
  // If the issue description has specific keywords, prioritize certain files
  const description = issue.description.toLowerCase();
  if (description.includes('memory') || description.includes('leak')) {
    performancePatterns.unshift(
      '**/cache/**/*.js',
      '**/cache/**/*.ts',
      '**/memory/**/*.js',
      '**/memory/**/*.ts'
    );
  }
  
  if (description.includes('query') || description.includes('database') || description.includes('n+1')) {
    performancePatterns.unshift(
      '**/query/**/*.js',
      '**/query/**/*.ts',
      '**/repository/**/*.js',
      '**/repository/**/*.ts'
    );
  }
  
  return findFilesMatchingPatterns(basePath, performancePatterns);
}

/**
 * Find files matching a set of patterns
 */
async function findFilesMatchingPatterns(basePath: string, patterns: string[]): Promise<string[]> {
  try {
    const matchedFiles: string[] = [];
    
    for (const pattern of patterns) {
      // Simple glob pattern handling logic
      if (pattern.includes('*')) {
        let parts = pattern.split('**/');
        if (parts.length === 1) {
          // No directory wildcard, just file pattern
          parts = ['', parts[0]];
        }
        
        const baseDir = parts[0] || '';
        const filePattern = parts[parts.length - 1];
        
        const walkDir = (dir: string, currentPath: string = '') => {
          try {
            const fullDir = path.join(basePath, dir, currentPath);
            if (!fs.existsSync(fullDir)) return;
            
            const entries = fs.readdirSync(fullDir);
            
            for (const entry of entries) {
              const fullPath = path.join(fullDir, entry);
              const relativePath = path.join(dir, currentPath, entry);
              
              if (fs.statSync(fullPath).isDirectory()) {
                // Continue walking if pattern has ** (deep search)
                if (pattern.includes('**/')) {
                  walkDir(dir, path.join(currentPath, entry));
                }
              } else {
                // Check if file matches pattern
                if (pattern.includes('**/')) {
                  // For deep matches, check if the file matches the pattern after **/
                  if (filePattern.includes('*.')) {
                    const extension = filePattern.substring(filePattern.indexOf('*.') + 1);
                    if (entry.endsWith(extension)) {
                      matchedFiles.push(relativePath);
                    }
                  } else if (entry === filePattern) {
                    matchedFiles.push(relativePath);
                  }
                } else {
                  // Simple pattern matching
                  if (filePattern.startsWith('*.') && entry.endsWith(filePattern.substring(2))) {
                    matchedFiles.push(relativePath);
                  } else if (entry === filePattern) {
                    matchedFiles.push(relativePath);
                  }
                }
              }
            }
          } catch (error) {
            console.error(`Error walking directory ${dir}/${currentPath}:`, error);
          }
        };
        
        walkDir(baseDir);
      } else {
        // Direct file check
        const filePath = path.join(basePath, pattern);
        if (fs.existsSync(filePath)) {
          matchedFiles.push(pattern);
        }
      }
    }
    
    return [...new Set(matchedFiles)]; // Remove duplicates
  } catch (error) {
    console.error('Error finding files matching patterns:', error);
    return [];
  }
}

/**
 * Find configuration files that might be related to analysis tools
 */
async function findConfigurationFiles(basePath: string): Promise<string[]> {
  try {
    const configPatterns = [
      'package.json',
      'tsconfig.json',
      'eslintrc.*',
      '.eslintrc.*',
      'prettier.*',
      '.prettierrc.*',
      'babel.*',
      '.babelrc.*',
      'webpack.*',
      'jest.*',
      'next.config.*',
      'vite.config.*',
      'nodemon.*',
      'rollup.config.*',
      'lerna.*',
      'typedoc.*',
      'stylelint.*',
      '.env',
      'Dockerfile',
      'docker-compose.*',
      'config/*.js',
      'config/*.json',
      'logs/*.log'
    ];
    
    const configFiles: string[] = [];
    
    for (const pattern of configPatterns) {
      if (pattern.includes('*')) {
        // Handle glob patterns
        const dirPath = pattern.split('/')[0];
        const filePattern = pattern.split('/')[1];
        
        try {
          const dir = path.join(basePath, dirPath);
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              if (filePattern.startsWith('*.') && file.endsWith(filePattern.substring(1))) {
                configFiles.push(path.join(dirPath, file));
              } else if (filePattern.endsWith('.*') && file.startsWith(filePattern.substring(0, filePattern.length - 2))) {
                configFiles.push(path.join(dirPath, file));
              }
            }
          }
        } catch (error) {
          console.error(`Error looking for files in ${dirPath}:`, error);
        }
      } else {
        // Direct file check
        const filePath = path.join(basePath, pattern);
        if (fs.existsSync(filePath)) {
          configFiles.push(pattern);
        }
      }
    }
    
    return configFiles;
  } catch (error) {
    console.error('Error finding configuration files:', error);
    return [];
  }
}

/**
 * Updates a virtual ticket with code modification info
 */
export async function updateTicketWithModification(
  ticketId: string,
  modificationResult: any,
  options: TicketSystemOptions = {}
): Promise<VirtualTicket | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Load the ticket
  const ticket = await getTicket(ticketId, opts);
  if (!ticket) return null;
  
  // Update the ticket with modification info
  const updatedTicket: VirtualTicket = {
    ...ticket,
    status: 'in_progress',
    modifiedCode: {
      id: modificationResult.id,
      originalCode: modificationResult.originalCode,
      modifiedCode: modificationResult.modifiedCode,
      changes: modificationResult.changes || []
    }
  };
  
  // Save the updated ticket
  await saveTicket(updatedTicket, opts);
  
  return updatedTicket;
}

/**
 * Completes a ticket with Git commit information
 */
export async function completeTicket(
  ticketId: string,
  commitId: string,
  commitMessage: string,
  options: TicketSystemOptions = {}
): Promise<VirtualTicket | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Load the ticket
  const ticket = await getTicket(ticketId, opts);
  if (!ticket) return null;
  
  // Update the ticket with commit info
  const updatedTicket: VirtualTicket = {
    ...ticket,
    status: 'completed',
    commitId,
    commitMessage
  };
  
  // Save the updated ticket
  await saveTicket(updatedTicket, opts);
  
  return updatedTicket;
}

/**
 * Rejects a ticket
 */
export async function rejectTicket(
  ticketId: string,
  options: TicketSystemOptions = {}
): Promise<VirtualTicket | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Load the ticket
  const ticket = await getTicket(ticketId, opts);
  if (!ticket) return null;
  
  // Update the ticket status
  const updatedTicket: VirtualTicket = {
    ...ticket,
    status: 'rejected'
  };
  
  // Save the updated ticket
  await saveTicket(updatedTicket, opts);
  
  return updatedTicket;
}

/**
 * Gets all tickets
 */
export async function getAllTickets(
  options: TicketSystemOptions = {}
): Promise<VirtualTicket[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Ensure storage directory exists
  if (!fs.existsSync(opts.storageDir!)) {
    return [];
  }
  
  // Read all ticket files
  const files = fs.readdirSync(opts.storageDir!);
  const tickets: VirtualTicket[] = [];
  
  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(opts.storageDir!, file);
      const ticketJson = fs.readFileSync(filePath, 'utf-8');
      tickets.push(JSON.parse(ticketJson));
    }
  }
  
  // Sort by creation date (newest first)
  return tickets.sort((a, b) => {
    return new Date(b.created).getTime() - new Date(a.created).getTime();
  });
}

/**
 * Gets a specific ticket by ID
 */
export async function getTicket(
  ticketId: string,
  options: TicketSystemOptions = {}
): Promise<VirtualTicket | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const filePath = path.join(opts.storageDir!, `${ticketId}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  const ticketJson = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(ticketJson);
}

/**
 * Saves a ticket to disk
 */
async function saveTicket(
  ticket: VirtualTicket,
  options: TicketSystemOptions
): Promise<void> {
  const filePath = path.join(options.storageDir!, `${ticket.id}.json`);
  console.log(`Saving ticket to file: ${filePath}`);
  
  try {
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2));
    console.log(`Ticket saved successfully to ${filePath}`);
  } catch (error: any) {
    console.error(`Error writing ticket to ${filePath}:`, error);
    throw new Error(`Failed to write ticket: ${error.message}`);
  }
} 