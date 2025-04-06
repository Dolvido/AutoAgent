"use server";

import { v4 as uuidv4 } from 'uuid';
import { modifyCode } from './code-modifier';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'child_process';
import type { CritiqueIssue } from '@/components/CritiqueCard';
import { updateTicketWithModification } from '@/lib/virtual-ticket';

// Type alias for clarity
type Issue = CritiqueIssue;

export interface ModificationPlan {
  id: string;
  issue: Issue;
  affectedFiles: string[];
  description: string;
  status: 'planned' | 'in_progress' | 'completed' | 'failed';
  timestamp: string;
}

interface FileModificationResult {
  file: string;
  status: 'success' | 'error';
  patch?: string;
  error?: string;
}

export interface PatchResult {
  id: string;
  ticketId: string;
  patchContent: string;
  appliedSuccessfully: boolean;
  results?: FileModificationResult[];
  error?: string;
}

/**
 * Generate a Git patch for a modified file
 */
export async function generateGitPatch(
  originalPath: string,
  modifiedContent: string,
  workingDir: string = process.cwd()
): Promise<string> {
  try {
    // Create temporary file with modified content
    const tempDir = path.join(workingDir, '.auto-agent-temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Get relative path to maintain proper git paths
    const relativePath = path.relative(workingDir, originalPath);
    const tempFile = path.join(tempDir, path.basename(originalPath));
    
    // Write modified content to temp file
    fs.writeFileSync(tempFile, modifiedContent);
    
    // Generate diff between original and temp file
    const diffCommand = `git --no-pager diff --no-index --patch "${originalPath}" "${tempFile}"`;
    const diffOutput = execSync(diffCommand, { 
      cwd: workingDir,
      encoding: 'utf-8'
    });
    
    // Remove temp file and directory
    fs.unlinkSync(tempFile);
    if (fs.readdirSync(tempDir).length === 0) {
      fs.rmdirSync(tempDir);
    }
    
    // Process patch to make it applicable (adjust paths)
    const processedPatch = diffOutput
      .replace(/^--- .*$/m, `--- a/${relativePath}`)
      .replace(/^\+\+\+ .*$/m, `+++ b/${relativePath}`);
    
    return processedPatch;
  } catch (error: any) {
    console.error('Error generating git patch:', error);
    throw new Error(`Failed to generate git patch: ${error.message}`);
  }
}

/**
 * Apply a Git patch to the working directory
 */
export async function applyGitPatch(
  patchContent: string,
  workingDir: string = process.cwd()
): Promise<boolean> {
  try {
    // Create a temporary patch file
    const tempPatchFile = path.join(workingDir, `.patch-${uuidv4()}.patch`);
    fs.writeFileSync(tempPatchFile, patchContent);
    
    // Apply the patch
    try {
      execSync(`git apply --check "${tempPatchFile}"`, { 
        cwd: workingDir,
        stdio: 'pipe'
      });
      
      execSync(`git apply "${tempPatchFile}"`, { 
        cwd: workingDir,
        stdio: 'pipe'
      });
      
      // Remove temp patch file
      fs.unlinkSync(tempPatchFile);
      return true;
    } catch (applyError: any) {
      console.error('Error applying git patch:', applyError);
      
      // Remove temp patch file
      if (fs.existsSync(tempPatchFile)) {
        fs.unlinkSync(tempPatchFile);
      }
      
      return false;
    }
  } catch (error: any) {
    console.error('Error in applyGitPatch:', error);
    return false;
  }
}

/**
 * Create a modification plan for a ticket
 */
export async function createModificationPlan(
  issue: Issue,
  affectedFiles: string[]
): Promise<ModificationPlan> {
  return {
    id: `MP-${uuidv4().slice(0, 8)}`,
    issue,
    affectedFiles,
    description: `Fix for: ${issue.title}`,
    status: 'planned',
    timestamp: new Date().toISOString()
  };
}

/**
 * Execute a modification plan and create a patch
 */
export async function executeModificationPlan(
  plan: ModificationPlan,
  ticketId: string,
  workingDir: string = process.cwd()
): Promise<PatchResult> {
  try {
    const results: FileModificationResult[] = [];
    let hasError = false;
    let combinedPatch = '';
    
    // Process each affected file
    for (const filePath of plan.affectedFiles) {
      try {
        const fullPath = path.resolve(workingDir, filePath);
        
        // Read original file
        if (!fs.existsSync(fullPath)) {
          console.error(`File does not exist: ${fullPath}`);
          throw new Error(`File does not exist: ${filePath}`);
        }
        
        const originalCode = fs.readFileSync(fullPath, 'utf-8');
        
        // Modify code using LLM
        const modificationResult = await modifyCode(
          originalCode,
          path.extname(filePath).substring(1) || 'txt',
          plan.issue
        );
        
        // Update the virtual ticket with the modification
        await updateTicketWithModification(ticketId, modificationResult);
        
        // Generate patch for this file
        if (modificationResult.status === 'success') {
          const patch = await generateGitPatch(
            fullPath,
            modificationResult.modifiedCode,
            workingDir
          );
          
          combinedPatch += patch + '\n';
          results.push({
            file: filePath,
            status: 'success',
            patch
          });
        } else {
          hasError = true;
          results.push({
            file: filePath,
            status: 'error',
            error: modificationResult.errorMessage
          });
        }
      } catch (fileError: any) {
        hasError = true;
        results.push({
          file: filePath,
          status: 'error',
          error: fileError.message
        });
      }
    }
    
    return {
      id: `PATCH-${uuidv4().slice(0, 8)}`,
      ticketId,
      patchContent: combinedPatch,
      appliedSuccessfully: !hasError && combinedPatch.length > 0,
      results
    };
  } catch (error: any) {
    console.error('Error executing modification plan:', error);
    
    return {
      id: `PATCH-${uuidv4().slice(0, 8)}`,
      ticketId,
      patchContent: '',
      appliedSuccessfully: false,
      error: error.message
    };
  }
}