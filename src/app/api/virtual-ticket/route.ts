import { NextRequest, NextResponse } from 'next/server';
import { 
  createTicketFromIssue, 
  getAllTickets, 
  getTicket, 
  updateTicketWithModification,
  completeTicket,
  rejectTicket
} from '@/lib/virtual-ticket';

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
    console.error('API error in virtual-ticket GET route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

// POST /api/virtual-ticket - Create a ticket
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { issue, filePath, basePath } = body;
    
    // Validate required fields
    if (!issue || !filePath) {
      return NextResponse.json(
        { error: 'Missing required fields: issue, filePath' },
        { status: 400 }
      );
    }
    
    // Create the ticket
    const ticket = await createTicketFromIssue(issue, filePath, {}, basePath);
    
    return NextResponse.json(ticket);
  } catch (error: any) {
    console.error('API error in virtual-ticket POST route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
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