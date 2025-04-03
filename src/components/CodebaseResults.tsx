import { useState } from 'react';
import { CodebaseCritiqueResult } from '@/lib/llm/codebase-critic';

interface CodebaseResultsProps {
  critique: CodebaseCritiqueResult | null;
  isLoading: boolean;
  analysisDetails?: {
    fileCount?: number;
    totalSize?: number;
    languages?: Record<string, number>;
    processingInfo?: {
      duration: string;
      timestamp: string;
      excludedPatterns: string[];
    };
  };
  onFeedback?: (type: "accept" | "reject" | "ignore", issueId: string) => void;
}

export default function CodebaseResults({
  critique,
  isLoading,
  analysisDetails,
  onFeedback
}: CodebaseResultsProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'patterns'>('overview');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

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
    onFeedback?.(type, issueId);
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

  if (!critique) {
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
            Issues ({critique.issues.length})
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
            <p className="mb-4 text-gray-700 dark:text-gray-300">{critique.summary}</p>
            
            <h3 className="text-xl font-semibold mb-2">Overall Assessment</h3>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{critique.overallAssessment}</p>
            
            <h3 className="text-xl font-semibold mb-2">Architecture Review</h3>
            <p className="mb-4 text-gray-700 dark:text-gray-300">{critique.architectureReview}</p>
            
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
            {critique.issues.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No issues found in the codebase.</p>
            ) : (
              <div className="space-y-4">
                {critique.issues.map((issue) => (
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
                            {issue.affectedFiles.map((file, index) => (
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
              {critique.patterns.positive.length === 0 ? (
                <p className="text-gray-500">No positive patterns identified.</p>
              ) : (
                <ul className="list-disc list-inside space-y-2">
                  {critique.patterns.positive.map((pattern, index) => (
                    <li key={index} className="text-gray-700 dark:text-gray-300">{pattern}</li>
                  ))}
                </ul>
              )}
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-3 text-orange-600 dark:text-orange-400">Areas for Improvement</h3>
              {critique.patterns.negative.length === 0 ? (
                <p className="text-gray-500">No negative patterns identified.</p>
              ) : (
                <ul className="list-disc list-inside space-y-2">
                  {critique.patterns.negative.map((pattern, index) => (
                    <li key={index} className="text-gray-700 dark:text-gray-300">{pattern}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 