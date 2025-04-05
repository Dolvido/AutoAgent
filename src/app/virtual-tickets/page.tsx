'use client';

import { useState, useEffect } from 'react';
import VirtualTicketManager from '@/components/VirtualTicketManager';
import Navigation from '@/components/Navigation';

export default function VirtualTicketsPage() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Check for dark mode on component mount
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(isDark);
  }, []);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="dark:bg-gray-900 dark:text-white min-h-screen">
        <header className="border-b border-gray-200 dark:border-gray-700">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-xl font-bold">Auto-Agent: Virtual Tickets</h1>
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
              <Navigation currentPage="tickets" />
            </div>
          </div>
        </header>
        
        <main className="container mx-auto py-6 px-4">
          <VirtualTicketManager />
        </main>
        
        <footer className="border-t border-gray-200 dark:border-gray-800 py-4">
          <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Auto-Critic - Offline AI-powered code critique assistant
          </div>
        </footer>
      </div>
    </div>
  );
} 