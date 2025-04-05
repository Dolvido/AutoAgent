import * as VirtualTicket from './virtual-ticket';
import { modifyCode } from './llm/code-modifier';
import * as GitIntegration from './git-integration';
import * as MetaAgent from './llm/meta-agent';
import * as VectorStore from './db/vector-store';
import { initializeDatabase, saveCritique, saveFeedback } from './db/database';
import { CritiqueResult } from '@/components/CritiqueResults';
import { CritiqueIssue } from '@/components/CritiqueCard';
import { v4 as uuidv4 } from 'uuid';

interface CodeInput {
  code: string;
  language: string;
  filepath?: string;
}

interface FeedbackResponse {
  accepted: boolean;
  ticketCreated?: boolean;
  fixesApplied?: boolean;
  commitMade?: boolean;
}

/**
 * AgentOrchestrator - Manages the flow of data between different agents
 * according to the architectural diagram, implementing the full feedback loop
 */
export class AgentOrchestrator {
  constructor() {
    // Initialize components when needed rather than storing instances
  }

  /**
   * Process a code input through the entire agent workflow
   */
  async processCodeInput(input: CodeInput) {
    try {
      // Ensure database and vector store are initialized
      await initializeDatabase();
      await VectorStore.initVectorStore();
      
      // Step 1: Retrieve similar context from vector store
      const similarContext = await VectorStore.findSimilarCode(input.code);
      
      // Step 2: Generate critique
      // In a real implementation, this would call a LLM service
      // For now, we'll create a mock critique
      const critique: CritiqueResult = {
        id: uuidv4(),
        summary: `Analysis of ${input.filepath || 'code snippet'}`,
        issues: [
          {
            id: uuidv4(),
            title: 'Example Code Issue',
            description: 'This is a placeholder for a real code issue that would be detected',
            fixSuggestion: 'Example fix suggestion would be provided here',
            severity: 'medium'
          }
        ],
        language: input.language,
        timestamp: new Date().toISOString()
      };

      // Save critique to database
      await saveCritique(critique, input.code);
      
      // Add to vector store for future retrieval
      await VectorStore.addToVectorStore(input.code, critique.id, input.language);

      // Step 3: Return the critique to the user interface
      return {
        critique,
        submitFeedback: (feedback: FeedbackResponse) => this.processFeedback(input, critique, feedback)
      };
    } catch (error) {
      console.error('Error processing code input:', error);
      throw error;
    }
  }

  /**
   * Process user feedback and trigger the appropriate agent actions
   */
  private async processFeedback(input: CodeInput, critique: CritiqueResult, feedback: FeedbackResponse) {
    try {
      // Log feedback in the database for each issue
      for (const issue of critique.issues) {
        await saveFeedback(
          issue.id, 
          feedback.accepted ? 'accept' : 'reject'
        );
      }

      // If user accepted the critique, trigger the next steps in the workflow
      if (feedback.accepted) {
        let tickets: VirtualTicket.VirtualTicket[] = [];
        let modificationResults = null;
        let commitResults = null;

        // Create tickets for tracking issues
        if (feedback.ticketCreated) {
          tickets = await Promise.all(critique.issues.map(issue => 
            VirtualTicket.createTicketFromIssue(issue, input.filepath || 'input.code')
          ));
        }

        // Apply code modifications if requested
        if (feedback.fixesApplied && input.filepath) {
          // Process each issue with the modifier agent
          const modResults = await Promise.all(critique.issues.map(issue => 
            modifyCode(input.code, input.language, issue)
          ));
          
          modificationResults = modResults;
          
          // Update tickets with modification results
          if (feedback.ticketCreated && tickets.length > 0) {
            await Promise.all(tickets.map((ticket, index) => 
              VirtualTicket.updateTicketWithModification(ticket.id, modResults[index])
            ));
          }
        }

        // Commit changes if requested and modifications were made
        if (feedback.commitMade && modificationResults && input.filepath) {
          const firstTicket = tickets.length > 0 ? tickets[0] : null;
          
          if (firstTicket) {
            try {
              // Apply the modification to the file
              await GitIntegration.applyCodeModification({
                affectedFiles: [input.filepath],
                modifiedCode: {
                  modifiedCode: modificationResults[0].modifiedCode
                }
              } as VirtualTicket.VirtualTicket, {});
              
              // Commit the changes
              commitResults = await GitIntegration.commitChanges({
                id: firstTicket.id,
                title: firstTicket.title
              } as VirtualTicket.VirtualTicket, {});
              
              // Update the ticket with commit info
              await VirtualTicket.completeTicket(
                firstTicket.id,
                commitResults.commitId,
                commitResults.commitMessage
              );
            } catch (error) {
              console.error('Error committing changes:', error);
            }
          }
        }

        return {
          tickets,
          modificationResults,
          commitResults
        };
      }

      // Trigger the meta-agent to learn from this feedback
      // This runs asynchronously and doesn't block the response
      MetaAgent.runMetaAgentAnalysis();

      return { acknowledged: true };
    } catch (error) {
      console.error('Error processing feedback:', error);
      throw error;
    }
  }

  /**
   * Run the meta-agent's tuning process to improve prompts and strategies
   * This can be triggered periodically or manually
   */
  async runMetaAgentTuning() {
    try {
      // Run the meta-agent analysis process
      const analysisResults = await MetaAgent.runMetaAgentAnalysis();
      
      // Schedule the meta-agent to run periodically
      MetaAgent.scheduleMetaAgent(24); // Run every 24 hours
      
      return analysisResults;
    } catch (error) {
      console.error('Error running meta-agent tuning:', error);
      throw error;
    }
  }
} 