import {
  getFeedbackStatistics,
  // Import necessary DB functions for prompts and metrics
  savePromptTemplate,
  getAllPromptTemplates,
  getActivePromptTemplateFromDb,
  setActivePromptTemplateInDb,
  updatePromptUsageInDb,
  updatePromptAcceptRateInDb,
  recordPerformanceMetric,
  getPromptTemplateById // Potentially needed for fallback
} from './db/database';
import { runMetaAgentAnalysis, getOptimizedExamples } from './llm/meta-agent';
import { initVectorStore, addToVectorStore, findSimilarCode } from './db/vector-store';
// Removed fs and path imports as JSON files are no longer used directly for state
import { v4 as uuidv4 } from 'uuid';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { Ollama } from '@langchain/community/llms/ollama';
import { PromptTemplate, defaultPromptTemplate } from './default-prompt-template';
import { Document } from '@langchain/core/documents';

// Removed constants for JSON files
// const LEARNING_LOOP_DIR = ...
// const PROMPTS_HISTORY_FILE = ...
// const PERFORMANCE_METRICS_FILE = ...

// Removed PerformanceMetric interface

/**
 * Initialize the learning loop system
 */
export async function initLearningLoop() {
  try {
    console.log('Initializing learning loop system...');
    
    // Removed directory creation for JSON files
    
    // Check if any prompt templates exist in the DB
    const existingPrompts = await getAllPromptTemplates();
    if (existingPrompts.length === 0) {
      // If not, save the default prompt template as active
      console.log('No prompt templates found in DB, initializing with default.');
      await savePromptTemplate({
        ...defaultPromptTemplate,
        isActive: true // Ensure the first one is active
      });
    }
    
    // Removed initialization for performance metrics file
    
    // Initialize vector store for similarity search
    await initVectorStore();
    
    console.log('Learning loop system initialized.');
    return true;
  } catch (error) {
    console.error('Error initializing learning loop:', error);
    throw error;
  }
}

/**
 * Get the current active prompt template from DB
 */
export async function getActivePromptTemplate(): Promise<PromptTemplate> {
  try {
    // Fetch the active prompt from the database
    const activePrompt = await getActivePromptTemplateFromDb();
    
    if (activePrompt) {
      return activePrompt;
    }
    
    // Fallback: If no active prompt found (shouldn't happen after init),
    // try getting the latest version or return default.
    console.warn('No active prompt found in DB. Falling back.');
    const allPrompts = await getAllPromptTemplates(); // Assumes sorted by version ASC
    if (allPrompts.length > 0) {
      console.warn('Using latest prompt version as fallback.');
      return allPrompts[allPrompts.length - 1];
    }
    
    // Absolute fallback to default template
    console.warn('Using default prompt template as absolute fallback.');
    return defaultPromptTemplate;

  } catch (error) {
    console.error('Error getting active prompt template from DB:', error);
    // Return the default prompt if there's an error during fetch
    return defaultPromptTemplate;
  }
}

/**
 * Record a prompt usage in DB
 */
export async function recordPromptUsage(promptId: string) {
  try {
    // Call the database function directly
    const success = await updatePromptUsageInDb(promptId);
    if (!success) {
      console.error(`Failed to update usage count for prompt ${promptId} in DB.`);
    }
    return success;
  } catch (error) {
    console.error('Error recording prompt usage in DB:', error);
    return false;
  }
}

/**
 * Update prompt performance based on feedback in DB
 */
