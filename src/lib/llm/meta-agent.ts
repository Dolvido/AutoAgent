import { getFeedbackStatistics, saveNegativeConstraint } from '../db/database';
import { Ollama } from '@langchain/community/llms/ollama';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Directory for storing meta-agent data
const META_AGENT_DIR = path.join(process.cwd(), 'data', 'meta-agent');

// File to store optimized examples
const OPTIMIZED_EXAMPLES_FILE = path.join(META_AGENT_DIR, 'optimized-examples.json');

// Meta-agent prompt template
const META_AGENT_PROMPT = `You are an AI Meta-Agent analyzing feedback on code critiques.
Your goal is to identify patterns to improve future critiques.

Below is feedback data:
{{feedback_data}}

Your tasks:
1. Analyze overall performance, language/severity insights, trends.
2. Suggest 2-3 new example code snippets and critiques for few-shot learning.
3. Suggest improvements to our critique strategy.
4. ***Identify specific critique types, patterns, or suggestion styles that are frequently REJECTED by users. Describe why they are rejected and provide a brief example if possible.***

Please format your response as a JSON object ONLY with this exact structure:
{
  "analysis": {
    "overallPerformance": "...",
    "languageInsights": "...",
    "severityInsights": "...",
    "timeBasedTrends": "...",
    "mostSuccessfulCritiqueTypes": "...",
    "leastSuccessfulCritiqueTypes": "..."
  },
  "recommendations": [
    "Actionable recommendations..."
  ],
  "example_critiques": [
    {
      "code": "...",
      "critique": { ... }
    }
  ],
  "negative_constraints": [
    {
      "description": "Concise reason why this type of critique is often rejected (e.g., 'Nitpicky whitespace suggestions', 'Overly complex refactoring suggestions')",
      "patternExample": "Optional: Short example of the rejected pattern or keyword (e.g., 'Consider using Array.map', 'Trailing whitespace')"
    }
  ]
}
`;

// Interface for optimized examples
interface OptimizedExample {
  code: string;
  critique: {
    summary: string;
    issues: Array<{
      title: string;
      description: string;
      fixSuggestion: string;
      severity: string;
    }>;
  };
  score: number; // How well this example has performed
  createdAt: string;
  id: string;
}

// Initialize the meta-agent directory and storage
async function initializeMetaAgent() {
  try {
    // Create the directory if it doesn't exist
    if (!fs.existsSync(META_AGENT_DIR)) {
      fs.mkdirSync(META_AGENT_DIR, { recursive: true });
    }
    
    // Create the optimized examples file if it doesn't exist
    if (!fs.existsSync(OPTIMIZED_EXAMPLES_FILE)) {
      fs.writeFileSync(OPTIMIZED_EXAMPLES_FILE, JSON.stringify([], null, 2));
    }
    
    return true;
  } catch (error) {
    console.error('Error initializing meta-agent storage:', error);
    throw error;
  }
}

// Get optimized examples from storage
export async function getOptimizedExamples(limit = 3): Promise<OptimizedExample[]> {
  try {
    await initializeMetaAgent();
    
    // Read the optimized examples file
    const data = fs.readFileSync(OPTIMIZED_EXAMPLES_FILE, 'utf8');
    const examples: OptimizedExample[] = JSON.parse(data);
    
    // Sort by score (highest first) and limit the number of examples
    return examples
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting optimized examples:', error);
    return [];
  }
}

// Save new optimized examples
async function saveOptimizedExamples(examples: OptimizedExample[]) {
  try {
    await initializeMetaAgent();
    
    // Read existing examples
    const data = fs.readFileSync(OPTIMIZED_EXAMPLES_FILE, 'utf8');
    let existingExamples: OptimizedExample[] = JSON.parse(data);
    
    // Add new examples
    const combined = [...existingExamples, ...examples];
    
    // Keep only the top 10 examples by score
    const topExamples = combined
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    // Save back to the file
    fs.writeFileSync(OPTIMIZED_EXAMPLES_FILE, JSON.stringify(topExamples, null, 2));
    
    return true;
  } catch (error) {
    console.error('Error saving optimized examples:', error);
    throw error;
  }
}

