import React from 'react';

interface NavigationProps {
  currentPage?: 'home' | 'codebase' | 'tickets';
}

export default function Navigation({ currentPage = 'home' }: NavigationProps) {
  return (
    <nav className="flex items-center gap-4">
      {currentPage !== 'home' && (
        <a
          href="/"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          File Analysis
        </a>
      )}
      
      {currentPage !== 'codebase' && (
        <a
          href="/codebase"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Codebase Analysis
        </a>
      )}
      
      {currentPage !== 'tickets' && (
        <a
          href="/virtual-tickets"
          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          Virtual Tickets
        </a>
      )}
    </nav>
  );
} 