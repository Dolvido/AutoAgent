"use client";

import React from 'react';
import CodebaseUpload from '../components/CodebaseUpload';
import CodebaseResults from '../components/CodebaseResults';

interface CodebaseResult {
  summary: string;
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    files: string[];
    recommendation: string;
  }>;
  strengths: string[];
  improvement_areas: string[];
}

export default function CodebasePage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [critiqueResult, setCritiqueResult] = React.useState<CodebaseResult | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  // Handle successful codebase processing
  const handleCodebaseProcessed = (result: any) => {
    setIsLoading(false);
    setCritiqueResult(result);
    setError(null);
  };

  // Handle upload errors
  const handleUploadError = (message: string) => {
    setIsLoading(false);
    setError(message);
    setCritiqueResult(null);
  };

  // Handle user feedback
  const handleFeedback = async (feedback: { helpful: boolean; comments?: string }) => {
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...feedback,
          type: 'codebase', // Specify feedback type
        }),
      });
    } catch (error) {
      console.error('Failed to send feedback:', error);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="dark:bg-gray-900 dark:text-white min-h-screen">
        {/* Header */}
        <header className="border-b border-gray-200 dark:border-gray-700">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold">Auto-Critic: Codebase Analysis</h1>
            <div className="flex items-center gap-4">
              <button
                className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Toggle dark mode"
                onClick={toggleDarkMode}
              >
                {isDarkMode ? (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" 
                    />
                  </svg>
                ) : (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    className="w-5 h-5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                )}
              </button>
              <a href="/file" className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                File Analysis
              </a>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Upload Your Codebase</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Choose one of the three methods to analyze your codebase:
            </p>
            <ul className="list-disc pl-8 mb-6 text-gray-600 dark:text-gray-400">
              <li className="mb-2"><strong>Upload ZIP</strong> - Package your project files in a ZIP archive and upload it</li>
              <li className="mb-2"><strong>Browse Directory</strong> - Select a directory on your computer (Chrome/Edge only, uses File System Access API)</li>
              <li className="mb-2"><strong>Local Path</strong> - Enter a directory path that's accessible to the server</li>
            </ul>
            
            {/* Upload Component */}
            <CodebaseUpload
              onProcessed={handleCodebaseProcessed}
              onError={handleUploadError}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
            
            {/* Error Message */}
            {error && (
              <div className="mt-4 p-4 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-md">
                {error}
              </div>
            )}
          </section>

          {/* Results Section */}
          {critiqueResult && (
            <section className="mt-8">
              <h2 className="text-2xl font-bold mb-6">Analysis Results</h2>
              <CodebaseResults
                result={critiqueResult}
                onFeedback={handleFeedback}
              />
            </section>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-800 mt-12">
          <div className="container mx-auto px-4 py-6 text-sm text-gray-600 dark:text-gray-400 text-center">
            Auto-Critic - Offline AI-powered code critique assistant
          </div>
        </footer>
      </div>
    </div>
  );
} 