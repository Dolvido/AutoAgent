"use server";

import { NextRequest, NextResponse } from 'next/server';
import { 
  createTicketFromIssue, 
  getAllTickets, 
  getTicket, 
  updateTicketWithModification,
  completeTicket,
  rejectTicket,
  VirtualTicket
} from '@/lib/virtual-ticket';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'child_process';

// GET /api/virtual-ticket - Get all tickets
export async function GET(request: NextRequest) {
  try {
    // Check if there's a ticket ID in the query
    const url = new URL(request.url);
    const ticketId = url.searchParams.get('id');

    if (ticketId) {
      // Get a specific ticket
      const ticket = await getTicket(ticketId);
      
      if (!ticket) {
        return NextResponse.json(
          { error: 'Ticket not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(ticket);
    } else {
      // Get all tickets
      const tickets = await getAllTickets();
      return NextResponse.json(tickets);
    }
  } catch (error: any) {
    console.error('Error fetching tickets:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch tickets' },
      { status: 500 }
    );
  }
}

// POST /api/virtual-ticket - Create a ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issue, filePath, code, language, customFilename } = body;

    // Validate required fields
    if (!issue) {
      return NextResponse.json(
        { error: 'Missing required field: issue' },
        { status: 400 }
      );
    }

    // Handle the file path directly if it's a custom filename
    let actualFilePath = filePath || 'unknown';
    
    // If this is not a custom filename and code is provided, create a temporary file
    if (!customFilename && code && filePath !== 'unknown') {
      try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }
        
        // Save the code to a temporary file
        const tempFilePath = path.join(tempDir, filePath);
        fs.writeFileSync(tempFilePath, code);
        actualFilePath = tempFilePath;
        
        console.log(`Saved code to temporary file: ${tempFilePath}`);
      } catch (error) {
        console.error('Error saving code to temp file:', error);
        // Continue with original filePath if there's an error
      }
    }

    // Create ticket with simplified approach
    const ticket = await createTicketFromIssue(
      issue,
      actualFilePath,
      {},
      // Only pass basePath if not using custom filename
      customFilename ? undefined : process.cwd()
    );

    // Verify Git repository exists before attempting operations
    const isGitRepo = checkGitRepo(process.cwd());
    
    if (isGitRepo && ticket.severity === 'high') {
      // For high severity issues, create a feature branch automatically
      try {
        const branchName = createFeatureBranch(ticket, process.cwd());
        ticket.gitBranch = branchName;
        
        console.log(`Created Git branch "${branchName}" for ticket ${ticket.id}`);
      } catch (gitError: any) {
        console.error('Error creating Git branch:', gitError);
        // Continue even if Git operations fail - the ticket itself is still valid
      }
    }

    return NextResponse.json(ticket);
  } catch (error: any) {
    console.error('Error creating ticket:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create ticket' },
      { status: 500 }
    );
  }
}

// PATCH /api/virtual-ticket - Update a ticket
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, action, data } = body;
    
    // Validate required fields
    if (!ticketId || !action) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, action' },
        { status: 400 }
      );
    }
    
    let result = null;
    
    switch (action) {
      case 'modify':
        // Update with code modification
        if (!data || !data.modificationResult) {
          return NextResponse.json(
            { error: 'Missing modification result data' },
            { status: 400 }
          );
        }
        result = await updateTicketWithModification(ticketId, data.modificationResult);
        break;
        
      case 'complete':
        // Complete with commit info
        if (!data || !data.commitId || !data.commitMessage) {
          return NextResponse.json(
            { error: 'Missing commit data' },
            { status: 400 }
          );
        }
        result = await completeTicket(ticketId, data.commitId, data.commitMessage);
        break;
        
      case 'reject':
        // Reject the ticket
        result = await rejectTicket(ticketId);
        break;
        
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
    
    if (!result) {
      return NextResponse.json(
        { error: 'Ticket not found or update failed' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API error in virtual-ticket PATCH route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

/**
 * Create a feature branch for a ticket
 */
function createFeatureBranch(ticket: VirtualTicket, workingDir: string): string {
  try {
    // Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: workingDir,
      encoding: 'utf-8'
    }).trim();
    
    // Create a sanitized branch name
    const ticketId = ticket.id.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const titleSlug = ticket.title
      .toLowerCase()
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 30); // Keep branch name reasonably short
    
    const branchName = `fix/${ticketId}-${titleSlug}`;
    
    // Check if branch already exists
    const branches = execSync('git branch', {
      cwd: workingDir,
      encoding: 'utf-8'
    });
    
    if (branches.includes(branchName)) {
      console.log(`Branch ${branchName} already exists, using it`);
      return branchName;
    }
    
    // Create and checkout new branch
    execSync(`git checkout -b ${branchName}`, {
      cwd: workingDir
    });
    
    console.log(`Created and checked out branch: ${branchName}`);
    return branchName;
  } catch (error: any) {
    console.error('Error creating feature branch:', error);
    throw new Error(`Failed to create Git branch: ${error.message}`);
  }
}

/**
 * Check if directory is a Git repository
 */
function checkGitRepo(dir: string): boolean {
  try {
    const gitDir = path.join(dir, '.git');
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  } catch (error) {
    return false;
  }
} 