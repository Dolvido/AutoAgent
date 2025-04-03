import { useState, useRef } from 'react';
import JSZip from 'jszip';

interface CodebaseUploadProps {
  onCodebaseProcessed: (result: any) => void;
  onError?: (error: string) => void;
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

export default function CodebaseUpload({ onCodebaseProcessed, onError }: CodebaseUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [excludedDirs, setExcludedDirs] = useState<string[]>(DEFAULT_EXCLUDE_PATTERNS);
  const [customExclude, setCustomExclude] = useState('');
  const [useCustomExcludes, setUseCustomExcludes] = useState(false);
  const [showExcludeOptions, setShowExcludeOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process the zip file
  const processZipFile = async (file: File) => {
    try {
      setIsLoading(true);
      setUploadProgress(5);
      setCurrentStep('Reading ZIP file');
      
      // Read the zip file
      const zipContent = await JSZip.loadAsync(file);
      setUploadProgress(20);
      setCurrentStep('Scanning file structure');
      
      // Extract files
      const extractedFiles: Record<string, string> = {};
      let totalFiles = Object.keys(zipContent.files).length;
      let processedFiles = 0;
      
      const textFileExtensions = new Set([
        '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cs', 
        '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.rb', 
        '.php', '.swift', '.kt', '.html', '.css', '.json', 
        '.yml', '.yaml', '.md', '.txt', '.xml', '.sh', '.bat',
        '.gitignore', '.env', '.config', '.md', '.markdown'
      ]);
      
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
      
      // Check if it's not a binary file based on extension
      const isTextFile = (filename: string) => {
        const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
        return textFileExtensions.has(extension);
      };
      
      // Process each file in the zip
      for (const [relativePath, zipEntry] of Object.entries(zipContent.files)) {
        // Update the current file being processed
        if (processedFiles % 50 === 0) {
          setCurrentStep(`Processing ${relativePath}`);
        }
        
        // Skip directories, excluded paths, and binary files
        if (!zipEntry.dir && !shouldExcludeFile(relativePath) && isTextFile(relativePath)) {
          try {
            const content = await zipEntry.async('string');
            extractedFiles[relativePath] = content;
          } catch (error) {
            console.warn(`Could not extract file ${relativePath}:`, error);
          }
        }
        
        processedFiles++;
        setUploadProgress(20 + Math.floor((processedFiles / totalFiles) * 40));
      }
      
      setUploadProgress(60);
      setCurrentStep('Analyzing code structure');
      
      // Send to API for analysis
      const response = await fetch('/api/codebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          files: extractedFiles,
          excludedPatterns: patternsToExclude
        }),
      });
      
      setUploadProgress(80);
      setCurrentStep('Processing results');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze codebase');
      }
      
      const result = await response.json();
      setUploadProgress(100);
      setCurrentStep('Complete');
      
