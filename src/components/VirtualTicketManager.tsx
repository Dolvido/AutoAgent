import React, { useState, useEffect } from 'react';
// import ReactDiffViewer from 'react-diff-viewer'; // Import the viewer
import type { VirtualTicket } from '@/lib/virtual-ticket';

interface VirtualTicketManagerProps {
  onClose?: () => void;
}

// Color mapping for ticket status
const statusColors: Record<string, string> = {
  open: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  rejected: 'bg-red-500'
};

// Format status for display
const formatStatus = (status: string): string => {
  return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
};

// Ticket list item component
const TicketItem = ({ 
  ticket, 
  onSelect 
}: { 
  ticket: VirtualTicket; 
  onSelect: (ticket: VirtualTicket) => void;
}) => {
  return (
    <div 
      className="p-3 border rounded-md mb-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
      onClick={() => onSelect(ticket)}
    >
      <div className="flex justify-between items-start">
        <div>
          <div className="font-medium">{ticket.title}</div>
          <div className="text-sm text-gray-500">{ticket.id}</div>
        </div>
        <span className={`px-2 py-1 text-xs text-white rounded-full ${statusColors[ticket.status]}`}>
          {formatStatus(ticket.status)}
        </span>
      </div>
      <div className="mt-2 text-sm">{ticket.description}</div>
      <div className="mt-2 text-xs text-gray-500">
        File: {ticket.affectedFiles.join(', ')}
      </div>
      <div className="mt-1 text-xs text-gray-500">
        Created: {new Date(ticket.created).toLocaleString()}
      </div>
    </div>
  );
};

