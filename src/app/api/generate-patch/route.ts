import { NextRequest, NextResponse } from 'next/server';
import { getTicket, updateTicket } from '@/lib/virtual-ticket';
import { createModificationPlan, executeModificationPlan } from '@/lib/llm/code-modifier-agent';
import { findRelevantFiles } from '@/lib/code-rag';
import fs from 'node:fs';
import path from 'node:path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, workingDir } = body;

    // Validate required fields
    if (!ticketId) {
      return NextResponse.json(
        { error: 'Missing required ticketId' },
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

    // Define working directory
    const baseDir = workingDir || ticket.basePath || process.cwd();
    
    // Check if affected files need to be discovered
    let affectedFiles = ticket.affectedFiles;
    let filesUpdated = false;
    
    if (!affectedFiles || 
        affectedFiles.length === 0 || 
        (affectedFiles.length === 1 && affectedFiles[0] === 'unknown')) {
      console.log(`No specific affected files found for ticket ${ticketId}. Running file discovery...`);
      
      // Try to find relevant files using code-rag
      try {
        const discoveredFiles = await findRelevantFiles(
          {
            title: ticket.title,
            description: ticket.description
          },
          baseDir
        );
        
        if (discoveredFiles.length > 0 && 
            !(discoveredFiles.length === 1 && discoveredFiles[0] === 'unknown')) {
          console.log(`Found ${discoveredFiles.length} relevant files: ${discoveredFiles.join(', ')}`);
          
          // Update affected files with discovered files
          affectedFiles = discoveredFiles;
          filesUpdated = true;
          
          // Update the ticket with the new affected files
          const updatedTicket = {
            ...ticket,
            affectedFiles: discoveredFiles
          };
          
          await updateTicket(updatedTicket);
          console.log(`Updated ticket ${ticketId} with discovered files`);
        } else {
          console.log('No files discovered, continuing with original affected files');
        }
      } catch (discoveryError) {
        console.error('Error discovering affected files:', discoveryError);
        // Continue with original affected files
      }
    }

    // Create a modification plan
    const plan = await createModificationPlan(
      ticket.sourceIssue,
      affectedFiles
    );

    // Execute the plan to generate patch
    const patchResult = await executeModificationPlan(
      plan,
      ticketId,
      baseDir
    );
    
    return NextResponse.json({
      success: true,
      ticketId,
      filesUpdated,
      patchResult
    });
  } catch (error: any) {
    console.error("API error in generate-patch route:", error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate patch' },
      { status: 500 }
    );
  }
} 