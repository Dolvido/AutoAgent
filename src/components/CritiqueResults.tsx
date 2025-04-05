"use client";

import { useState } from "react";
import CritiqueCard, { CritiqueIssue } from "./CritiqueCard";

export interface CritiqueResult {
  id: string;
  summary: string;
  issues: CritiqueIssue[];
  language: string;
  strengths?: string[];
  improvement_areas?: string[];
  timestamp: string;
}

interface CritiqueResultsProps {
  critique: CritiqueResult | null;
  isLoading: boolean;
  onFeedback: (type: "accept" | "reject" | "ignore", issueId: string) => void;
  onCopyFix: (fix: string) => void;
  onRegenerate: () => void;
}

export default function CritiqueResults({
  critique,
  isLoading,
  onFeedback,
  onCopyFix,
  onRegenerate,
}: CritiqueResultsProps) {
  // Handle feedback actions
  const handleAccept = (id: string) => {
    onFeedback("accept", id);
  };

  const handleReject = (id: string) => {
    onFeedback("reject", id);
  };

  const handleIgnore = (id: string) => {
    onFeedback("ignore", id);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!critique) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="text-gray-500 dark:text-gray-400 text-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-10 w-10 mx-auto mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="mb-2">No code critique yet</p>
          <p className="text-sm">
            Submit your code to get AI-powered feedback and suggestions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium mb-2">Summary</h3>
        <p className="text-gray-700 dark:text-gray-300">{critique.summary}</p>
      </div>

      {critique.strengths && critique.strengths.length > 0 && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <h3 className="text-lg font-medium text-green-800 dark:text-green-300 mb-2">Strengths</h3>
          <ul className="list-disc pl-5 space-y-1">
            {critique.strengths.map((strength, index) => (
              <li key={index} className="text-green-700 dark:text-green-400">
                {strength}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium">Issues ({critique.issues.length})</h3>
          <button
            onClick={onRegenerate}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md text-sm"
          >
            Regenerate
          </button>
        </div>

        {/* Map over critique.issues only if it exists and is an array */}
        {Array.isArray(critique.issues) && critique.issues.length > 0 ? (
          critique.issues.map((issue) => (
            <CritiqueCard
              key={issue.id}
              issue={issue}
              onAccept={handleAccept}
              onReject={handleReject}
              onIgnore={handleIgnore}
              onCopyFix={onCopyFix}
            />
          ))
        ) : (
          <p className="text-gray-500 dark:text-gray-400 italic">No issues found.</p>
        )}
      </div>

      {critique.improvement_areas && critique.improvement_areas.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
          <h3 className="text-lg font-medium text-yellow-800 dark:text-yellow-300 mb-2">Areas for Improvement</h3>
          <ul className="list-disc pl-5 space-y-1">
            {critique.improvement_areas.map((area, index) => (
              <li key={index} className="text-yellow-700 dark:text-yellow-400">
                {area}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-gray-500 dark:text-gray-400">
        Critiqued on {new Date(critique.timestamp).toLocaleString()}
      </div>
    </div>
  );
} 