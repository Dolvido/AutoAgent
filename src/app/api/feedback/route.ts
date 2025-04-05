import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { CodebaseCritic } from '@/lib/codebase-critic';

// Create a feedback directory if it doesn't exist
const feedbackDir = path.join(process.cwd(), "data", "feedback");
if (!fs.existsSync(feedbackDir)) {
  fs.mkdirSync(feedbackDir, { recursive: true });
}

// Save feedback to a file
async function saveFeedbackToFile(feedback: any) {
  const filename = `feedback-${Date.now()}.json`;
  const filepath = path.join(feedbackDir, filename);
  
  return new Promise<boolean>((resolve, reject) => {
    fs.writeFile(filepath, JSON.stringify(feedback, null, 2), (err) => {
      if (err) {
        console.error("Error writing feedback:", err);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validate core field
    if (typeof body.helpful !== "boolean") {
      return new Response(
        JSON.stringify({ error: "Invalid request body: 'helpful' boolean is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Collect additional fields
    const comments = body.comments || "";
    const timestamp = new Date().toISOString();
    const feedbackType = body.helpful ? "accept" : "reject";
    const codeSnippet = body.codeSnippet;
    const critique = body.critique;
    
    // Save feedback to file (optional logging/backup)
    const savedToFile = await saveFeedbackToFile({
      helpful: body.helpful,
      comments,
      timestamp,
      codeSnippet,
      critique
    });
    if (!savedToFile) {
      console.warn("Failed to save feedback to file, but proceeding with learning loop.");
      // Decide if this should be a hard failure or just a warning
    }
    
    // Process feedback for the learning loop
    let savedToLearningLoop = false;
    // Add validation for required fields for learning loop
    if (codeSnippet && typeof codeSnippet === 'string' && codeSnippet.trim() !== '' && critique && typeof critique === 'object') {
      try {
        // Create a minimal codebase structure for the critic (this seems okay as per analysis)
        const mockStructure = {
          files: [],
          dependencyGraph: {},
          fileTypes: {},
          codeMetrics: {
            totalLines: 0,
            totalFiles: 0,
            averageLinesPerFile: 0,
            filesByExtension: {}
          }
        };
        
        const critic = new CodebaseCritic(mockStructure);
        savedToLearningLoop = await critic.processFeedback(
          feedbackType as 'accept' | 'reject' | 'ignore', 
          codeSnippet, 
          critique
        );
        if (!savedToLearningLoop) {
          console.error("Processing feedback for learning loop failed.");
          // Potentially return an error here if this step is critical
        }
      } catch (learningError) {
        console.error("Error during feedback processing for learning loop:", learningError);
        savedToLearningLoop = false; // Ensure it's marked as failed
      }
    } else {
      console.warn("Skipping learning loop processing: codeSnippet or critique data missing/invalid.");
      // If learning loop is essential, treat this as a failure
      // savedToLearningLoop remains false
    }
    
    // Report success only if the critical learning loop processing succeeded
    // Saving to file is treated as secondary/logging
    const overallSuccess = savedToLearningLoop;
    
    return new Response(JSON.stringify({ 
      success: overallSuccess,
      savedToFile,
      savedToLearningLoop
    }), {
      status: overallSuccess ? 200 : 500, // Return 500 if learning loop failed
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Error in feedback API route:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
} 