// Run the meta-agent analysis
export async function runMetaAgentAnalysis() {
  let attempts = 0;
  const maxAttempts = 3; // Maximum number of retry attempts
  let lastResponse = "";
  let lastError: Error | null = null;

  try {
    console.log('Running meta-agent analysis...');
    
    // Initialize meta-agent storage (consider adding try-catch here too if needed)
    await initializeMetaAgent();
    
    // Get feedback statistics from the database (consider adding try-catch here too if needed)
    const stats = await getFeedbackStatistics();
    
    if (!stats || !stats.basicStats || stats.basicStats.length < 5) {
      console.log('Not enough feedback data for meta-agent analysis.');
      return null; // Gracefully exit if not enough data
    }
    
    const feedbackData = JSON.stringify(stats, null, 2);
    
    while (attempts < maxAttempts) {
      try {
        // Inside the main attempt loop
        const temperature = attempts > 0 ? 0.05 : 0.7;
        console.log(`Meta-agent attempt ${attempts + 1}/${maxAttempts} with temperature ${temperature}`);
        
        const ollama = new Ollama({
          baseUrl: 'http://localhost:11434',
          model: 'llama3',
          temperature: temperature,
        });
        
        let prompt;
        if (attempts > 0 && lastError) {
          // Construct retry prompt with error context
          prompt = `I previously asked you ... Error: ${lastError instanceof Error ? lastError.message : 'Invalid JSON format'} ... ${META_AGENT_PROMPT.replace('{{feedback_data}}', feedbackData)}`;
        } else {
          prompt = META_AGENT_PROMPT.replace('{{feedback_data}}', feedbackData);
        }
        
        // Call the model - specific try-catch for the call itself
        let response: string;
        try {
           response = await ollama.call(prompt);
           lastResponse = response; // Store latest response
        } catch (callError: any) {
           console.error(`Attempt ${attempts + 1}/${maxAttempts}: Error calling Ollama for meta-agent:`, callError);
           lastError = callError instanceof Error ? callError : new Error(String(callError));
           attempts++;
           if (attempts >= maxAttempts) {
              console.error(`Meta-agent Ollama call failed after ${maxAttempts} attempts.`);
              return null; // Return null if call fails repeatedly
           }
           await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Optional backoff
           continue; // Go to next attempt
        }
        
        // Try parsing the response
        try {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : response;
          const analysis = JSON.parse(jsonStr);

          // *** Add response structure validation ***
          if (!analysis || typeof analysis !== 'object' || 
              !analysis.analysis || typeof analysis.analysis !== 'object' || 
              !analysis.recommendations || !Array.isArray(analysis.recommendations) ||
              !analysis.example_critiques || !Array.isArray(analysis.example_critiques) ||
              !analysis.negative_constraints || !Array.isArray(analysis.negative_constraints)) {
            console.warn(`Attempt ${attempts + 1}/${maxAttempts}: Meta-agent response has invalid structure (missing required fields).`);
            lastError = new Error("Invalid response structure");
            attempts++;
            if (attempts >= maxAttempts) {
              console.error(`Meta-agent response structure invalid after ${maxAttempts} attempts.`);
              return null;
            }
            continue; // Go to next attempt
          }
          
          // Process valid analysis
          if (analysis.example_critiques.length > 0) {
            const optimizedExamples: OptimizedExample[] = analysis.example_critiques.map((example: any) => ({
              ...example,
              id: uuidv4(),
              score: 1, 
              createdAt: new Date().toISOString()
            }));
            await saveOptimizedExamples(optimizedExamples);
            console.log('Meta-agent analysis complete:');
            console.log('- Generated', optimizedExamples.length, 'new example critiques');
            console.log('- Overall performance:', analysis.analysis?.overallPerformance?.substring(0, 100) + '...');
            console.log('- Top recommendation:', analysis.recommendations?.[0]);
          }
          
          // *** Process and save negative constraints ***
          if (analysis.negative_constraints.length > 0) {
            console.log(`Meta-agent identified ${analysis.negative_constraints.length} potential negative constraints.`);
            for (const constraint of analysis.negative_constraints) {
              if (constraint.description) { // Basic validation
                await saveNegativeConstraint({
                  description: constraint.description,
                  patternExample: constraint.patternExample // Will be saved as null if undefined
                  // source is defaulted to 'meta-agent' in saveNegativeConstraint
                });
              }
            }
          }
          
          return analysis; // Success!

        } catch (parseError: any) {
          console.error(`Attempt ${attempts + 1}/${maxAttempts}: Error parsing meta-agent response:`, parseError);
          console.log('Raw response:', response);
          lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
          attempts++;
          if (attempts >= maxAttempts) {
            console.error(`Failed to parse meta-agent response after ${maxAttempts} attempts`);
            return null; // Return null if parsing fails repeatedly
          }
          continue; // Go to next attempt
        }

      } catch (loopError) {
         // Catch unexpected errors within the while loop attempt
         console.error(`Attempt ${attempts + 1}/${maxAttempts}: Unexpected error during meta-agent attempt:`, loopError);
         lastError = loopError instanceof Error ? loopError : new Error(String(loopError));
         attempts++;
         if (attempts >= maxAttempts) {
            console.error(`Meta-agent failed after ${maxAttempts} attempts due to unexpected errors.`);
            return null;
         }
         await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Optional backoff
         continue; // Go to next attempt
      }
    } // end while loop

    // Should theoretically be unreachable if logic inside loop is correct, but acts as a safeguard
    console.error('Meta-agent analysis loop finished without success or explicit failure.');
    return null;

  } catch (error) {
    // Catch errors from outside the loop (init, getStats)
    console.error('Fatal error during meta-agent analysis execution:', error);
    return null; // Ensure null is returned on outer errors too
  }
}

// Update example scores based on feedback
export async function updateExampleScores(
  exampleId: string, 
  feedbackType: 'accept' | 'reject' | 'ignore'
) {
  try {
    const data = fs.readFileSync(OPTIMIZED_EXAMPLES_FILE, 'utf8');
    let examples: OptimizedExample[] = JSON.parse(data);
    
    // Find the example
    const exampleIndex = examples.findIndex(e => e.id === exampleId);
    
    if (exampleIndex >= 0) {
      // Update the score
      if (feedbackType === 'accept') {
        examples[exampleIndex].score += 0.1;
      } else if (feedbackType === 'reject') {
        examples[exampleIndex].score -= 0.2;
      }
      
      // Save the updated examples
      fs.writeFileSync(OPTIMIZED_EXAMPLES_FILE, JSON.stringify(examples, null, 2));
    }
    
    return true;
  } catch (error) {
    console.error('Error updating example scores:', error);
    return false;
  }
}

// Schedule the meta-agent to run periodically
export function scheduleMetaAgent(intervalHours = 24) {
  // Convert hours to milliseconds
  const interval = intervalHours * 60 * 60 * 1000;
  
  console.log(`Scheduling meta-agent to run every ${intervalHours} hours`);
  
  // Run immediately on startup if we have examples
  setTimeout(async () => {
    const stats = await getFeedbackStatistics();
    if (stats && stats.basicStats && stats.basicStats.length >= 5) {
      await runMetaAgentAnalysis();
    }
  }, 10000); // Small delay on startup
  
  // Schedule recurring runs
  setInterval(async () => {
    await runMetaAgentAnalysis();
  }, interval);
} 