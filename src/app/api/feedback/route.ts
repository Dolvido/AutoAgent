import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    
    // Validate the request
    if (typeof body.helpful !== "boolean") {
      return new Response(
        JSON.stringify({ error: "Feedback must include a 'helpful' boolean field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get additional fields
    const comments = typeof body.comments === "string" ? body.comments : "";
    const timestamp = new Date().toISOString();
    const feedback = {
      helpful: body.helpful,
      comments,
      timestamp,
      type: body.type || "codebase" // What type of critique (codebase, file, etc.)
    };
    
    // In a real app, you'd store this in a database
    // For this demo, we'll just save to a file
    await saveFeedback(feedback);
    
    // Return success
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in feedback API:", error);
    
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Save feedback to a file
 */
async function saveFeedback(feedback: any): Promise<void> {
  // Create feedback directory if it doesn't exist
  const feedbackDir = path.join(process.cwd(), "feedback");
  if (!fs.existsSync(feedbackDir)) {
    fs.mkdirSync(feedbackDir, { recursive: true });
  }
  
  // Create a filename with the timestamp
  const filename = `feedback-${new Date().getTime()}.json`;
  const filePath = path.join(feedbackDir, filename);
  
  // Write the feedback to the file
  return new Promise((resolve, reject) => {
    fs.writeFile(filePath, JSON.stringify(feedback, null, 2), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
} 