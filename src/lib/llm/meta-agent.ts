import { getFeedbackStatistics } from '../db/database';
import { Ollama } from '@langchain/community/llms/ollama';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

// Directory for storing meta-agent data
const META_AGENT_DIR = path.join(process.cwd(), 'data', 'meta-agent');

// File to store optimized examples
const OPTIMIZED_EXAMPLES_FILE = path.join(META_AGENT_DIR, 'optimized-examples.json');

// Meta-agent prompt template
const META_AGENT_PROMPT = `You are an AI Meta-Agent that is analyzing the feedback on code critiques.
Your goal is to find patterns in what makes a good code critique and identify how to improve future critiques.

Below is a collection of comprehensive code critique feedback statistics, showing how many times different critique issues have been 
accepted or rejected by users, along with metrics showing acceptance rates, trends, and patterns.

Your task is to:
1. Identify patterns in what makes a successful critique (accepted vs rejected)
2. Analyze which types of issues and severity levels are most helpful
3. Identify trends in user feedback over time
4. Analyze acceptance rates across different programming languages
5. Suggest 2-3 new example code snippets and critiques to use as few-shot examples
6. Suggest improvements to our critique strategy

Here is the detailed feedback data:
{{feedback_data}}

Please format your response as a JSON object with:
{
  "analysis": {
    "overallPerformance": "An overview of critique effectiveness based on acceptance rates",
    "languageInsights": "Analysis of which languages have the best acceptance rates",
    "severityInsights": "Analysis of how severity levels affect acceptance",
    "timeBasedTrends": "Description of how acceptance rates have changed over time",
    "mostSuccessfulCritiqueTypes": "Which types of critiques users find most valuable",
    "leastSuccessfulCritiqueTypes": "Which types of critiques users tend to reject"
  },
  "recommendations": [
    "List of specific, actionable recommendations for improving critique strategy"
  ],
  "example_critiques": [
    {
      "code": "Your suggested code example",
      "critique": {
        "summary": "Summary of the code critique",
        "issues": [
          {
            "title": "Issue title",
            "description": "Detailed explanation of the problem",
            "fixSuggestion": "Code example showing how to fix the issue",
            "severity": "high|medium|low"
          }
        ]
      }
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
  try {
    console.log('Running meta-agent analysis...');
    
    // Initialize meta-agent storage
    await initializeMetaAgent();
    
    // Get feedback statistics from the database
    const stats = await getFeedbackStatistics();
    
    // If we don't have enough feedback data yet, skip the analysis
    if (!stats || !stats.basicStats || stats.basicStats.length < 5) {
      console.log('Not enough feedback data for meta-agent analysis.');
      return null;
    }
    
    // Format the feedback data for the prompt - convert to stringified JSON with 
    // reasonable indentation for readability in the prompt
    const feedbackData = JSON.stringify(stats, null, 2);
    
    // Create the prompt
    const prompt = META_AGENT_PROMPT.replace('{{feedback_data}}', feedbackData);
    
    // Create Ollama client
    const ollama = new Ollama({
      baseUrl: 'http://localhost:11434',
      model: 'llama3', // Can be configured as needed
      temperature: 0.7, // Higher temperature for creative suggestions
    });
    
    // Call the model
    const response = await ollama.call(prompt);
    
    try {
      // Parse the response - extract JSON part if the model added any text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      const analysis = JSON.parse(jsonStr);
      
      // Process the example critiques from the analysis
      if (analysis.example_critiques && analysis.example_critiques.length > 0) {
        const optimizedExamples: OptimizedExample[] = analysis.example_critiques.map((example: any) => ({
          ...example,
          id: uuidv4(),
          score: 1, // Start with a neutral score
          createdAt: new Date().toISOString()
        }));
        
        // Save the new examples
        await saveOptimizedExamples(optimizedExamples);
        
        // Log analysis summary
        console.log('Meta-agent analysis complete:');
        console.log('- Generated', optimizedExamples.length, 'new example critiques');
        console.log('- Overall performance:', analysis.analysis?.overallPerformance?.substring(0, 100) + '...');
        console.log('- Top recommendation:', analysis.recommendations?.[0]);
      }
      
      return analysis;
    } catch (parseError) {
      console.error('Error parsing meta-agent response:', parseError);
      console.log('Raw response:', response);
      return null;
    }
  } catch (error) {
    console.error('Error running meta-agent analysis:', error);
    return null;
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