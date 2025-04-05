import { useState, forwardRef, useImperativeHandle } from 'react';
import { CodebaseCritiqueResult } from '@/lib/llm/codebase-critic';
import { useRouter } from 'next/navigation';

interface CodebaseResultsProps {
  critique?: CodebaseCritiqueResult | null;
  result?: any; // For backward compatibility with existing code
  isLoading?: boolean;
  analysisDetails?: {
    fileCount?: number;
    totalSize?: number;
    languages?: Record<string, number>;
    processingInfo?: {
      duration: string;
      timestamp: string;
      excludedPatterns: string[];
    };
    basePath?: string;
    directoryPath?: string;
  };
  onFeedback?: ((type: "accept" | "reject" | "ignore", issueId: string) => void) | ((feedback: { helpful: boolean; comments?: string }) => void);
}

// Export component handle for ref
export interface CodebaseResultsHandle {
  handleConvertToTickets: () => Promise<void>;
}

const CodebaseResults = forwardRef<CodebaseResultsHandle, CodebaseResultsProps>(({
  critique,
  result,
  isLoading = false,
  analysisDetails,
  onFeedback
}, ref) => {
  // Support both critique and result formats
  const data = critique || result;
  
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'patterns'>('overview');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());
  const [convertingToTickets, setConvertingToTickets] = useState(false);
  const [conversionResult, setConversionResult] = useState<any>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const router = useRouter();

  // Toggle issue expansion
  const toggleIssue = (issueId: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId);
    } else {
      newExpanded.add(issueId);
    }
    setExpandedIssues(newExpanded);
  };

  // Handle feedback
  const handleFeedback = (type: "accept" | "reject" | "ignore", issueId: string) => {
    if (typeof onFeedback === 'function') {
      if (onFeedback.length === 2) {
        // It's the first type
        (onFeedback as (type: "accept" | "reject" | "ignore", issueId: string) => void)(type, issueId);
      } else {
        // It's the second type
        const helpfulMap: Record<string, boolean | undefined> = {
          "accept": true,
          "reject": false,
          "ignore": undefined
        };
        (onFeedback as (feedback: { helpful: boolean; comments?: string }) => void)({ 
          helpful: helpfulMap[type] as boolean, 
          comments: `Feedback on issue ${issueId}: ${type}`
        });
      }
    }
  };

  // Handle conversion to tickets
  const handleConvertToTickets = async () => {
    if (!data) return;
    
    setConvertingToTickets(true);
    setConversionError(null);
    
    try {
      // Prepare the payload based on available data format
      // Define the payload type explicitly to include basePath
      let payload: { issues: any[]; basePath?: string }; 
      
      if (critique && critique.issues) {
        // Using the critique format
        payload = {
          issues: critique.issues.map(issue => ({
            id: issue.id,
            title: issue.title,
            description: issue.description,
            severity: issue.severity,
            affectedFiles: issue.affectedFiles,
            fixSuggestion: issue.fixSuggestion
          }))
        };
      } else if (result && result.findings) {
        // Using the result format
        payload = {
          issues: result.findings.map((finding: any) => ({
            id: finding.id,
            title: finding.title,
            description: finding.description,
            severity: finding.severity,
            affectedFiles: finding.files || [],
            fixSuggestion: finding.recommendation || ''
          }))
        };
      } else {
        throw new Error('Invalid data format for ticket creation');
      }
      
      // Add the basePath to the payload
      if (analysisDetails?.basePath) {
        payload.basePath = analysisDetails.basePath;
      } else if (analysisDetails?.directoryPath) { // Fallback if basePath isn't there
        payload.basePath = analysisDetails.directoryPath;
      }
      
      const response = await fetch('/api/codebase/convert-to-tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const responseData = await response.json();
      setConversionResult(responseData);
    } catch (error: any) {
      console.error('Error creating tickets:', error);
      setConversionError(error.message || 'Failed to create tickets');
    } finally {
      setConvertingToTickets(false);
    }
  };

  // Expose handleConvertToTickets to the parent component via ref
  useImperativeHandle(ref, () => ({
    handleConvertToTickets
  }));

  // Navigate to ticket manager
  const handleViewTickets = () => {
    router.push('/virtual-tickets');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="animate-spin h-10 w-10 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg">Analyzing codebase...</p>
          <p className="text-sm text-gray-500">This may take a moment for larger codebases.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <svg className="h-16 w-16 text-gray-400 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <p className="mt-4 text-lg">Upload a codebase to analyze</p>
          <p className="text-sm text-gray-500">Zip your project files and upload them for a comprehensive analysis.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
        <nav className="flex">
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'overview'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'issues'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('issues')}
          >
            Issues ({data.issues.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === 'patterns'
                ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('patterns')}
          >
            Patterns
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'overview' && (
          <div className="p-4">
            <h3 className="text-xl font-semibold mb-2">Summary</h3>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{data.summary}</p>
            
            <h3 className="text-xl font-semibold mb-2">Overall Assessment</h3>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{data.overallAssessment}</p>
            
            <h3 className="text-xl font-semibold mb-2">Architecture Review</h3>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{data.architectureReview}</p>
            
            {/* Analysis details */}
            {analysisDetails && (
              <div className="mt-6 border-t pt-4">
                <h3 className="text-xl font-semibold mb-3">Analysis Details</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* File statistics */}
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded shadow-sm">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">File Statistics</h4>
                    <div className="space-y-1">
                      <p className="text-sm">
                        <span className="font-medium">Files Analyzed:</span> {analysisDetails.fileCount || 'N/A'}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Total Size:</span> {analysisDetails.totalSize 
                          ? `${(analysisDetails.totalSize / 1024).toFixed(2)} KB` 
                          : 'N/A'}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Processing Time:</span> {analysisDetails.processingInfo?.duration || 'N/A'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Exclusion details */}
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded shadow-sm">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Excluded Directories</h4>
                    {analysisDetails.processingInfo?.excludedPatterns && 
                     analysisDetails.processingInfo.excludedPatterns.length > 0 ? (
                      <div className="max-h-32 overflow-y-auto">
                        <div className="flex flex-wrap gap-1">
                          {analysisDetails.processingInfo.excludedPatterns.map((pattern, index) => (
                            <span 
                              key={index} 
                              className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full"
                            >
                              {pattern}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No directories excluded</p>
                    )}
                  </div>
                </div>
                
                {/* Language breakdown */}
                {analysisDetails.languages && Object.keys(analysisDetails.languages).length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded shadow-sm">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300 mb-2">Language Breakdown</h4>
                    <div className="space-y-2">
                      {Object.entries(analysisDetails.languages)
                        .sort(([_, countA], [__, countB]) => (countB as number) - (countA as number))
                        .map(([language, count], index) => (
                          <div key={index} className="flex items-center">
                            <div className="w-32 text-sm">{language}</div>
                            <div className="flex-1 ml-2">
                              <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                <div 
                                  className="bg-blue-600 h-2" 
                                  style={{ 
                                    width: `${(count as number) / Math.max(...Object.values(analysisDetails.languages as Record<string, number>)) * 100}%` 
                                  }}
                                ></div>
                              </div>
                            </div>
                            <div className="ml-2 text-sm text-gray-600 dark:text-gray-400 w-12 text-right">
                              {count} file{(count as number) !== 1 ? 's' : ''}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && (
          <div className="p-4">
            {data.issues.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No issues found in the codebase.</p>
            ) : (
              <div className="space-y-4">
                {data.issues.map((issue: any) => (
                  <div 
                    key={issue.id} 
                    className="border rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-sm"
                  >
                    <div 
                      className="flex justify-between items-center p-4 cursor-pointer"
                      onClick={() => toggleIssue(issue.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-block h-3 w-3 rounded-full ${
                            issue.severity === 'high' 
                              ? 'bg-red-500' 
                              : issue.severity === 'medium' 
                                ? 'bg-yellow-500' 
                                : 'bg-blue-500'
                          }`}
                        ></span>
                        <h3 className="font-medium">{issue.title}</h3>
                      </div>
                      <svg 
                        className={`h-5 w-5 transition-transform ${expandedIssues.has(issue.id) ? 'transform rotate-180' : ''}`} 
                        xmlns="http://www.w3.org/2000/svg" 
                        viewBox="0 0 20 20" 
                        fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    
                    {expandedIssues.has(issue.id) && (
                      <div className="p-4 border-t dark:border-gray-700">
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Description</h4>
                          <p className="text-gray-700 dark:text-gray-300">{issue.description}</p>
                        </div>
                        
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Affected Files</h4>
                          <ul className="list-disc list-inside text-gray-700 dark:text-gray-300">
                            {issue.affectedFiles.map((file: string, index: number) => (
                              <li key={index}>{file}</li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="mb-4">
                          <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Suggested Fix</h4>
                          <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-auto text-sm max-h-60">
                            {issue.fixSuggestion}
                          </pre>
                        </div>
                        
                        <div className="flex space-x-2 justify-end">
                          <button
                            className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded hover:bg-green-200 dark:hover:bg-green-800"
                            onClick={() => handleFeedback('accept', issue.id)}
                          >
                            Accept
                          </button>
                          <button
                            className="px-3 py-1 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                            onClick={() => handleFeedback('reject', issue.id)}
                          >
                            Reject
                          </button>
                          <button
                            className="px-3 py-1 bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                            onClick={() => handleFeedback('ignore', issue.id)}
                          >
                            Ignore
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'patterns' && (
          <div className="p-4">
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-3 text-green-600 dark:text-green-400">Positive Patterns</h3>
              {data.patterns.positive.length === 0 ? (
                <p className="text-gray-500">No positive patterns identified.</p>
              ) : (
                <ul className="list-disc list-inside space-y-2">
                  {data.patterns.positive.map((pattern: string, index: number) => (
                    <li key={index} className="text-gray-700 dark:text-gray-300">{pattern}</li>
                  ))}
                </ul>
              )}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-3 text-orange-600 dark:text-orange-400">Areas for Improvement</h3>
              {data.patterns.negative.length === 0 ? (
                <p className="text-gray-500">No negative patterns identified.</p>
              ) : (
                <ul className="list-disc list-inside space-y-2">
                  {data.patterns.negative.map((pattern: string, index: number) => (
                    <li key={index} className="text-gray-700 dark:text-gray-300">{pattern}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add the ticket creation section at the bottom of the component */}
      <div className="border-t border-gray-200 dark:border-gray-700 mt-4 p-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div>
            <h3 className="text-lg font-semibold mb-1">Create Virtual Tickets</h3>
            <p className="text-sm text-gray-500">
              Convert findings into actionable tickets for the coding agent to process and fix automatically.
            </p>
          </div>
          
          {!conversionResult ? (
            <button
              onClick={handleConvertToTickets}
              disabled={convertingToTickets || !(
                (critique && critique.issues && critique.issues.length > 0) || 
                (result && result.findings && result.findings.length > 0)
              )}
              className={`mt-3 md:mt-0 px-4 py-2 rounded-md text-white flex items-center space-x-2 ${
                convertingToTickets || !(
                  (critique && critique.issues && critique.issues.length > 0) || 
                  (result && result.findings && result.findings.length > 0)
                )
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
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
                  <span>Create Virtual Tickets</span>
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleViewTickets}
              className="mt-3 md:mt-0 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md flex items-center space-x-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
              </svg>
              <span>View Created Tickets</span>
            </button>
          )}
        </div>
        
        {conversionError && (
          <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 rounded-md">
            <p className="text-red-800 dark:text-red-200 text-sm">
              <strong>Error:</strong> {conversionError}
            </p>
          </div>
        )}
        
        {conversionResult && (
          <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-md">
            <p className="text-green-800 dark:text-green-200 text-sm">
              <strong>Success!</strong> {conversionResult.message}
            </p>
            <p className="text-green-700 dark:text-green-300 text-sm mt-1">
              You can now use the coding agent to automatically apply fixes to these issues.
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

export default CodebaseResults; 