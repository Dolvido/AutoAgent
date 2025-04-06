"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import CritiqueResults, { CritiqueResult } from "../components/CritiqueResults";
import FileUpload from "../components/FileUpload";
import Navigation from "../components/Navigation";
import CodeModification from "../components/CodeModification";
import { CritiqueIssue } from "../components/CritiqueCard";
import { createTicketFromIssue } from "@/lib/virtual-ticket";

// Dynamically import CodeEditor with no SSR to prevent hydration issues
const CodeEditor = dynamic(() => import("../components/CodeEditor"), {
  ssr: false,
});

export default function Home() {
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("javascript");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [critique, setCritique] = useState<CritiqueResult | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  // States for fix proposal modal
  const [isFixProposalOpen, setIsFixProposalOpen] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<CritiqueIssue | null>(null);
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  // Handle language change
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLanguage(e.target.value);
  };

  // Handle code change from editor
  const handleCodeChange = (value: string) => {
    setCode(value);
  };

  // Handle critique submission
  const handleCritiqueSubmit = async () => {
    if (!code.trim()) return;

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/critique', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, language }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get critique');
      }
      
      const data = await response.json();
      setCritique(data.critique);
    } catch (error) {
      console.error("Error getting critique:", error);
      // Handle error state
    } finally {
      setIsLoading(false);
    }
  };

  // Handle feedback from critique
  const handleFeedback = async (type: "accept" | "reject" | "ignore", issueId: string) => {
    try {
      // Send feedback to API
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          issueId, 
          feedbackType: type 
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save feedback');
      }
      
      // Update UI to reflect feedback
      setCritique(prev => {
        if (!prev) return null;
        
        return {
          ...prev,
          issues: prev.issues.map(issue => 
            issue.id === issueId ? { ...issue, userFeedback: type } : issue
          ) as any
        };
      });
    } catch (error) {
      console.error(`Error saving ${type} feedback for issue ${issueId}:`, error);
    }
  };

  // Handle copy fix
  const handleCopyFix = (fix: string) => {
    navigator.clipboard.writeText(fix);
    // Could add a toast notification here
  };

  // Handle regenerate critique
  const handleRegenerate = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // In a real implementation, this would request a new critique from the backend
    }, 1500);
  };

  // Handle view fix proposal
  const handleViewFixProposal = async (issue: CritiqueIssue) => {
    setSelectedIssue(issue);
    setIsFixProposalOpen(true);
    
    // If the user opens a fix proposal for a high-severity issue, 
    // automatically create a virtual ticket in the background
    if (issue.severity === "high" && !isCreatingTicket) {
      try {
        setIsCreatingTicket(true);
        
        // Create a more descriptive filename based on the issue
        let filePath = "unknown";
        
        // If we have code, create a recognizable filename
        if (code.trim()) {
          // Create a filename based on the issue title and language
          const sanitizedTitle = issue.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '_')
            .substring(0, 30);
          
          filePath = `${sanitizedTitle}.${language}`;
          console.log(`Created filename: ${filePath}`);
        }
        
        // Create a virtual ticket via API
        const response = await fetch('/api/virtual-ticket', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            issue,
            filePath,
            code,
            language,
            // Don't send basePath as it's likely causing issues
            customFilename: true // Flag to indicate we're using a custom filename
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const ticket = await response.json();
        console.log("Created virtual ticket for high-severity issue:", ticket);
        
        // Show a success message
        alert(`Created virtual ticket: ${ticket.id} for issue: ${issue.title}`);
      } catch (error) {
        console.error("Failed to create virtual ticket:", error);
      } finally {
        setIsCreatingTicket(false);
      }
    }
  };

  // Handle apply code modification
  const handleApplyModification = (modifiedCode: string) => {
    // Update the code in the editor
    setCode(modifiedCode);
    // Close the modal
    setIsFixProposalOpen(false);
    setSelectedIssue(null);
  };

  // Handle creating a ticket from an issue
  const handleCreateTicket = async (issue: CritiqueIssue) => {
    try {
      setIsLoading(true);
      
      // Create a more descriptive filename based on the issue
      let filePath = "unknown";
      
      // If we have code, create a recognizable filename
      if (code.trim()) {
        // Create a filename based on the issue title and language
        const sanitizedTitle = issue.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .substring(0, 30);
        
        filePath = `${sanitizedTitle}.${language}`;
        console.log(`Created filename: ${filePath}`);
      }
      
      // Create a virtual ticket via API
      const response = await fetch('/api/virtual-ticket', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          issue,
          filePath,
          code,
          language,
          // Don't send basePath as it's likely causing issues
          customFilename: true // Flag to indicate we're using a custom filename
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const ticket = await response.json();
      console.log("Created virtual ticket:", ticket);
      
      // Show a success message
      alert(`Created virtual ticket: ${ticket.id}\nView it in the Virtual Tickets page`);
    } catch (error) {
      console.error("Failed to create virtual ticket:", error);
      alert("Failed to create ticket. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`flex flex-col min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <header className="border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Auto-Critic</h1>
          <div className="flex items-center gap-4">
            <button
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle dark mode"
              onClick={toggleDarkMode}
            >
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
            </button>
            <Navigation currentPage="home" />
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col">
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold">Code Input</h2>
              <div className="flex gap-2">
                <select
                  className="px-3 py-1 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800"
                  value={language}
                  onChange={handleLanguageChange}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="typescript">TypeScript</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="csharp">C#</option>
                  <option value="go">Go</option>
                  <option value="rust">Rust</option>
                </select>
                <FileUpload 
                  onFileContent={(content, detectedLanguage) => {
                    setCode(content);
                    setLanguage(detectedLanguage);
                  }} 
                />
              </div>
            </div>
            
            <div className="border border-gray-300 dark:border-gray-700 rounded-lg h-[500px] mb-4">
              <CodeEditor 
                language={language} 
                onChange={handleCodeChange}
                defaultValue={code}
              />
            </div>
            
            <button
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md w-full md:w-auto md:self-end"
              onClick={handleCritiqueSubmit}
              disabled={isLoading || !code.trim()}
            >
              {isLoading ? "Analyzing..." : "Critique Code"}
            </button>
          </div>
          
          <div className="flex flex-col">
            <h2 className="text-xl font-semibold mb-4">Code Critique</h2>
            <div className="border border-gray-300 dark:border-gray-700 rounded-lg h-[500px] overflow-auto">
              <CritiqueResults
                critique={critique}
                isLoading={isLoading}
                onFeedback={handleFeedback}
                onCopyFix={handleCopyFix}
                onRegenerate={handleRegenerate}
                onViewFixProposal={handleViewFixProposal}
                onCreateTicket={handleCreateTicket}
              />
            </div>
          </div>
        </div>

        {/* Browse Directory Method Card */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">Browse Directory</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Select a directory on your computer (Chrome/Edge only, uses File System Access API).
          </p>
          {directoryHandle ? (
            <div className="text-sm text-green-700 dark:text-green-400">
              Directory already selected and ready for analysis!
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-500">Please use the main 'Analyze Selected Directory' button below once a directory is chosen via other means or if API is unavailable.</p>
          )}
        </div>
      </main>
      
      <footer className="border-t border-gray-200 dark:border-gray-800 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Auto-Critic - Offline AI-powered code critique assistant
        </div>
      </footer>

      {/* Fix Proposal Modal */}
      {isFixProposalOpen && selectedIssue && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl w-full h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-medium">Fix Proposal</h3>
              <button 
                onClick={() => {
                  setIsFixProposalOpen(false);
                  setSelectedIssue(null);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <CodeModification
                originalCode={code}
                issue={selectedIssue}
                language={language}
                onApply={handleApplyModification}
                onCancel={() => {
                  setIsFixProposalOpen(false);
                  setSelectedIssue(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