      // Pass result to parent component
      onCodebaseProcessed(result);
    } catch (error) {
      console.error("Error processing zip:", error);
      onError?.(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
      setCurrentStep('');
    }
  };

  // Handle file change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // Check if it's a zip file
    if (!file.name.endsWith('.zip')) {
      onError?.('Please upload a ZIP file');
      return;
    }
    
    processZipFile(file);
    
    // Reset the input
    e.target.value = '';
  };
  
  // Trigger file input click
  const handleUploadClick = () => {
    fileInputRef.current?.click();
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
  
  return (
    <div className="flex flex-col items-center w-full">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".zip"
        onChange={handleFileChange}
        disabled={isLoading}
      />
      
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
        <div className="w-full mb-6 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Directory Exclusion Options</h3>
            <button 
              onClick={resetExcludedDirs}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Reset to Defaults
            </button>
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
            <label htmlFor="exclusionToggle" className="text-sm">
              {useCustomExcludes ? 'Custom Exclusions' : 'AI-Recommended Exclusions'}
            </label>
          </div>
          
          {useCustomExcludes ? (
            <div>
              <label className="block text-sm font-medium mb-1">
                Custom Excluded Directories (comma separated)
              </label>
              <input
                type="text"
                value={customExclude}
                onChange={(e) => setCustomExclude(e.target.value)}
                className="w-full p-2 border rounded-md text-sm"
                placeholder="node_modules, .git, dist"
              />
              <p className="text-xs text-gray-500 mt-1">
                These directories will be excluded from the analysis
              </p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">
                AI-Recommended Exclusions
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 border rounded-md bg-white dark:bg-gray-700">
                {excludedDirs.map((dir, index) => (
                  <div 
                    key={index}
                    className="flex items-center bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full"
                  >
                    <span>{dir}</span>
                    <button 
                      onClick={() => setExcludedDirs(excludedDirs.filter((_, i) => i !== index))}
                      className="ml-1 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex mt-2">
                <input
                  type="text"
                  placeholder="Add directory to exclude"
                  className="flex-1 p-1 text-sm border rounded-l-md"
                  value={customExclude}
                  onChange={(e) => setCustomExclude(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && customExclude.trim()) {
                      setExcludedDirs([...excludedDirs, customExclude.trim()]);
                      setCustomExclude('');
                    }
                  }}
                />
                <button
                  onClick={() => {
                    if (customExclude.trim()) {
                      setExcludedDirs([...excludedDirs, customExclude.trim()]);
                      setCustomExclude('');
                    }
                  }}
                  className="bg-blue-600 text-white px-2 py-1 rounded-r-md text-sm"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      <button
        onClick={handleUploadClick}
        disabled={isLoading}
        className={`px-4 py-2 rounded-md flex items-center ${
          isLoading 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing Codebase...
          </>
        ) : (
          <>
            <svg className="mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3 3m0 0l-3-3m3 3V9" />
            </svg>
            Upload Codebase (.zip)
          </>
        )}
      </button>
      
      {isLoading && uploadProgress > 0 && (
        <div className="w-full mt-6 mb-2">
          {/* Enhanced Visual Progress Bar */}
          <div className="relative pt-1 w-full">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                  {currentStep}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold inline-block text-blue-600">
                  {uploadProgress}%
                </span>
              </div>
            </div>
            <div className="overflow-hidden h-4 mb-1 text-xs flex rounded-full bg-blue-200">
              <div 
                style={{ width: `${uploadProgress}%` }} 
                className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-600 transition-all duration-300 ease-out"
              >
              </div>
            </div>
            
            {/* Progress Steps Indicators */}
            <div className="flex justify-between text-xs text-gray-600 px-1 mt-1">
              <div className={`flex flex-col items-center ${uploadProgress >= 5 ? 'text-blue-600' : ''}`}>
                <div className={`w-3 h-3 rounded-full mb-1 ${uploadProgress >= 5 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                <span>Read ZIP</span>
              </div>
              <div className={`flex flex-col items-center ${uploadProgress >= 25 ? 'text-blue-600' : ''}`}>
                <div className={`w-3 h-3 rounded-full mb-1 ${uploadProgress >= 25 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                <span>Extract</span>
              </div>
              <div className={`flex flex-col items-center ${uploadProgress >= 60 ? 'text-blue-600' : ''}`}>
                <div className={`w-3 h-3 rounded-full mb-1 ${uploadProgress >= 60 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                <span>Analyze</span>
              </div>
              <div className={`flex flex-col items-center ${uploadProgress >= 80 ? 'text-blue-600' : ''}`}>
                <div className={`w-3 h-3 rounded-full mb-1 ${uploadProgress >= 80 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                <span>Process</span>
              </div>
              <div className={`flex flex-col items-center ${uploadProgress >= 100 ? 'text-blue-600' : ''}`}>
                <div className={`w-3 h-3 rounded-full mb-1 ${uploadProgress >= 100 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                <span>Complete</span>
              </div>
            </div>
          </div>
          
          <div className="text-sm text-gray-500 mt-3 text-center max-w-md mx-auto">
            {uploadProgress < 20 ? 'Reading and parsing the ZIP file...' : 
             uploadProgress < 60 ? `Processing files (${currentStep})...` : 
             uploadProgress < 80 ? 'Analyzing code structure and patterns...' : 
             uploadProgress < 100 ? 'Generating insights and recommendations...' : 
             'Analysis complete!'}
          </div>
        </div>
      )}
      
      {/* Add some CSS for toggle button */}
      <style jsx>{`
        .toggle-checkbox:checked {
          right: 0;
          border-color: #3B82F6;
        }
        .toggle-checkbox:checked + .toggle-label {
          background-color: #3B82F6;
        }
      `}</style>
    </div>
  );
} 