"use client";

import { useState, useRef } from "react";
import JSZip from "jszip";

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

export default function CodebaseUpload({
  onProcessed,
  onError,
  isLoading,
  setIsLoading,
}: CodebaseUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadType, setUploadType] = useState<"zip" | "directory" | "browser-directory">("zip");
  const [directoryPath, setDirectoryPath] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [excludedDirs, setExcludedDirs] = useState<string[]>(DEFAULT_EXCLUDE_PATTERNS);
  const [customExclude, setCustomExclude] = useState(DEFAULT_EXCLUDE_PATTERNS.join(', '));
  const [useCustomExcludes, setUseCustomExcludes] = useState(false);
  const [showExcludeOptions, setShowExcludeOptions] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedDirectory, setScannedDirectory] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      onError("Please upload a ZIP file");
      return;
    }

    try {
      setIsLoading(true);
      setUploadProgress(5);
      setCurrentStep('Reading ZIP file');
      
      // First, read the ZIP file
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      
      setUploadProgress(20);
      setCurrentStep('Scanning file structure');
      
      // Convert files to a format suitable for the API
      const filesArray: { name: string; content: string }[] = [];
      
      // Get the current exclude patterns to use
      const patternsToExclude = useCustomExcludes ? 
        customExclude.split(',').map(p => p.trim()).filter(p => p.length > 0) : 
        excludedDirs;
      
      // Check if path should be excluded based on patterns
      const shouldExcludeFile = (filePath: string) => {
        return patternsToExclude.some(pattern => 
          filePath.includes(`/${pattern}/`) || filePath.startsWith(`${pattern}/`)
        );
      };
      
      const textFileExtensions = new Set([
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cs', 
        '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.rb', 
        '.php', '.swift', '.kt', '.html', '.css', '.json', 
        '.yml', '.yaml', '.md', '.txt', '.xml', '.sh', '.bat',
        '.gitignore', '.env', '.config', '.md', '.markdown'
      ]);
      
      // Check if it's not a binary file based on extension
      const isTextFile = (filename: string) => {
        const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
        return textFileExtensions.has(extension);
      };
      
      let totalFiles = Object.keys(contents.files).length;
      let processedFiles = 0;
      
      // Process all files in the ZIP
      for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
        // Update the current file being processed
        if (processedFiles % 50 === 0) {
          setCurrentStep(`Processing ${relativePath}`);
        }
        
        // Skip directories, excluded paths, and binary files
        if (!zipEntry.dir && !shouldExcludeFile(relativePath) && isTextFile(relativePath)) {
          try {
            const content = await zipEntry.async('string');
            filesArray.push({ name: relativePath, content });
          } catch (error) {
            console.warn(`Could not extract file ${relativePath}:`, error);
          }
        }
        
        processedFiles++;
        setUploadProgress(20 + Math.floor((processedFiles / totalFiles) * 40));
      }
      
      setUploadProgress(60);
      setCurrentStep('Analyzing code structure');
      
      // Call the API
      const response = await fetch("/api/critique-codebase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          files: filesArray,
          excludedPatterns: patternsToExclude 
        }),
      });
      
      setUploadProgress(80);
      setCurrentStep('Processing results');
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      
      const result = await response.json();
      setUploadProgress(100);
      setCurrentStep('Complete');
      
      onProcessed(result);
    } catch (error) {
      console.error("Error processing ZIP file:", error);
      onError(error instanceof Error ? error.message : "Error processing ZIP file");
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };

  const handleDirectorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!directoryPath.trim()) {
      onError("Please enter a directory path");
      return;
    }
    
    try {
      // Normalize the directory path for better cross-platform compatibility
      const normalizedPath = directoryPath.replace(/\\/g, '/');
      
      // Show loading state
      setIsLoading(true);
      setUploadProgress(10);
      setCurrentStep('Processing directory');
      
      // Get the current exclude patterns to use
      const patternsToExclude = useCustomExcludes ? 
        customExclude.split(',').map(p => p.trim()).filter(p => p.length > 0) : 
        excludedDirs;
      
      // Call the API with the directory path
      const response = await fetch("/api/critique-codebase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          directoryPath: normalizedPath,
          excludedPatterns: patternsToExclude 
        }),
      });
      
      setUploadProgress(70);
      setCurrentStep('Processing results');
      
      // Parse the response
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `API error: ${response.statusText}`);
      }
      
      setUploadProgress(100);
      setCurrentStep('Complete');
      
      onProcessed(data);
    } catch (error) {
      console.error("Error processing directory:", error);
      onError(error instanceof Error ? error.message : "Error processing directory");
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };

  // Handle drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleBrowserDirectorySelect = async () => {
    try {
      // @ts-ignore - showDirectoryPicker might not be recognized by TypeScript
      if (!window.showDirectoryPicker) {
        throw new Error("Directory picker is not supported in this browser. Try Chrome or Edge.");
      }
      
      setIsLoading(true);
      setUploadProgress(10);
      setCurrentStep('Reading directory');
      
      // If we already scanned a directory, use that instead of prompting again
      // @ts-ignore - TypeScript doesn't know about showDirectoryPicker yet
      const directoryHandle = scannedDirectory || await window.showDirectoryPicker();
      
      // Only clear the scanned directory if we're actually starting the analysis
      setScannedDirectory(null);
      
      const files: { name: string; content: string }[] = [];
      
      // Get the current exclude patterns to use
      const patternsToExclude = useCustomExcludes ? 
        customExclude.split(',').map(p => p.trim()).filter(p => p.length > 0) : 
        excludedDirs;
      
      // Process the directory contents recursively
      await processDirectoryEntry(directoryHandle, "", files, patternsToExclude);
      
      setUploadProgress(60);
      setCurrentStep('Preparing files for analysis');
      
      if (files.length === 0) {
        throw new Error("No readable text files found in the selected directory");
      }
      
      // Call the API with the files array (same as ZIP upload)
      const response = await fetch("/api/critique-codebase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          files,
          excludedPatterns: patternsToExclude 
        }),
      });
      
      setUploadProgress(80);
      setCurrentStep('Processing results');
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || `API error: ${response.statusText}`);
      }
      
      const result = await response.json();
      setUploadProgress(100);
      setCurrentStep('Complete');
      
      onProcessed(result);
    } catch (error) {
      console.error("Error processing browser directory:", error);
      onError(error instanceof Error ? error.message : "Error processing directory");
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };
  
  // Helper to process a directory recursively
  const processDirectoryEntry = async (
    dirHandle: any,
    path: string,
    files: { name: string; content: string }[],
    excludePatterns: string[]
  ) => {
    try {
      // Check if this directory should be excluded
      const dirName = dirHandle.name;
      if (excludePatterns.includes(dirName)) {
        return;
      }
      
      // Process all entries in the directory
      for await (const entry of dirHandle.values()) {
        const entryPath = path ? `${path}/${entry.name}` : entry.name;
        
        // Update current step
        setCurrentStep(`Scanning ${entryPath}`);
        
        if (entry.kind === 'directory') {
          // Skip directories that match exclude patterns
          if (excludePatterns.includes(entry.name)) {
            continue;
          }
          // Recursively process subdirectories
          await processDirectoryEntry(entry, entryPath, files, excludePatterns);
        } else if (entry.kind === 'file') {
          try {
            // Skip binary files
            const ext = entry.name.split('.').pop()?.toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'ico', 'exe', 'dll', 'so', 'dylib'].includes(ext || '')) {
              continue;
            }
            
            // Get the file
            const file = await entry.getFile();
            
            // Skip large files (>1MB)
            if (file.size > 1024 * 1024) {
              continue;
            }
            
            // Read the file content
            const content = await file.text();
            
            // Add to the files array
            files.push({
              name: entryPath,
              content
            });
          } catch (error) {
            console.warn(`Error reading file ${entryPath}:`, error);
            // Continue with other files
          }
        }
      }
    } catch (error) {
      console.error(`Error processing directory ${path}:`, error);
      // Continue with what we have
    }
  };

  // Toggle between AI and custom exclusions
  const toggleExclusionMode = () => {
    setUseCustomExcludes(!useCustomExcludes);
  };

  // Reset excluded dirs to defaults
  const resetExcludedDirs = () => {
    setExcludedDirs(DEFAULT_EXCLUDE_PATTERNS);
    setCustomExclude(DEFAULT_EXCLUDE_PATTERNS.join(', '));
  };

  // Scan directory for intelligent exclusion recommendations
  const scanForRecommendations = async () => {
    try {
      setIsScanning(true);
      
      if (uploadType === "zip" && fileInputRef.current?.files?.[0]) {
        // For ZIP files, read the file structure and analyze
        const file = fileInputRef.current.files[0];
        const zip = new JSZip();
        const contents = await zip.loadAsync(file);
        
        // Analyze ZIP contents to find common build dirs, large files, etc.
        const directoryCounts: Record<string, number> = {};
        const largeFileDirs: Set<string> = new Set();
        const binaryExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.zip', '.pdf', '.exe', '.dll', '.bin'];
        
        // Gather directory statistics
        for (const [path, entry] of Object.entries(contents.files)) {
          if (entry.dir) continue;
          
          const parts = path.split('/');
          // Track top-level and secondary dirs
          if (parts.length > 1) {
            const dir = parts[0];
            directoryCounts[dir] = (directoryCounts[dir] || 0) + 1;
            
            // Check for binary/media files which are likely large
            const fileExt = path.substring(path.lastIndexOf('.')).toLowerCase();
            if (binaryExtensions.includes(fileExt)) {
              largeFileDirs.add(dir);
            }
          }
        }
        
        // Find large directories (likely to be node_modules, build outputs, etc.)
        const recommendedExclusions: string[] = [];
        for (const [dir, count] of Object.entries(directoryCounts)) {
          if (count > 100 || largeFileDirs.has(dir)) {
            recommendedExclusions.push(dir);
          }
        }
        
        // Always exclude common large dirs
        ['node_modules', '.git', 'dist', 'build', '.next'].forEach(dir => {
          if (directoryCounts[dir] && !recommendedExclusions.includes(dir)) {
            recommendedExclusions.push(dir);
          }
        });
        
        // Update exclusions
        if (recommendedExclusions.length > 0) {
          setExcludedDirs(recommendedExclusions);
          setCustomExclude(recommendedExclusions.join(', '));
          setUseCustomExcludes(false);
        }
      } else if (uploadType === "browser-directory") {
        // For browser directory, we'll need to scan via the File System API
        try {
          // @ts-ignore - TypeScript doesn't know about showDirectoryPicker yet
          if (!window.showDirectoryPicker) {
            throw new Error("Directory picker is not supported in this browser");
          }
          
          // Set current step to indicate scanning
          setCurrentStep('Scanning directory structure...');
          
          // @ts-ignore
          const directoryHandle = await window.showDirectoryPicker();
          const directoryCounts: Record<string, number> = {};
          const recommendedExclusions: string[] = [];
          
          // Scan first level directories
          for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'directory') {
              // Update current step
              setCurrentStep(`Scanning ${entry.name}...`);
              
              // Check if it's a common pattern to exclude
              const dirName = entry.name;
              if (
                // Common build directories
                dirName === 'node_modules' || dirName === 'dist' || 
                dirName === 'build' || dirName === '.next' ||
                // Version control
                dirName === '.git' || dirName === '.svn' ||
                // IDE files
                dirName === '.vscode' || dirName === '.idea' ||
                // Cache directories
                dirName.startsWith('.') || dirName.includes('cache')
              ) {
                recommendedExclusions.push(dirName);
                continue;
              }
              
              // Count files in directory to identify large directories
              try {
                let fileCount = 0;
                for await (const _ of entry.values()) {
                  fileCount++;
                  // Stop counting after a threshold to keep the scan quick
                  if (fileCount > 100) break;
                }
                
                if (fileCount > 50) {
                  recommendedExclusions.push(entry.name);
                }
              } catch (err) {
                console.warn(`Could not scan directory ${entry.name}:`, err);
              }
            }
          }
          
          // Update exclusions
          if (recommendedExclusions.length > 0) {
            setExcludedDirs(recommendedExclusions);
            setCustomExclude(recommendedExclusions.join(', '));
            setUseCustomExcludes(false);
            
            // Store the scanned directory handle for later use
            setScannedDirectory(directoryHandle);
            
            // Switch to browser-directory upload type
            setUploadType("browser-directory");
            
            // Show success message
            setCurrentStep('Scan complete! Directory ready for analysis.');
            setTimeout(() => setCurrentStep(''), 3000);
          }
        } catch (error) {
          console.error("Error scanning directory:", error);
          onError(error instanceof Error ? error.message : "Error scanning directory");
        }
      } else if (uploadType === "directory" && directoryPath) {
        // For server-side directory, make an API call
        try {
          // Set current step
          setCurrentStep('Scanning directory on server...');
          
          const response = await fetch("/api/scan-directory", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ directoryPath }),
          });
          
          if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
          }
          
          const { recommendedExclusions } = await response.json();
          
          if (recommendedExclusions && recommendedExclusions.length > 0) {
            setExcludedDirs(recommendedExclusions);
            setCustomExclude(recommendedExclusions.join(', '));
            setUseCustomExcludes(false);
            
            // Show success message
            setCurrentStep('Scan complete! Directory ready for analysis.');
            setTimeout(() => setCurrentStep(''), 3000);
          }
        } catch (error) {
          console.error("Error scanning directory:", error);
          onError(error instanceof Error ? error.message : "Error scanning directory");
        }
      } else {
        // No directory selected yet
        onError("Please select a directory or upload a ZIP file first");
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Directory Scan Information */}
      <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
        <h3 className="text-md font-medium text-blue-800 dark:text-blue-200 mb-2">How to get the best results:</h3>
        <ol className="list-decimal pl-5 text-sm text-blue-700 dark:text-blue-300 space-y-1">
          <li>Click "Configure Exclusions" to show exclusion options</li>
          <li>Click "Scan for Recommendations" to analyze your project structure</li>
          <li>Review the recommended directories to exclude</li>
          <li>Select your upload method and analyze your codebase</li>
        </ol>
      </div>
      
      {/* Exclusion Options Toggle */}
      <div className="w-full mb-4 flex justify-end">
        <button
          onClick={() => setShowExcludeOptions(!showExcludeOptions)}
          className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
        >
          <svg className="h-4 w-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          {showExcludeOptions ? 'Hide Options' : 'Configure Exclusions'}
        </button>
      </div>
      
      {/* Exclusion Configuration Panel */}
      {showExcludeOptions && (
        <div className="w-full mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-100">Directory Exclusion Options</h3>
            <div className="space-x-3">
              <button 
                onClick={scanForRecommendations}
                disabled={isScanning}
                className="text-sm text-white bg-green-600 hover:bg-green-700 py-1 px-3 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScanning ? "Scanning..." : "Scan for Recommendations"}
              </button>
              <button 
                onClick={resetExcludedDirs}
                className="text-sm text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
          
          <div className="flex items-center mb-4">
            <div className="relative inline-block w-10 mr-2 align-middle select-none">
              <input 
                type="checkbox" 
                id="exclusionToggle" 
                checked={useCustomExcludes}
                onChange={toggleExclusionMode}
                className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
              />
              <label 
                htmlFor="exclusionToggle" 
                className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
              ></label>
            </div>
            <label htmlFor="exclusionToggle" className="text-sm text-gray-800 dark:text-gray-200">
              {useCustomExcludes ? 'Custom Exclusions' : 'AI-Recommended Exclusions'}
            </label>
          </div>
          
          {useCustomExcludes ? (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
                Custom Excluded Directories (comma separated)
              </label>
              <input
                type="text"
                value={customExclude}
                onChange={(e) => setCustomExclude(e.target.value)}
                className="w-full p-2 border rounded-md text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                placeholder="node_modules, .git, dist"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                These directories will be excluded from the analysis
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-800 dark:text-gray-200">
                AI-Recommended Exclusions
              </label>
              <div className="flex flex-wrap gap-2">
                {excludedDirs.map((dir, index) => (
                  <div key={index} className="bg-blue-100 text-blue-900 text-xs px-2 py-1 rounded-full dark:bg-blue-900 dark:text-blue-100">
                    {dir}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center space-x-4 mb-4">
        <button
          type="button"
          onClick={() => setUploadType("zip")}
          className={`px-4 py-2 rounded-md transition-colors duration-200 ${
            uploadType === "zip"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
          }`}
        >
          Upload ZIP
        </button>
        <button
          type="button"
          onClick={() => setUploadType("browser-directory")}
          className={`px-4 py-2 rounded-md transition-colors duration-200 ${
            uploadType === "browser-directory"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
          }`}
        >
          Browse Directory
        </button>
        <button
          type="button"
          onClick={() => setUploadType("directory")}
          className={`px-4 py-2 rounded-md transition-colors duration-200 ${
            uploadType === "directory"
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
          }`}
        >
          Local Path
        </button>
      </div>

      {uploadType === "zip" && (
        <div
          className={`border-2 border-dashed rounded-lg p-8 ${
            isDragging
              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
              : "border-gray-300 dark:border-gray-700"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center justify-center space-y-4">
            <svg
              className="h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              ></path>
            </svg>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-800 dark:text-gray-100">
                Drag and drop your ZIP file here
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                or
              </p>
            </div>
            <button
              type="button"
              onClick={triggerFileInput}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Select ZIP file
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".zip"
              className="hidden"
            />
          </div>
        </div>
      )}

      {uploadType === "browser-directory" && (
        <div className="border-2 border-dashed rounded-lg p-8 border-gray-300 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center space-y-4">
            <svg
              className="h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              ></path>
            </svg>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-800 dark:text-gray-100">
                Select Directory from Your Computer
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                This uses the File System Access API to read your project files directly in the browser.
                Only available in Chrome, Edge and other Chromium-based browsers.
              </p>
              {scannedDirectory && (
                <div className="mt-2 p-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-md">
                  Directory already scanned and ready for analysis!
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleBrowserDirectorySelect}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scannedDirectory ? "Analyze Scanned Directory" : "Browse Directory"}
            </button>
          </div>
        </div>
      )}

      {uploadType === "directory" && (
        <div className="border-2 border-dashed rounded-lg p-8 border-gray-300 dark:border-gray-700">
          <div className="flex flex-col items-center justify-center space-y-4">
            <svg
              className="h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              ></path>
            </svg>
            <div className="text-center">
              <p className="text-lg font-medium text-gray-800 dark:text-gray-100">
                Enter a path to a local directory
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The directory must be accessible by the server
              </p>
            </div>
            <form
              onSubmit={handleDirectorySubmit}
              className="flex flex-col space-y-4 w-full max-w-md"
            >
              <input
                type="text"
                value={directoryPath}
                onChange={(e) => setDirectoryPath(e.target.value)}
                placeholder="Enter directory path (e.g., /path/to/project)"
                className="px-4 py-2 border rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                required
              />
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Analyze Directory
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Loading Progress Indicator */}
      {isLoading && (
        <div className="mt-6 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{currentStep}</span>
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  );
} 