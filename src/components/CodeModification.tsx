import React, { useState } from 'react';
import type { Issue } from './CritiqueResults';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { InfoIcon, CheckIcon, XIcon, AlertTriangleIcon, CodeIcon } from 'lucide-react';

interface CodeModificationProps {
  originalCode: string;
  issue: Issue;
  language: string;
  onApply: (modifiedCode: string) => void;
  onCancel: () => void;
}

interface DiffViewProps {
  original: string;
  modified: string;
  lineStart: number;
  lineEnd: number;
}

// Component to show code diff
const DiffView = ({ original, modified, lineStart, lineEnd }: DiffViewProps) => {
  return (
    <div className="grid grid-cols-2 gap-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-md text-sm font-mono overflow-x-auto">
      <div className="border-r border-gray-300 dark:border-gray-700 pr-2">
        <div className="text-xs text-gray-500 mb-1">Original (Line {lineStart}-{lineEnd})</div>
        <pre className="whitespace-pre-wrap">{original}</pre>
      </div>
      <div className="pl-2">
        <div className="text-xs text-gray-500 mb-1">Modified</div>
        <pre className="whitespace-pre-wrap">{modified}</pre>
      </div>
    </div>
  );
};

export default function CodeModification({
  originalCode,
  issue,
  language,
  onApply,
  onCancel
}: CodeModificationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [modificationResult, setModificationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Function to request code modification
  const requestModification = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/modify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: originalCode,
          language,
          issue,
          options: {
            preserveStyle: true,
            safetyChecks: true,
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const result = await response.json();
      setModificationResult(result);
    } catch (err: any) {
      console.error('Error modifying code:', err);
      setError(err.message || 'Failed to modify code');
    } finally {
      setIsLoading(false);
    }
  };

  // Apply the modification
  const handleApply = () => {
    if (modificationResult && modificationResult.modifiedCode) {
      onApply(modificationResult.modifiedCode);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <CodeIcon className="mr-2 h-5 w-5" />
          Code Modification
        </CardTitle>
        <CardDescription>Apply the suggested fix for: {issue.title}</CardDescription>
      </CardHeader>
      
      <CardContent>
        {!modificationResult && !isLoading && !error && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Auto-Agent can attempt to automatically apply the fix for this issue:
            </p>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md text-sm">
              <p className="font-medium">{issue.title}</p>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{issue.description}</p>
              <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
                <p className="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400">Suggested Fix:</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">{issue.fixSuggestion}</pre>
              </div>
            </div>
            <Button onClick={requestModification}>
              Generate Code Modification
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="py-8 flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <span className="ml-3">Generating code modification...</span>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangleIcon className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {modificationResult && (
          <div className="flex flex-col gap-4">
            {modificationResult.status === 'warning' && (
              <Alert>
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>Warning</AlertTitle>
                <AlertDescription>{modificationResult.errorMessage}</AlertDescription>
              </Alert>
            )}

            {modificationResult.status === 'error' && (
              <Alert variant="destructive">
                <AlertTriangleIcon className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{modificationResult.errorMessage}</AlertDescription>
              </Alert>
            )}

            <div>
              <h4 className="font-medium mb-2">Explanation</h4>
              <p className="text-sm">{modificationResult.explanation}</p>
            </div>

            {modificationResult.changes && modificationResult.changes.length > 0 ? (
              <div>
                <h4 className="font-medium mb-2">Changes</h4>
                <div className="space-y-4">
                  {modificationResult.changes.map((change: any, index: number) => (
                    <DiffView 
                      key={index}
                      original={change.original} 
                      modified={change.replacement}
                      lineStart={change.lineStart}
                      lineEnd={change.lineEnd}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm italic">No specific changes reported by the modification agent.</p>
            )}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {modificationResult && modificationResult.status !== 'error' && (
          <Button 
            variant="default" 
            onClick={handleApply}
            disabled={!modificationResult?.modifiedCode}
          >
            <CheckIcon className="mr-2 h-4 w-4" />
            Apply Changes
          </Button>
        )}
      </CardFooter>
    </Card>
  );
} 