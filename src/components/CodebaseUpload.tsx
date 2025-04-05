"use client";

import { useState, useRef } from 'react';

interface CodebaseUploadProps {
  onProcessed: (result: any) => void;
  onError: (message: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Default directory exclusion patterns
const DEFAULT_EXCLUDE_PATTERNS = [
  // Git directories
  '.git', 
  // Build and output directories
  'node_modules', 'dist', 'build', '.next', 'out', 'coverage',
  // Cache directories
  '.cache', '.vscode', '.idea', '.github', '.husky',
  // Package manager directories
  '.npm', '.yarn',
  // Large data directories
  'data/vectors', 'public/assets',
  // Common binary or large file directories
  'assets/videos', 'public/videos', 'public/images'
];

export default function CodebaseUpload({ onProcessed, onError, isLoading, setIsLoading }: CodebaseUploadProps) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [excludedDirs, setExcludedDirs] = useState<string[]>(DEFAULT_EXCLUDE_PATTERNS);
  const [customExclude, setCustomExclude] = useState(DEFAULT_EXCLUDE_PATTERNS.join(', '));
  const [useCustomExcludes, setUseCustomExcludes] = useState(false);
  const [showExcludeOptions, setShowExcludeOptions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedDirectoryName, setScannedDirectoryName] = useState<string | null>(null);

  // Simplified handler for submitting analysis request (always from browser files)
  const handleSubmitAnalysis = async (files: { name: string; content: string }[]) => {
    if (files.length === 0) {
      onError("No readable text files found or all files excluded.");
      return;
    }
    setIsLoading(true);
    setUploadProgress(10);
    setCurrentStep('Analyzing browser directory');

    const patternsToExclude = useCustomExcludes ? 
      customExclude.split(',').map(p => p.trim()).filter(p => p.length > 0) : 
      excludedDirs;

    try {
      console.log(`Submitting ${files.length} files read from browser directory for analysis.`);
      // Call the CORRECT API endpoint - Now expects 'files' object
      const response = await fetch("/api/codebase", { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          files: files, // Send files read from browser dir
          excludedPatterns: patternsToExclude 
        }),
      });

      setUploadProgress(70); 
      setCurrentStep('Processing results');

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze codebase');
      }

      const result = await response.json();
      console.log("Analysis API response received:", result);
      setUploadProgress(100);
      setCurrentStep('Complete');

      // Pass result up. The basePath in the result will be the server's temp path.
      onProcessed(result);

    } catch (err) {
      console.error('Error submitting analysis:', err);
      onError?.(err instanceof Error ? err.message : 'Failed to analyze codebase.');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };

  // Renamed handler for selecting and processing browser directory
  const handleSelectAndAnalyzeDirectory = async () => {
    try {
      setIsLoading(true);
      setUploadProgress(5);
      setCurrentStep('Requesting directory access...');

      // @ts-ignore
      if (!window.showDirectoryPicker) {
        throw new Error("Directory picker is not supported in this browser.");
      }
      // @ts-ignore
      const directoryHandle = await window.showDirectoryPicker();
      setScannedDirectoryName(directoryHandle.name); // Store name for display
      console.log('Browser directory handle obtained:', directoryHandle.name);
      setCurrentStep('Scanning directory contents...');

      const files: { name: string; content: string }[] = [];
      const patternsToExclude = useCustomExcludes ? 
        customExclude.split(',').map(p => p.trim()).filter(p => p.length > 0) : 
        excludedDirs;

      await processDirectoryEntry(directoryHandle, "", files, patternsToExclude);
      setUploadProgress(60); // After reading files
      
      // Submit the scanned files for analysis
      await handleSubmitAnalysis(files); 

    } catch (error) {
      console.error("Error processing browser directory:", error);
      onError?.(error instanceof Error ? error.message : "Error processing directory");
      // Reset state on error
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
      setScannedDirectoryName(null);
    }
  };

  // Helper function to process directory entries (remains mostly the same)
  const processDirectoryEntry = async (
    dirHandle: any,
    currentPath: string,
    files: { name: string; content: string }[],
    excludePatterns: string[]
  ) => {
    try {
      const dirName = dirHandle.name;
      if (excludePatterns.includes(dirName) || dirName.startsWith('.')) { // Also exclude hidden dirs
        console.log(`Excluding directory: ${currentPath}/${dirName}`);
        return;
      }
      for await (const entry of dirHandle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        setCurrentStep(`Scanning ${entryPath}`); 
        if (entry.kind === 'directory') {
          await processDirectoryEntry(entry, entryPath, files, excludePatterns);
        } else if (entry.kind === 'file') {
          // Skip obviously binary/non-code files early
          const ext = entry.name.split('.').pop()?.toLowerCase();
          const commonBinaryExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'mp3', 'mp4', 'mov', 'avi', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'rar', 'gz', 'exe', 'dll', 'so', 'dylib', 'obj', 'bin', 'dat', 'iso', 'img'];
          if (commonBinaryExts.includes(ext || '')) {
            console.log(`Skipping binary file: ${entryPath}`);
            continue;
          }
          try {
            const file = await entry.getFile();
            if (file.size > 1 * 1024 * 1024) { // Skip files > 1MB
              console.log(`Skipping large file (>1MB): ${entryPath}`);
              continue;
            }
            // Attempt to read as text
            const content = await file.text();
            files.push({ name: entryPath, content });
          } catch (readError: any) {
            // Ignore files that can't be read as text (likely binary)
             if (readError.name !== 'TypeError' || !readError.message.includes('cannot be decoded as text')) {
                 console.warn(`Skipping file ${entryPath} due to read error:`, readError.message);
             }
          }
        }
      }
    } catch (dirError) {
      console.error(`Error processing directory ${currentPath}:`, dirError);
    }
  };

  const scanForRecommendations = async () => { /* ... keep or remove ... */ };
  const toggleExclusionMode = () => setUseCustomExcludes(!useCustomExcludes);
  const resetExcludedDirs = () => { /* ... keep or remove ... */ };

  return (
    <div className="space-y-6">
      {/* ... Exclusion info and options ... */}

      {/* Simplified UI - Always shows the 'Browse Directory' option */}
      <div className="border-2 border-dashed rounded-lg p-8 border-gray-300 dark:border-gray-700">
        <div className="flex flex-col items-center justify-center space-y-4">
          <svg /* ... folder icon ... */ ></svg>
          <div className="text-center">
            <p className="text-lg font-medium text-gray-800 dark:text-gray-100">
              Analyze Directory from Your Computer
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Uses the File System Access API (Chrome/Edge only).
            </p>
            {scannedDirectoryName && (
              <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-md">
                <p>Selected: <strong>{scannedDirectoryName}</strong></p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSelectAndAnalyzeDirectory}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Analyzing...' : 'Select and Analyze Directory'}
          </button>
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-3 text-center max-w-md">
            <strong>Important:</strong> The server analyzes a temporary copy. Automatic file editing via Virtual Tickets requires the server to know the original project path, which isn't possible with this method.
          </p>
        </div>
      </div>

      {/* Loading Progress Indicator (remains the same) */}
      {isLoading && ( /* ... JSX ... */ )}
    </div>
  );
} 