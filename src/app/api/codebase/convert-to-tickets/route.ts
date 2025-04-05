import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createTicketFromIssue } from '@/lib/virtual-ticket';

// Define Issue interface to match CritiqueIssue
interface Issue {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  affectedFiles: string[];
  fixSuggestion: string;
}

/**
 * Validates an issue object and ensures it has all required fields
 */
function validateIssue(issue: any): Issue {
  if (!issue || typeof issue !== 'object') {
    throw new Error('Invalid issue format: Issue must be an object');
  }

  // Ensure the issue has all required fields
  const validatedIssue: Issue = {
    id: issue.id || uuidv4(),
    title: issue.title || 'Unnamed Issue',
    description: issue.description || 'No description provided',
    severity: validateSeverity(issue.severity),
    affectedFiles: validateAffectedFiles(issue.files || issue.affectedFiles),
    fixSuggestion: issue.fixSuggestion || issue.recommendation || 'No fix suggestion provided'
  };

  return validatedIssue;
}

/**
 * Validates and normalizes severity to one of the accepted values
 */
function validateSeverity(severity: any): "low" | "medium" | "high" {
  if (severity === "low" || severity === "medium" || severity === "high") {
    return severity;
  }
  
  // Convert string values to standard severity
  if (typeof severity === 'string') {
    const normalizedSeverity = severity.toLowerCase();
    if (normalizedSeverity.includes('high') || normalizedSeverity.includes('critical') || normalizedSeverity.includes('severe')) {
      return 'high';
    } else if (normalizedSeverity.includes('medium') || normalizedSeverity.includes('moderate')) {
      return 'medium';
    }
  }
  
  // Default to low severity
  return 'low';
}

/**
 * Validates affected files array
 */
function validateAffectedFiles(files?: any): string[] {
  if (!files) return ['unknown'];
  
  if (!Array.isArray(files)) {
    return [String(files)]; // Convert to string array if not already
  }
  
  // Filter invalid file values
  return files
    .filter(file => file && typeof file === 'string')
    .map(file => String(file));
}

export async function POST(request: NextRequest) {
  try {
    const analysisResults = await request.json();
    
    console.log("Convert to tickets - Received payload:", JSON.stringify(analysisResults, null, 2).substring(0, 500) + "...");
    
    if (!analysisResults || (!analysisResults.issues && !analysisResults.critique && !analysisResults.findings)) {
      console.log("Invalid analysis results - missing issues or findings");
      return NextResponse.json(
        { error: 'Invalid analysis results format: Missing issues or findings' },
        { status: 400 }
      );
    }
    
    // Extract the base path if provided
    const basePath = analysisResults.basePath;
    console.log("Base path:", basePath);
    
    // Extract issues from multiple possible locations in the payload
    const rawIssues = 
      analysisResults.issues || 
      analysisResults.critique?.issues || 
      analysisResults.findings || 
      [];
    
    console.log(`Found ${rawIssues.length} raw issues to process`);
    
    if (!Array.isArray(rawIssues) || rawIssues.length === 0) {
      console.log("No valid issues array found in the payload");
      return NextResponse.json(
        { error: 'No valid issues found in the payload' },
        { status: 400 }
      );
    }
    
    console.log(`Processing ${rawIssues.length} issues for ticket creation`);
    
    // Validate each issue and track created tickets
    const ticketIds: string[] = [];
    const errors: string[] = [];
    
    // Process each issue
    for (const rawIssue of rawIssues) {
      try {
        console.log(`Processing issue: ${rawIssue.title}`);
        
        // Validate the issue
        const validatedIssue = validateIssue(rawIssue);
        
        console.log(`Validated issue has ${validatedIssue.affectedFiles.length} affected files:`, validatedIssue.affectedFiles);
        
        // Handle ticket creation based on affected files
        if (validatedIssue.affectedFiles.length === 0) {
          console.log("Issue has no affected files, creating a single ticket with RAG-enhanced file detection");
          try {
            // Pass the full issue object to allow RAG-based file detection
            const ticket = await createTicketFromIssue(validatedIssue, 'unknown', {}, basePath);
            ticketIds.push(ticket.id);
            console.log(`Created ticket: ${ticket.id}`);
          } catch (ticketError: any) {
            console.error(`Error creating ticket:`, ticketError);
            errors.push(`Failed to create ticket: ${ticketError.message}`);
          }
        } else {
          for (const filePath of validatedIssue.affectedFiles) {
            console.log(`Creating ticket for file: ${filePath}`);
            try {
              // Pass the full issue object to allow RAG enhancement if needed
              const ticket = await createTicketFromIssue(validatedIssue, filePath, {}, basePath);
              ticketIds.push(ticket.id);
              console.log(`Created ticket: ${ticket.id}`);
            } catch (ticketError: any) {
              console.error(`Error creating ticket for file ${filePath}:`, ticketError);
              errors.push(`Failed to create ticket for ${filePath}: ${ticketError.message}`);
            }
          }
        }
      } catch (validationError: any) {
        console.error('Issue validation error:', validationError);
        errors.push(`Issue validation error: ${validationError.message}`);
      }
    }
    
    console.log(`Ticket creation complete. Created ${ticketIds.length} tickets with ${errors.length} errors`);
    
    // Return response with created tickets and any errors
    return NextResponse.json({
      success: ticketIds.length > 0,
      message: `Created ${ticketIds.length} tickets from analysis findings`,
      ticketIds: ticketIds,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error converting to tickets:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 