export async function updatePromptPerformance(
  promptId: string,
  feedbackType: 'accept' | 'reject' | 'ignore'
) {
  let dbSuccess = true;
  try {
    // 1. Update Prompt Template Accept Rate (using EMA)
    const prompt = await getPromptTemplateById(promptId);
    if (prompt) {
      const oldRate = prompt.acceptRate;
      const alpha = 0.1; // Weight for new feedback
      
      let newRate = oldRate;
      if (feedbackType === 'accept') {
        newRate = oldRate * (1 - alpha) + 1 * alpha;
      } else if (feedbackType === 'reject') {
        newRate = oldRate * (1 - alpha);
      }
      // Ignore feedback doesn't change the rate
      
      const rateUpdateSuccess = await updatePromptAcceptRateInDb(promptId, newRate);
      if (!rateUpdateSuccess) {
        console.error(`Failed to update accept rate for prompt ${promptId} in DB.`);
        dbSuccess = false;
      }
    } else {
      console.warn(`Prompt ${promptId} not found for performance update.`);
      dbSuccess = false; // Consider this a failure?
    }
    
    // 2. Record the performance metric for the day
    const today = new Date().toISOString().split('T')[0];
    const metricRecordSuccess = await recordPerformanceMetric(today, feedbackType, promptId);
    if (!metricRecordSuccess) {
      console.error(`Failed to record performance metric for date ${today}, prompt ${promptId}.`);
      dbSuccess = false;
    }
    
    return dbSuccess;
  } catch (error) {
    console.error('Error updating prompt performance in DB:', error);
    return false;
  }
}

// Removed updatePerformanceMetrics function (handled by recordPerformanceMetric)

/**
 * Record examples in vector storage for future reference
 */
export async function recordExampleInVectorStore(
  code: string,
  critique: any,
  feedbackType: 'accept' | 'reject' | 'ignore' 
) {
  try {
    // Only store accepted examples as they're more valuable for learning
    if (feedbackType !== 'accept') {
      return true;
    }
    
    const codeSnippet = code.substring(0, 1000); 
    const language = "typescript"; // Assume TS for now
    const critiqueId = critique?.id || `critique-${uuidv4()}`; 
    
    await addToVectorStore(
      codeSnippet,
      critiqueId,
      language,
      critique 
    );
    
    return true;
  } catch (error) {
    console.error('Error recording example in vector store:', error);
    return false; // Keep return type consistent
  }
}

/**
 * Find similar code examples from the vector store
 */
export async function findSimilarExamples(code: string, limit: number = 3) {
  try {
    return await findSimilarCode(code, limit);
  } catch (error) {
    console.error('Error finding similar examples:', error);
    return [];
  }
}

/**
 * Run the learning loop to adapt and improve the system
 */
