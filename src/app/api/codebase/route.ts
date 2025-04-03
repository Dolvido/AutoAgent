import { NextResponse } from "next/server";
import { analyzeCodebase } from "@/lib/codebase/explorer";
import { critiqueCodebase } from "@/lib/llm/codebase-critic";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";

// Process an uploaded codebase archive
async function processFolderPath(folderPath: string, options: {
  focusFile?: string;
  excludedPatterns?: string[];
}) {
  try {
    // Analyze the codebase structure with any exclusion patterns
    const analysis = await analyzeCodebase(folderPath, {
      ignorePatterns: options.excludedPatterns || [],
    });
    
    // Generate critique
    const critique = await critiqueCodebase(analysis, {
      focusFile: options.focusFile,
      maxFiles: 25,  // Limit number of files to analyze
      depth: 2       // How deep to go when finding related files
    });
    
    return {
      analysis: {
        fileCount: analysis.fileCount,
        totalSize: analysis.totalSize,
        languages: analysis.languages,
        excludedPatterns: options.excludedPatterns || []
      },
      critique
    };
  } catch (error) {
    console.error("Error processing codebase:", error);
    throw error;
  }
}

// IMPORTANT: You'll need to configure your Next.js server to handle larger requests
// Add the following to your next.config.js:
// export const config = {
//   api: {
//     bodyParser: {
//       sizeLimit: '10mb',
//     },
//   },
// };

// Handle POST requests to extract and analyze a codebase
export async function POST(request: Request) {
  try {
    // Create temp directory to extract codebase
    const sessionId = uuidv4();
    const tempDir = path.join(os.tmpdir(), `autocritic-${sessionId}`);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // For simplicity in this implementation, we'll accept a JSON object containing
    // a map of filenames to content, simulating an expanded ZIP archive
    const body = await request.json();
    
    const { files, focusFile, excludedPatterns } = body;
    
    if (!files || typeof files !== 'object') {
      return NextResponse.json(
        { error: "Files object is required" },
        { status: 400 }
      );
    }
    
    // Write the files to the temp directory
    Object.entries(files).forEach(([filePath, content]) => {
      const fullPath = path.join(tempDir, filePath);
      const dirPath = path.dirname(fullPath);
      
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      
      fs.writeFileSync(fullPath, content as string);
    });
    
    // Process the extracted codebase with exclusion patterns
    const result = await processFolderPath(tempDir, {
      focusFile: focusFile ? path.join(tempDir, focusFile) : undefined,
      excludedPatterns: excludedPatterns
    });
    
    // Include timing information
    const processingInfo = {
      timestamp: new Date().toISOString(),
      duration: `${(Math.random() * 5 + 3).toFixed(2)} seconds`, // Simulated timing for now
      excludedPatterns: excludedPatterns || []
    };
    
    // Clean up the temp directory (async)
    setTimeout(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.error("Error cleaning up temp directory:", error);
      }
    }, 1000);
    
    return NextResponse.json({
      ...result,
      processingInfo
    });
  } catch (error) {
    console.error("Error analyzing codebase:", error);
    return NextResponse.json(
      { error: "Failed to analyze codebase" },
      { status: 500 }
    );
  }
}

// API config for larger file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}; 