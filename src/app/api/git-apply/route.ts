import { NextRequest, NextResponse } from 'next/server';
import { getTicket, completeTicket } from '@/lib/virtual-ticket';
import { applyFix, hasUncommittedChanges } from '@/lib/git-integration';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, workingDir } = body;
    
    // Validate required fields
    if (!ticketId) {
      return NextResponse.json(
        { error: 'Missing required field: ticketId' },
        { status: 400 }
      );
    }
    
    // Get the ticket
    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }
    
    // Check if the ticket has modified code
    if (!ticket.modifiedCode) {
      return NextResponse.json(
        { error: 'Ticket has no code modifications to apply' },
        { status: 400 }
      );
    }
    
    // Check if there are uncommitted changes
    const hasChanges = await hasUncommittedChanges({ workingDir });
    if (hasChanges) {
      return NextResponse.json(
        { error: 'There are uncommitted changes in the repository. Please commit or stash them before applying fixes.' },
        { status: 409 }
      );
    }
    
    // Apply the fix
    const gitOptions = workingDir ? { workingDir } : {};
    const result = await applyFix(ticket, gitOptions);
    
    // Update the ticket with commit info
    const updatedTicket = await completeTicket(
      ticketId, 
      result.commitId, 
      result.commitMessage
    );
    
    return NextResponse.json({
      ticket: updatedTicket,
      git: {
        commitId: result.commitId,
        commitMessage: result.commitMessage,
        branchName: result.branchName
      }
    });
  } catch (error: any) {
    console.error('API error in git-apply route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply git fix' },
      { status: 500 }
    );
  }
} 