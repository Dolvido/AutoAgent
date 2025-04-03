"use client";

import { useState } from "react";

export interface CritiqueIssue {
  id: string;
  title: string;
  description: string;
  fixSuggestion: string;
  severity: "low" | "medium" | "high";
}

interface CritiqueCardProps {
  issue: CritiqueIssue;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onIgnore: (id: string) => void;
  onCopyFix: (fix: string) => void;
}

export default function CritiqueCard({
  issue,
  onAccept,
  onReject,
  onIgnore,
  onCopyFix,
}: CritiqueCardProps) {
  const [expanded, setExpanded] = useState(true);

  // Get severity color
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "low":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "medium":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-md mb-4 overflow-hidden">
      <div
        className="flex justify-between items-center p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <span
            className={`px-2 py-1 text-xs font-medium rounded-md ${getSeverityColor(
              issue.severity
            )}`}
          >
            {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
          </span>
          <h3 className="font-medium">{issue.title}</h3>
        </div>
        <button>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 transition-transform ${
              expanded ? "transform rotate-180" : ""
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              Description
            </h4>
            <p className="text-sm">{issue.description}</p>
          </div>

          <div className="mb-4">
            <h4 className="text-sm font-medium mb-2 text-gray-600 dark:text-gray-400">
              Suggested Fix
            </h4>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {issue.fixSuggestion}
              </pre>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAccept(issue.id)}
              className="px-3 py-1.5 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-md text-sm hover:bg-green-200 dark:hover:bg-green-800"
            >
              Accept
            </button>
            <button
              onClick={() => onReject(issue.id)}
              className="px-3 py-1.5 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-md text-sm hover:bg-red-200 dark:hover:bg-red-800"
            >
              Reject
            </button>
            <button
              onClick={() => onIgnore(issue.id)}
              className="px-3 py-1.5 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 rounded-md text-sm hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Ignore
            </button>
            <button
              onClick={() => onCopyFix(issue.fixSuggestion)}
              className="px-3 py-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-md text-sm hover:bg-blue-200 dark:hover:bg-blue-800"
            >
              Copy Fix
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 