// Ticket detail component
const TicketDetail = ({
  ticket,
  onApplyFix,
  onClose,
  onGenerateFix
}: {
  ticket: VirtualTicket;
  onApplyFix: (ticket: VirtualTicket) => void;
  onClose: () => void;
  onGenerateFix: (ticket: VirtualTicket) => void;
}) => {
  return (
    <div className="border rounded-lg shadow-sm">
      <div className="p-4 border-b">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold">{ticket.title}</h2>
            <p className="text-sm text-gray-500">{ticket.id}</p>
          </div>
          <span className={`px-2 py-1 text-xs text-white rounded-full ${statusColors[ticket.status]}`}>
            {formatStatus(ticket.status)}
          </span>
        </div>
      </div>
      
      <div className="p-4 space-y-4">
        <div>
          <h4 className="font-medium mb-1">Description</h4>
          <p className="text-sm">{ticket.description}</p>
        </div>
        
        <div>
          <h4 className="font-medium mb-1">Affected Files</h4>
          <ul className="text-sm list-disc list-inside">
            {ticket.affectedFiles.map((file, index) => (
              <li key={index}>{file}</li>
            ))}
          </ul>
        </div>
        
        {ticket.modifiedCode && (
          <div>
            <h4 className="font-medium mb-1">Code Modification</h4>
            <div className="text-sm">
              <p>Review the proposed changes (diff format) below:</p>
              {/* Basic Diff Highlighting using Tailwind */}
              <div className="mt-2 text-xs rounded-md overflow-auto max-h-96 border dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <pre className="whitespace-pre font-mono p-2">
                  {(ticket.modifiedCode?.modifiedCode || "No diff generated or diff is empty.").split('\n').map((line, index) => {
                    let lineClass = "";
                    let lineContent = line;
                    if (line.startsWith('+')) {
                      lineClass = "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300";
                      // Keep the + sign for clarity in diff
                    } else if (line.startsWith('-')) {
                      lineClass = "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300";
                      // Keep the - sign
                    } else if (line.startsWith('@@')) {
                      lineClass = "text-blue-600 dark:text-blue-400";
                    } else {
                      // Context lines
                      lineClass = "text-gray-600 dark:text-gray-400";
                      // Add a space prefix for alignment if line is not empty
                      // lineContent = line ? ` ${line}` : line; // Optional: indent context
                    }
                    return (
                      <div key={index} className={lineClass}>
                        {/* Render line content, ensuring empty lines are still rendered */}
                        {lineContent || '\u00A0'} {/* Use non-breaking space for empty lines */}
                      </div>
                    );
                  })}
                </pre>
               </div>
            </div>
          </div>
        )}
        
        {ticket.commitId && (
          <div>
            <h4 className="font-medium mb-1">Commit Information</h4>
            <div className="text-sm">
              <p><strong>Commit ID:</strong> {ticket.commitId.slice(0, 7)}</p>
              <p><strong>Message:</strong> {ticket.commitMessage}</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="p-4 flex justify-end gap-2 border-t">
        <button 
          className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100"
          onClick={onClose}
        >
          Close
        </button>
        
        {ticket.status === 'open' && (
          <button
            onClick={() => onGenerateFix(ticket)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Generate Fix
          </button>
        )}
        
        {ticket.status === 'in_progress' && (
          <button
            onClick={() => onApplyFix(ticket)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Apply Fix to Git
          </button>
        )}
      </div>
    </div>
  );
};

export default function VirtualTicketManager({ onClose }: VirtualTicketManagerProps) {
  const [tickets, setTickets] = useState<VirtualTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<VirtualTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<any>(null);
  
  // Fetch all tickets
  const fetchTickets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/virtual-ticket');
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      setTickets(data);
    } catch (err: any) {
      console.error('Error fetching tickets:', err);
      setError(err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };
  
  // Apply fix to git
  const applyFix = async (ticket: VirtualTicket) => {
    setApplying(true);
    setApplyResult(null);
    setError(null);
    
    try {
      const response = await fetch('/api/git-apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          workingDir: ticket.basePath
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const result = await response.json();
      setApplyResult(result);
      
      // Refresh tickets to get the updated one
      fetchTickets();
      
      // Update selected ticket
      setSelectedTicket(result.ticket);
    } catch (err: any) {
      console.error('Error applying fix:', err);
      setError(err.message || 'Failed to apply fix');
    } finally {
      setApplying(false);
    }
  };

  // Generate fix for a ticket
  const generateFix = async (ticket: VirtualTicket) => {
    setGenerating(true);
    setGenerateResult(null);
    setError(null);
    
    try {
      // Check affected files
      if (ticket.affectedFiles.length === 0) {
        throw new Error('No affected files specified in ticket');
      }
      
      // Don't join the path here, let the server handle it using the ticket's basePath
      const filePath = ticket.affectedFiles[0];
      
      const response = await fetch('/api/generate-fix', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticketId: ticket.id,
          filePath: filePath,
          description: ticket.sourceIssue.description
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }
      
      const result = await response.json();
      setGenerateResult(result);
      
      // Refresh tickets to get the updated one
      fetchTickets();
      
      // Update selected ticket
      setSelectedTicket(result.ticket);
    } catch (err: any) {
      console.error('Error generating fix:', err);
      setError(err.message || 'Failed to generate fix');
    } finally {
      setGenerating(false);
    }
  };
  
  // Load tickets on mount
  useEffect(() => {
    fetchTickets();
  }, []);
  
  // Filter tickets by status
  const openTickets = tickets.filter(ticket => ticket.status === 'open');
  const inProgressTickets = tickets.filter(ticket => ticket.status === 'in_progress');
  const completedTickets = tickets.filter(ticket => ticket.status === 'completed');
  const rejectedTickets = tickets.filter(ticket => ticket.status === 'rejected');
  
  // Get tickets based on active tab
  const getTicketsForTab = () => {
    switch (activeTab) {
      case 'open': return openTickets;
      case 'in_progress': return inProgressTickets;
      case 'completed': return completedTickets;
      case 'rejected': return rejectedTickets;
      default: return tickets;
    }
  };
  
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Virtual Tickets</h2>
        <div className="flex gap-2">
          {tickets.length > 0 && (
            <button 
              className="px-3 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50"
              onClick={async () => {
                if (confirm('Are you sure you want to delete all tickets? This action cannot be undone.')) {
                  try {
                    const response = await fetch('/api/virtual-ticket/clear-all', {
                      method: 'POST',
                    });
                    
                    if (!response.ok) {
                      throw new Error('Failed to clear tickets');
                    }
                    
                    fetchTickets();
                    setSelectedTicket(null);
                    setApplyResult({
                      message: 'All tickets have been deleted'
                    });
                  } catch (err: any) {
                    setError(err.message || 'Failed to clear tickets');
                  }
                }
              }}
            >
              Clear All Tickets
            </button>
          )}
          {onClose && (
            <button 
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-800 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {applyResult && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded">
          <strong>Success!</strong> {applyResult.message || 'Operation completed successfully'}
          {applyResult.git && (
            <p>
              Created branch: <code className="bg-gray-100 px-1 py-0.5 rounded">{applyResult.git.branchName}</code> with commit <code className="bg-gray-100 px-1 py-0.5 rounded">{applyResult.git.commitId.slice(0, 7)}</code>
            </p>
          )}
        </div>
      )}
      
      {generating ? (
        <div className="py-8 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3">Generating fix...</span>
        </div>
      ) : generateResult && (
        <div className="mb-4 p-3 bg-green-100 border border-green-300 text-green-800 rounded">
          <strong>Success!</strong> {generateResult.message || 'Fix generated successfully'}
          {generateResult.git && (
            <p>
              Created branch: <code className="bg-gray-100 px-1 py-0.5 rounded">{generateResult.git.branchName}</code> with commit <code className="bg-gray-100 px-1 py-0.5 rounded">{generateResult.git.commitId.slice(0, 7)}</code>
            </p>
          )}
        </div>
      )}
      
      {loading ? (
        <div className="py-8 flex justify-center items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-3">Loading tickets...</span>
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium">No virtual tickets found</h3>
          <p className="text-gray-500">Create tickets by selecting issues from code critiques</p>
        </div>
      ) : selectedTicket ? (
        <TicketDetail 
          ticket={selectedTicket} 
          onApplyFix={applyFix}
          onClose={() => setSelectedTicket(null)} 
          onGenerateFix={generateFix}
        />
      ) : (
        <div>
          {/* Tabs */}
          <div className="flex border-b mb-4">
            <button
              className={`px-4 py-2 ${activeTab === 'all' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('all')}
            >
              All ({tickets.length})
            </button>
            <button
              className={`px-4 py-2 ${activeTab === 'open' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('open')}
            >
              Open ({openTickets.length})
            </button>
            <button
              className={`px-4 py-2 ${activeTab === 'in_progress' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('in_progress')}
            >
              In Progress ({inProgressTickets.length})
            </button>
            <button
              className={`px-4 py-2 ${activeTab === 'completed' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed ({completedTickets.length})
            </button>
            <button
              className={`px-4 py-2 ${activeTab === 'rejected' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('rejected')}
            >
              Rejected ({rejectedTickets.length})
            </button>
          </div>
          
          {/* Ticket list */}
          <div className="space-y-4">
            {getTicketsForTab().map(ticket => (
              <TicketItem 
                key={ticket.id} 
                ticket={ticket} 
                onSelect={setSelectedTicket} 
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 