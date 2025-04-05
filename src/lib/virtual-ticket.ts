import { v4 as uuidv4 } from 'uuid';
import type { CritiqueResult } from '@/components/CritiqueResults';
import type { CritiqueIssue } from '@/components/CritiqueCard';
import fs from 'fs';
import path from 'path';

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
  
  // Check if the storage directory is writable
  console.log(`Checking storage directory: ${opts.storageDir}`);
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
  
  // Create the ticket object
  const ticket: VirtualTicket = {
    id: `VT-${uuidv4().slice(0, 8)}`,
    title: `Fix: ${issue.title}`,
    description: issue.description,
    created: new Date().toISOString(),
    status: 'open',
    sourceIssue: issue,
    affectedFiles: [filePath],
    basePath
  };
  
  console.log(`Ticket created with ID: ${ticket.id}`);
  
  // Save the ticket
  console.log(`Saving ticket to disk...`);
  await saveTicket(ticket, opts);
  console.log(`Ticket ${ticket.id} saved successfully`);
  
  return ticket;
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