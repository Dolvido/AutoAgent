import { NextRequest, NextResponse } from 'next/server';
import { getTicket, completeTicket } from '@/lib/virtual-ticket';
import { applyGitPatch } from '@/lib/llm/code-modifier-agent';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ticketId, workingDir, commitMessage } = body;

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

    // Check if ticket has modified code
    if (!ticket.modifiedCode || !ticket.modifiedCode.modifiedCode) {
      return NextResponse.json(
        { error: 'Ticket has no modified code to apply' },
        { status: 400 }
      );
    }

    // Determine working directory
    const workDir = workingDir || ticket.basePath || process.cwd();

    // Apply the patch if it exists
    if (ticket.modifiedCode) {
      try {
        // Create a temporary patch file based on modifiedCode changes
        const patchContent = createPatchFromChanges(ticket);
        
        // Apply the patch
        const patchApplied = await applyGitPatch(patchContent, workDir);
        
        if (!patchApplied) {
          return NextResponse.json(
            { error: 'Failed to apply patch' },
            { status: 500 }
          );
        }
        
        // Commit the changes if requested
        let commitId = null;
        if (patchApplied) {
          try {
            // Stage the changes
            const affectedFilePaths = ticket.affectedFiles.join(' ');
            execSync(`git add ${affectedFilePaths}`, { cwd: workDir });
            
            // Create commit message
            const customCommitMessage = commitMessage || 
              `Fix: ${ticket.title} (Ticket: ${ticket.id})`;
            
            // Commit
            execSync(`git commit -m "${customCommitMessage}"`, { cwd: workDir });
            
            // Get the commit ID
            commitId = execSync('git rev-parse HEAD', { 
              cwd: workDir,
              encoding: 'utf-8'
            }).trim();
            
            // Update ticket with commit info
            const updatedTicket = await completeTicket(
              ticketId,
              commitId,
              customCommitMessage
            );
            
            return NextResponse.json({
              success: true,
              message: 'Changes applied and committed successfully',
              commitId,
              ticket: updatedTicket
            });
          } catch (commitError: any) {
            console.error('Error committing changes:', commitError);
            return NextResponse.json({
              success: true,
              warning: 'Changes applied but commit failed',
              error: commitError.message
            });
          }
        }
      } catch (error: any) {
        console.error('Error applying patch:', error);
        return NextResponse.json(
          { error: `Failed to apply patch: ${error.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Changes applied successfully'
    });
  } catch (error: any) {
    console.error("API error in git-apply route:", error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply changes' },
      { status: 500 }
    );
  }
}

/**
 * Create a Git patch from code modification changes
 */
function createPatchFromChanges(ticket: any): string {
  if (!ticket.modifiedCode || !ticket.modifiedCode.changes || ticket.modifiedCode.changes.length === 0) {
    throw new Error('No changes found in ticket');
  }

  let patch = '';
  
  // Build a single patch for all affected files
  for (const file of ticket.affectedFiles) {
    // Create diff header
    patch += `diff --git a/${file} b/${file}\n`;
    patch += `index 0000000..0000000 100644\n`;
    patch += `--- a/${file}\n`;
    patch += `+++ b/${file}\n`;
    
    // Add hunks for each change
    for (const change of ticket.modifiedCode.changes) {
      const contextLines = 3; // Standard number of context lines
      
      // Calculate line numbers for the hunk header
      const startLine = Math.max(1, change.lineStart - contextLines);
      const lineCount = change.lineEnd - change.lineStart + 1;
      const contextLineCount = lineCount + (2 * contextLines);
      
      // Add hunk header
      patch += `@@ -${startLine},${contextLineCount} +${startLine},${contextLineCount} @@\n`;
      
      // Add context lines before change
      for (let i = startLine; i < change.lineStart; i++) {
        patch += ` Line ${i}\n`; // Placeholder for context line
      }
      
      // Add removed lines with - prefix
      const originalLines = change.original.split('\n');
      for (const line of originalLines) {
        patch += `-${line}\n`;
      }
      
      // Add added lines with + prefix
      const replacementLines = change.replacement.split('\n');
      for (const line of replacementLines) {
        patch += `+${line}\n`;
      }
      
      // Add context lines after change
      for (let i = change.lineEnd + 1; i <= change.lineEnd + contextLines; i++) {
        patch += ` Line ${i}\n`; // Placeholder for context line
      }
    }
  }
  
  return patch;
} 