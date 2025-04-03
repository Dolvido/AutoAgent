"use client";

import { useState, useEffect } from "react";

interface CodeEditorProps {
  language: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export default function CodeEditor({ 
  language, 
  defaultValue = "", 
  onChange 
}: CodeEditorProps) {
  const [value, setValue] = useState(defaultValue);
  const [darkMode, setDarkMode] = useState(false);
  
  // Update when defaultValue changes
  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);
  
  // Update theme based on system preference
  useEffect(() => {
    const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(isDarkMode);
    
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setDarkMode(e.matches);
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    onChange?.(newValue);
  };

  return (
    <div className="h-full relative flex flex-col">
      <div className="absolute top-2 right-2 text-xs text-gray-500 dark:text-gray-400 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded">
        {language}
      </div>
      <textarea
        value={value}
        onChange={handleChange}
        className={`w-full h-full p-4 resize-none font-mono text-sm border-none outline-none ${
          darkMode 
            ? 'bg-gray-900 text-gray-100' 
            : 'bg-gray-50 text-gray-900'
        }`}
        placeholder={`// Enter your ${language} code here`}
        spellCheck="false"
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
} 