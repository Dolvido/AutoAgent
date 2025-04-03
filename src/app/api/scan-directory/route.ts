import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Common patterns for directories that should typically be excluded
const COMMON_EXCLUDE_PATTERNS = [
  // Version control
  '.git', '.svn', '.hg',
  // Package managers
  'node_modules', 'bower_components', 'vendor', 'packages',
  // Build directories
  'dist', 'build', '.next', 'out', 'public/build', 'bin', 'obj',
  // Cache
  '.cache', '.tmp', 'tmp', 'cache',
  // IDE files
  '.vscode', '.idea', '.vs',
  // OS files
  '.DS_Store', '__MACOSX',
  // Assets directories that are likely large
  'assets/videos', 'public/videos', 'assets/images', 'public/images'
];

export async function POST(request: NextRequest) {
  try {
    const { directoryPath } = await request.json();

    if (!directoryPath) {
      return NextResponse.json({ error: 'No directory path provided' }, { status: 400 });
    }

    // Security check - avoid command injection
    if (directoryPath.includes('..') || directoryPath.includes('|') || 
        directoryPath.includes('&') || directoryPath.includes(';')) {
      return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 });
    }

    // Check if directory exists
    if (!fs.existsSync(directoryPath)) {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
    }

    // Start scanning the directory
    const excludedDirs: string[] = [];
    
    try {
      // Read the top-level directories
      const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
      
      for (const entry of entries) {
        // Skip files, we only want directories
        if (!entry.isDirectory()) continue;
        
        const dirName = entry.name;
        const fullPath = path.join(directoryPath, dirName);
        
        // Check if it matches common patterns to exclude
        if (COMMON_EXCLUDE_PATTERNS.includes(dirName) || dirName.startsWith('.')) {
          excludedDirs.push(dirName);
          continue;
        }
        
        // Check directory size by counting files
        try {
          const stats = scanDirectorySize(fullPath);
          
          // If it has a lot of files or is large, exclude it
          if (stats.fileCount > 100 || stats.hasBinaryContent) {
            excludedDirs.push(dirName);
          }
        } catch (err) {
          console.warn(`Error scanning ${fullPath}:`, err);
        }
      }
      
      return NextResponse.json({ 
        recommendedExclusions: excludedDirs,
        message: 'Directory scan completed successfully'
      });
    } catch (error) {
      console.error('Error scanning directory:', error);
      return NextResponse.json({ error: 'Failed to scan directory' }, { status: 500 });
    }
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to scan directory size
function scanDirectorySize(dirPath: string, maxDepth = 2, currentDepth = 0) {
  const stats = { fileCount: 0, hasBinaryContent: false };
  
  // Don't go too deep
  if (currentDepth >= maxDepth) {
    return stats;
  }
  
  try {
    // Binary file extensions
    const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', 
                              '.zip', '.tar', '.gz', '.rar', '.7z', 
                              '.pdf', '.exe', '.dll', '.so', '.dylib', '.bin'];
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively scan subdir with depth limiting
        const subStats = scanDirectorySize(fullPath, maxDepth, currentDepth + 1);
        stats.fileCount += subStats.fileCount;
        if (subStats.hasBinaryContent) {
          stats.hasBinaryContent = true;
        }
      } else {
        stats.fileCount++;
        
        // Check if it's a binary file
        const ext = path.extname(entry.name).toLowerCase();
        if (binaryExtensions.includes(ext)) {
          stats.hasBinaryContent = true;
        }
        
        // Check if it's a large file (> 1MB)
        try {
          const fileStat = fs.statSync(fullPath);
          if (fileStat.size > 1024 * 1024) {
            stats.hasBinaryContent = true;
          }
        } catch (err) {
          // Skip file if can't read stats
        }
        
        // Limit count to avoid long scans
        if (stats.fileCount > 200) break;
      }
    }
  } catch (err) {
    console.warn(`Error reading directory ${dirPath}:`, err);
  }
  
  return stats;
} 