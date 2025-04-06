import { NextRequest, NextResponse } from 'next/server';
import { getTicket } from '@/lib/virtual-ticket';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketId = params.id;
    if (!ticketId) {
      return NextResponse.json(
        { error: 'Missing ticket ID' }, 
        { status: 400 }
      );
    }

    const ticket = await getTicket(ticketId);
    if (!ticket) {
      return NextResponse.json(
        { error: 'Ticket not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(ticket);
  } catch (error: any) {
    console.error(`Error fetching ticket ${params.id}:`, error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch ticket' },
      { status: 500 }
    );
  }
} 