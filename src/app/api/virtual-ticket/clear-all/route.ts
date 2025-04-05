import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Default storage directory
const DEFAULT_STORAGE_DIR = './data/virtual-tickets';

export async function POST(request: NextRequest) {
  try {
    const storageDir = DEFAULT_STORAGE_DIR;
    
    // Check if directory exists
    if (!fs.existsSync(storageDir)) {
      return NextResponse.json({
        success: true,
        message: 'No tickets to clear'
      });
    }
    
    // Get all JSON files in the directory
    const files = fs.readdirSync(storageDir)
      .filter(file => file.endsWith('.json'));
    
    // Delete each file
    let deletedCount = 0;
    for (const file of files) {
      const filePath = path.join(storageDir, file);
      try {
        fs.unlinkSync(filePath);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${deletedCount} tickets`
    });
  } catch (error: any) {
    console.error('API error in clear-all route:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear tickets' },
      { status: 500 }
    );
  }
} 