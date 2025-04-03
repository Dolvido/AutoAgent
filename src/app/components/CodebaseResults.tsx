"use client";

import { useState } from "react";

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

interface CodebaseResultsProps {
  result: CodebaseResult | null;
  onFeedback: (feedback: { helpful: boolean; comments?: string }) => void;
}

export default function CodebaseResults({ result, onFeedback }: CodebaseResultsProps) {
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [comments, setComments] = useState("");
  
  if (!result) return null;
  
  // Helper to get severity colors
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const handleFeedback = (helpful: boolean) => {
    onFeedback({ helpful, comments });
    setFeedbackSent(true);
  };

  const toggleFinding = (id: string) => {
    if (expandedFinding === id) {
      setExpandedFinding(null);
    } else {
      setExpandedFinding(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Summary
        </h3>
        <p className="text-gray-700 dark:text-gray-300">{result.summary}</p>
      </div>

      {/* Strengths */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Strengths
        </h3>
        <ul className="list-disc pl-5 space-y-1">
          {result.strengths.map((strength, index) => (
            <li key={index} className="text-gray-700 dark:text-gray-300">
              {strength}
            </li>
          ))}
        </ul>
      </div>

      {/* Findings */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Findings
        </h3>
        
        <div className="space-y-3">
          {result.findings.map((finding) => (
            <div 
              key={finding.id} 
              className="border dark:border-gray-700 rounded-lg overflow-hidden"
            >
              <div 
                className="p-3 cursor-pointer flex items-center justify-between"
                onClick={() => toggleFinding(finding.id)}
              >
                <div className="flex items-center">
                  <span 
                    className={`inline-block px-2 py-1 text-xs font-medium rounded mr-3 ${getSeverityColor(finding.severity)}`}
                  >
                    {finding.severity.toUpperCase()}
                  </span>
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {finding.title}
                  </h4>
                </div>
                <svg 
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-5 w-5 transition-transform duration-200 ${expandedFinding === finding.id ? "transform rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              
              {expandedFinding === finding.id && (
                <div className="p-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <p className="mb-3 text-gray-700 dark:text-gray-300">
                    {finding.description}
                  </p>
                  
                  {finding.files.length > 0 && (
                    <div className="mb-3">
                      <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Affected Files:</p>
                      <ul className="list-disc pl-5 space-y-1 mt-1">
                        {finding.files.map((file, index) => (
                          <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div>
                    <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Recommendation:</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {finding.recommendation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Improvement Areas */}
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Areas for Improvement
        </h3>
        <ul className="list-disc pl-5 space-y-1">
          {result.improvement_areas.map((area, index) => (
            <li key={index} className="text-gray-700 dark:text-gray-300">
              {area}
            </li>
          ))}
        </ul>
      </div>

      {/* Feedback Section */}
      {!feedbackSent ? (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Was this critique helpful?
          </h3>
          <div className="flex flex-col space-y-3">
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Any additional comments? (optional)"
              className="w-full p-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              rows={3}
            />
            <div className="flex space-x-3">
              <button
                onClick={() => handleFeedback(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Yes, helpful
              </button>
              <button
                onClick={() => handleFeedback(false)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                No, not helpful
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-lg shadow">
          Thank you for your feedback!
        </div>
      )}
    </div>
  );
} 