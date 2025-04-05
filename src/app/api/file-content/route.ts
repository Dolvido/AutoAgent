import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { filePath } = body;

    // Validate required fields
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing required field: filePath' },
        { status: 400 }
      );
    }

    // Ensure the file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: `File not found: ${filePath}` },
        { status: 404 }
      );
    }

    // Check file size (optional - to prevent very large files)
    const stats = fs.statSync(filePath);
    const fileSizeInMB = stats.size / (1024 * 1024);
    const MAX_FILE_SIZE_MB = 10; // Maximum file size in MB
    
    if (fileSizeInMB > MAX_FILE_SIZE_MB) {
      return NextResponse.json(
        { error: `File too large (${fileSizeInMB.toFixed(2)} MB). Maximum size is ${MAX_FILE_SIZE_MB} MB.` },
        { status: 413 }
      );
    }

    // Read the file content
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Get file extension for language detection
    const extension = path.extname(filePath).slice(1); // Remove the dot
    
    return NextResponse.json({
      content,
      path: filePath,
      extension,
      size: stats.size
    });
  } catch (error: any) {
    console.error("API error in file-content route:", error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
} 