export async function runLearningLoop() {
  try {
    console.log('Running learning loop...');
    
    const stats = await getFeedbackStatistics(); 
    if (!stats) {
      console.log('No feedback statistics available to run learning loop.');
      return false;
    }
    
    try {
      const analysis = await runMetaAgentAnalysis(); 
      if (!analysis || !analysis.recommendations || analysis.recommendations.length === 0) {
        console.log('No actionable recommendations from meta-agent. Skipping prompt update.');
      } else {
        const newTemplateText = await generateNewPromptTemplate(analysis);
        const templates = await getAllPromptTemplates();
        const latestVersion = templates.reduce((max, t) => Math.max(max, t.version), 0);
        
        const newPrompt: PromptTemplate = {
          id: uuidv4(),
          name: `Optimized Template v${latestVersion + 1}`,
          description: `Prompt template optimized by meta-agent analysis (Round ${latestVersion + 1})`,
          template: newTemplateText,
          acceptRate: 0.5, 
          useCount: 0,
          createdAt: new Date().toISOString(),
          isActive: false, 
          version: latestVersion + 1
        };

        const saveSuccess = await savePromptTemplate(newPrompt);
        if (!saveSuccess) {
          console.error('Failed to save new prompt template to DB during learning loop.');
        } else {
          console.log(`Saved new prompt template v${latestVersion + 1} (ID: ${newPrompt.id})`);
          
          // *** Enhanced Activation Logic ***
          const currentActivePrompt = await getActivePromptTemplate(); // Fetch current active
          const MIN_USE_COUNT_FOR_REPLACEMENT = 20;
          const MIN_ACCEPT_RATE_FOR_REPLACEMENT = 0.4;

          let shouldActivateNewPrompt = false;
          if (!currentActivePrompt) {
            // Should not happen if init works, but handle defensively
            console.warn("No current active prompt found, activating the new one by default.");
            shouldActivateNewPrompt = true;
          } else if (currentActivePrompt.useCount >= MIN_USE_COUNT_FOR_REPLACEMENT && 
                     currentActivePrompt.acceptRate < MIN_ACCEPT_RATE_FOR_REPLACEMENT) {
            // Activate if current prompt has enough usage and is performing poorly
            console.log(`Current prompt ${currentActivePrompt.id} performing poorly (Rate: ${currentActivePrompt.acceptRate.toFixed(2)}, Uses: ${currentActivePrompt.useCount}). Activating new prompt ${newPrompt.id}.`);
            shouldActivateNewPrompt = true;
          } else {
            // Keep current prompt active
            console.log(`Current prompt ${currentActivePrompt.id} performance is adequate (Rate: ${currentActivePrompt.acceptRate.toFixed(2)}, Uses: ${currentActivePrompt.useCount}). New prompt ${newPrompt.id} saved but not activated.`);
          }

          if (shouldActivateNewPrompt) {
            const activateSuccess = await setActivePromptTemplateInDb(newPrompt.id);
            if (!activateSuccess) {
              console.error(`Failed to activate new prompt template ${newPrompt.id} in DB.`);
            } else {
              console.log(`Successfully activated new optimized prompt template v${latestVersion + 1} (ID: ${newPrompt.id})`);
            }
          } 
          // *** End of Enhanced Activation Logic ***
        }
      }
    } catch (promptUpdateError) {
      console.error('Error occurred during prompt update/activation phase of learning loop:', promptUpdateError);
    }

    console.log('Learning loop cycle finished.');
    return true; 

  } catch (error) {
    console.error('Fatal error running learning loop:', error);
    return false; 
  }
}

/**
 * Generate a new prompt template based on meta-agent analysis
 */
async function generateNewPromptTemplate(analysis: any): Promise<string> {
  try {
    // Get the current *active* template from DB to use as base
    const currentTemplate = await getActivePromptTemplate(); // Uses the updated DB function
    
    const ollama = new Ollama({
      baseUrl: 'http://localhost:11434',
      model: 'codellama:latest',
      temperature: 0.2,
    });
    
    const prompt = `You are an expert AI prompt engineer. Your task is to optimize the following prompt template based on user feedback and meta-analysis.

CURRENT TEMPLATE:
${currentTemplate.template}

ANALYSIS AND RECOMMENDATIONS:
${JSON.stringify(analysis, null, 2)}

Please create an improved version of this prompt template. The new template should:
1. Maintain the same structure with placeholders like {{overview}} and {{sample_files}}
2. Address the issues identified in the analysis
3. Leverage the successful patterns identified
4. Be optimized for generating specific, actionable code critique

Return ONLY the new prompt template text without any explanations.`;
    
    const result = await ollama.call(prompt);
    return result.trim();
  } catch (error) {
    console.error('Error generating new prompt template:', error);
    // Fall back to the current active template text
    const currentTemplate = await getActivePromptTemplate();
    return currentTemplate.template;
  }
}

/**
 * Schedule the learning loop to run periodically
 */
export function scheduleLearningLoop(intervalHours = 24) {
  console.log(`Scheduling learning loop to run every ${intervalHours} hours`);
  
  // Initial run after a short delay
  setTimeout(() => {
    runLearningLoop().catch(err => console.error("Error during initial scheduled learning loop run:", err));
  }, 5 * 60 * 1000);
  
  // Periodic run
  setInterval(() => {
    runLearningLoop().catch(err => console.error("Error during periodic scheduled learning loop run:", err));
  }, intervalHours * 60 * 60 * 1000);
} 