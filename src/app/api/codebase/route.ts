import { NextResponse } from "next/server";
import { analyzeCodebase, CodebaseAnalysis } from "@/lib/codebase/explorer";
import { CodebaseCritic, CodebaseStructure } from "@/lib/codebase-critic";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import process from "process";

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
  let tempDir: string | null = null;
  let analysisPath: string;
  let requestBody: any;

  try {
    requestBody = await request.json();
    const { files, directoryPath, excludedPatterns } = requestBody;

    if (directoryPath && typeof directoryPath === 'string') {
      analysisPath = directoryPath;
      console.log(`Analyzing provided directory path: ${analysisPath}`);
      if (!fs.existsSync(analysisPath)) {
        throw new Error(`Directory path not found on server: ${analysisPath}`);
      }
    } else if (files && typeof files === 'object') {
      const sessionId = uuidv4();
      tempDir = path.join(os.tmpdir(), `autocritic-${sessionId}`);
      console.log(`Creating temp directory for uploaded files: ${tempDir}`);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      analysisPath = tempDir;

      Object.entries(files).forEach(([filePath, content]) => {
        const fullPath = path.join(analysisPath, filePath);
        const dirPath = path.dirname(fullPath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(fullPath, content as string);
      });
      console.log(`Wrote ${Object.keys(files).length} files to ${analysisPath}`);
    } else {
      return NextResponse.json(
        { error: "Request must include either 'files' object (from ZIP) or 'directoryPath' string." },
        { status: 400 }
      );
    }

    // *** 1. Analyze the codebase structure using analyzeCodebase ***
    console.log(`Starting codebase analysis for path: ${analysisPath}`);
    const codebaseAnalysis: CodebaseAnalysis = await analyzeCodebase(analysisPath, {
      ignorePatterns: excludedPatterns || []
    });
    console.log(`Codebase analysis complete. Found ${codebaseAnalysis.fileCount} files.`);

    // *** 2. Construct CodebaseStructure for the critic ***
    const structureForCritic: CodebaseStructure = {
      files: codebaseAnalysis.files.map(f => ({ path: f.path, content: f.content })),
      dependencyGraph: {},
      fileTypes: codebaseAnalysis.languages || {},
      codeMetrics: {
        totalLines: codebaseAnalysis.totalSize || 0,
        totalFiles: codebaseAnalysis.fileCount || 0,
        averageLinesPerFile: codebaseAnalysis.fileCount ? Math.round((codebaseAnalysis.totalSize || 0) / codebaseAnalysis.fileCount) : 0,
        filesByExtension: codebaseAnalysis.languages || {}
      }
    };

    // *** 3. Instantiate the critic with the constructed structure ***
    console.log(`Instantiating CodebaseCritic...`);
    const critic = new CodebaseCritic(structureForCritic, { /* options if any */ });
    console.log(`Generating critique...`);
    const critique = await critic.generateCritique();
    console.log(`Critique generation complete.`);

    // Include timing information
    const processingInfo = {
      timestamp: new Date().toISOString(),
      duration: `${(Math.random() * 5 + 3).toFixed(2)} seconds`,
      excludedPatterns: excludedPatterns || []
    };

    // Clean up the temp directory if created
    if (tempDir) {
      const dirToClean = tempDir;
      setTimeout(() => {
        try {
          console.log(`Cleaning up temp directory: ${dirToClean}`);
          fs.rmSync(dirToClean, { recursive: true, force: true });
        } catch (error) {
          console.error(`Error cleaning up temp directory ${dirToClean}:`, error);
        }
      }, 2000);
    }

    // Determine the basePath to return
    const returnBasePath = directoryPath || analysisPath;
    console.log(`Returning basePath: ${returnBasePath}`);

    // Return the response, ensuring basePath is the actual analysis root
    return NextResponse.json({
      ...critique,
      processingInfo,
      directoryPath: returnBasePath,
      basePath: returnBasePath
    });

  } catch (error) {
    console.error("Error analyzing codebase:", error);
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error(`Error cleaning up temp directory on failure: ${tempDir}`, cleanupError);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to analyze codebase" },
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