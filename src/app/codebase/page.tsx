"use client";

import React from 'react';
import CodebaseUpload from '../components/CodebaseUpload';
import CodebaseResults from '../components/CodebaseResults';
import Navigation from '../../components/Navigation';

interface CodebaseResult {
  summary: string;
  issues: Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    affectedFile?: string;
    files?: string[];
    recommendation?: string;
    fixSuggestion?: string;
    lineNumber?: number;
  }>;
  strengths: string[];
  improvement_areas: string[];
  findings?: Array<{
    id: string;
    title: string;
    description: string;
    severity: "low" | "medium" | "high";
    files: string[];
    recommendation: string;
  }>;
}

export default function CodebasePage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [critiqueResult, setCritiqueResult] = React.useState<CodebaseResult | null>(null);
  const [isDarkMode, setIsDarkMode] = React.useState(false);
  const [convertingToTickets, setConvertingToTickets] = React.useState(false);
  const [conversionResult, setConversionResult] = React.useState<any>(null);
  const [conversionError, setConversionError] = React.useState<string | null>(null);
  const [selectedDirectory, setSelectedDirectory] = React.useState<string | null>(null);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  // Handle successful codebase processing
  const handleCodebaseProcessed = (result: any) => {
    setIsLoading(false);
    
    // Ensure we have an issues property (convert findings to issues if needed)
    const processedResult = { ...result };
    if (!processedResult.issues && processedResult.findings) {
      processedResult.issues = processedResult.findings.map((finding: any) => ({
        id: finding.id,
        title: finding.title, 
        description: finding.description,
        severity: finding.severity,
        files: finding.files,
        recommendation: finding.recommendation
      }));
    }
    
    setCritiqueResult(processedResult);
    setError(null);
    
    // Save the directory path if it exists
    if (result.directoryPath) {
      setSelectedDirectory(result.directoryPath);
      console.log(`Directory path saved: ${result.directoryPath}`);
    }
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

  // Handle create tickets directly
  const handleCreateTickets = async () => {
    if (!critiqueResult) {
      alert('No critique results available');
      return;
    }
    
    if (!critiqueResult.issues || critiqueResult.issues.length === 0) {
      alert('No issues to convert to tickets');
      return;
    }
    
    // Confirm with the user
    if (!confirm(`Convert ${critiqueResult.issues.length} issues to virtual tickets?`)) {
      return;
    }
    
    setConvertingToTickets(true);
    setConversionError(null);
    setConversionResult(null);
    
    try {
      // Prepare the payload based on available data
      const payload = {
        issues: critiqueResult.issues.map(issue => ({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          severity: issue.severity,
          affectedFiles: issue.files || [],
          fixSuggestion: issue.recommendation || issue.fixSuggestion || ''
        })),
        basePath: selectedDirectory // Pass the selected directory
      };
      
      // Log the payload right before sending
      console.log("[handleCreateTickets] Payload being sent:", JSON.stringify(payload, null, 2));

      const response = await fetch('/api/codebase/convert-to-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || `HTTP error ${response.status}`);
      }
      
      console.log("Ticket creation response:", responseData);
      setConversionResult(responseData);
      
      if (responseData.errors && responseData.errors.length > 0) {
        console.warn("Ticket creation had errors:", responseData.errors);
        setConversionError(`Created ${responseData.ticketIds?.length || 0} tickets with ${responseData.errors.length} errors. ${responseData.errors[0]}`);
      }
    } catch (error: any) {
      console.error('Error creating tickets:', error);
      setConversionResult(null);
      setConversionError(error.message || 'Failed to create tickets');
    } finally {
      setConvertingToTickets(false);
    }
  };

  // Navigate to ticket manager
  const handleViewTickets = () => {
    window.location.href = '/virtual-tickets';
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
              <Navigation currentPage="codebase" />
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
              
              {/* Add direct workflow buttons */}
              <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                  <div>
                    <h3 className="text-xl font-semibold">Auto-Agent Workflow</h3>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                      Take action on the findings with our automated agent
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 flex gap-4">
                    <a 
                      href="/virtual-tickets" 
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md inline-flex items-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                      </svg>
                      View Tickets
                    </a>
                    <button
                      onClick={handleCreateTickets}
                      disabled={convertingToTickets}
                      className={`px-4 py-2 text-white rounded-md inline-flex items-center ${
                        convertingToTickets ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {convertingToTickets ? (
                        <>
                          <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Creating Tickets...</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clipRule="evenodd" />
                          </svg>
                          <span>Create Tickets</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {/* Display conversion result or error */}
                {conversionResult && (
                  <div className={`mt-4 p-3 rounded-md ${conversionResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}>
                    <p className="font-medium">{conversionResult.message}</p>
                    {conversionResult.ticketIds?.length > 0 && (
                      <p className="mt-1">
                        <button
                          onClick={handleViewTickets}
                          className="text-blue-600 dark:text-blue-400 underline"
                        >
                          View tickets
                        </button>
                      </p>
                    )}
                  </div>
                )}
                
                {conversionError && (
                  <div className="mt-4 p-3 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-md">
                    <p className="font-medium">Error: {conversionError}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="text-center mb-3">
                      <span className="inline-block w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 flex items-center justify-center font-semibold">1</span>
                    </div>
                    <h4 className="font-medium text-center mb-2">Create Tickets</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Convert findings into actionable tickets
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="text-center mb-3">
                      <span className="inline-block w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 flex items-center justify-center font-semibold">2</span>
                    </div>
                    <h4 className="font-medium text-center mb-2">Apply Fixes</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      AI generates and applies code fixes
                    </p>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    <div className="text-center mb-3">
                      <span className="inline-block w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 flex items-center justify-center font-semibold">3</span>
                    </div>
                    <h4 className="font-medium text-center mb-2">Commit Changes</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      Apply fixes to Git with automated commits
                    </p>
                  </div>
                </div>
              </div>
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