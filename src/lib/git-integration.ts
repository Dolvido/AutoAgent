import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { VirtualTicket } from './virtual-ticket';

const execAsync = promisify(exec);

// Helper function to get Git repository root
async function getRepoRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd });
    return path.normalize(stdout.trim());
  } catch (error) {
    throw new Error(`Failed to determine Git repository root from '${cwd}': ${error}`);
  }
}

interface GitOptions {
  workingDir?: string; // The target directory for operations (may be a subdir)
  repoRoot?: string;   // The root of the git repository
  targetPath?: string; // Path relative to repoRoot (usually relative path of workingDir)
  branchPrefix?: string;
  commitTemplate?: string;
}

const DEFAULT_OPTIONS: GitOptions = {
  // workingDir will be set dynamically or default to process.cwd()
  branchPrefix: 'auto-fix',
  commitTemplate: 'fix: {title} [AutoAgent #{id}]'
};

/**
 * Checks if a directory is inside a git repository
 */
export async function isGitRepository(options: { workingDir?: string } = {}): Promise<boolean> {
  const cwd = options.workingDir || process.cwd();
  
  try {
    // Use --resolve-git-dir to check if *any* git repo controls this path
    await execAsync('git rev-parse --resolve-git-dir .', { cwd });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Gets the current git branch name from the repository root
 */
export async function getCurrentBranch(options: { repoRoot?: string } = {}): Promise<string> {
  const cwd = options.repoRoot || process.cwd(); // Assume repoRoot if provided, else cwd might be root
  
  try {
    // Ensure we run this from the repo root if specified
    const { stdout } = await execAsync('git branch --show-current', { cwd });
    return stdout.trim();
  } catch (error) {
    console.error(`Failed to get current branch in ${cwd}:`, error);
    throw new Error(`Failed to get current branch in ${cwd}`);
  }
}

/**
 * Creates a new branch for the fix from the repository root
 */
export async function createFixBranch(ticket: VirtualTicket, options: { repoRoot: string, branchPrefix?: string, id?: string }): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options }; // Merge with defaults, requires repoRoot
  const cwd = opts.repoRoot; // Commands must run from root
  
  // Generate a branch name
  const safeName = (ticket.title || 'fix') // Add default title if missing
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
    
  const branchName = `${opts.branchPrefix}/${ticket.id}-${safeName}`.substring(0, 250); // Ensure branch name isn't too long
  
  try {
    // Create and checkout the new branch from repo root
    await execAsync(`git checkout -b ${branchName}`, { cwd });
    console.log(`Created and checked out branch '${branchName}' in ${cwd}`);
    return branchName;
  } catch (error: any) {
    // Check if the error is because the branch already exists
    if (error.stderr && error.stderr.includes('already exists')) {
        console.warn(`Branch '${branchName}' already exists. Attempting to check it out instead.`);
        try {
            // Just check out the existing branch
            await execAsync(`git checkout ${branchName}`, { cwd });
            console.log(`Checked out existing branch '${branchName}' in ${cwd}`);
            return branchName; // Success, return the branch name
        } catch (checkoutError: any) {
            // Failed to checkout the existing branch
            console.error(`Failed to checkout existing branch '${branchName}' in ${cwd}:`, checkoutError);
            throw new Error(`Failed to create or checkout branch '${branchName}': ${checkoutError.message || checkoutError}`);
        }
    } else {
        // Different error occurred during branch creation
        console.error(`Failed to create branch '${branchName}' in ${cwd}:`, error);
        throw new Error(`Failed to create branch '${branchName}': ${error.message || error}`);
    }
  }
}

/**
 * Applies code modifications using git apply from the repository root.
 * The patch is applied relative to the targetPath within the repository.
 */
export async function applyCodeModification(
  ticket: VirtualTicket, 
  options: { repoRoot: string, targetPath: string } // Requires repoRoot and targetPath
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const repoRoot = opts.repoRoot;
  const targetPath = opts.targetPath; // Path relative to repo root where changes should apply

  if (!ticket.modifiedCode?.modifiedCode?.trim()) {
    // If the diff is empty or whitespace only, skip applying.
    // Log a warning as this might indicate an issue with diff generation.
    console.warn(`Ticket ${ticket.id}: No valid code modification diff found to apply. Skipping apply step.`);
    // Consider if we should throw an error or allow proceeding without changes.
    // For now, let's proceed, assuming an empty diff means no changes were intended or possible.
    return;
  }

  let diffContent = ticket.modifiedCode.modifiedCode;

  // Pre-process diff content: remove a/ b/ prefixes, prepend targetPath if needed, normalize paths
  console.log(`Ticket ${ticket.id}: Original diff content:\n${diffContent}`);
  diffContent = diffContent
    .split(/\r?\n/)
    .map(line => {
      if (line.startsWith('--- a/') || line.startsWith('+++ b/')) {
        let filePath = line.substring(5).replace(/\\/g, '/'); // Get path after prefix, normalize slashes
        // Prepend targetPath if it's not the root ('.')
        if (targetPath !== '.' && targetPath !== '') {
           // Use path.join for robust path concatenation, then normalize
           filePath = path.join(targetPath, filePath).replace(/\\/g, '/'); 
        }
        // Reconstruct the line prefix with the adjusted path
        return line.startsWith('---') ? `--- ${filePath}` : `+++ ${filePath}`;
      } else if (line.startsWith('--- ') || line.startsWith('+++ ')) { 
        // Handle cases where a/ or b/ might be missing but prefix exists
        const parts = line.split(/\s+/);
        if (parts.length > 1) {
          let filePath = parts[1].replace(/\\/g, '/'); // Normalize slashes
          // Prepend targetPath if it's not the root ('.')
          if (targetPath !== '.' && targetPath !== '') {
             filePath = path.join(targetPath, filePath).replace(/\\/g, '/');
          }
          parts[1] = filePath;
          return parts.join(' ');
        }
      }
      return line;
    })
    .join('\n');
  console.log(`Ticket ${ticket.id}: Pre-processed diff content (paths relative to repo root):\n${diffContent}`);

  // Clean the diff content before writing (trim trailing whitespace, ensure LF endings)
  diffContent = diffContent
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .join('\n');
    
  // Ensure the diff content ends with a newline, as patches often require it
  if (!diffContent.endsWith('\n')) {
      diffContent += '\n';
  }

  // Create patch file in the repo root for easier cleanup and path handling
  const patchFileName = `vt-patch-${ticket.id}-${Date.now()}.patch`;
  const patchFilePath = path.join(repoRoot, patchFileName); // Place patch file in repo root

  try {
    // Write the diff content to a temporary patch file in the repo root
    fs.writeFileSync(patchFilePath, diffContent);
    console.log(`Ticket ${ticket.id}: Wrote diff to temporary patch file: ${patchFilePath}`);

    // Apply the patch file using git apply from the repo root
    // Ensure targetPath is correctly quoted if it contains spaces
    // REMOVED --directory option as paths in patch are now relative to repoRoot
    const applyCommand = `git apply --reject --whitespace=fix "${patchFileName}"`; 
    console.log(`Ticket ${ticket.id}: Attempting to apply patch file from ${repoRoot}...`);
    console.log(`Executing: ${applyCommand}`);
    await execAsync(applyCommand, { cwd: repoRoot }); // Run from repoRoot
    console.log(`Ticket ${ticket.id}: Successfully applied patch file.`);

    // Now stage the changes that were applied to the working directory
    const addCommand = `git add -- "${targetPath}"`; // Use -- to separate path from options
    console.log(`Ticket ${ticket.id}: Staging applied changes within '${targetPath}' relative to ${repoRoot}...`);
    console.log(`Executing: ${addCommand}`);
    await execAsync(addCommand, { cwd: repoRoot });
    console.log(`Ticket ${ticket.id}: Successfully staged applied changes within '${targetPath}'.`);

  } catch (error: any) {
    // If apply fails, provide more context
    console.error(`Ticket ${ticket.id}: Failed to apply patch file '${patchFileName}' from directory '${repoRoot}' targeting '${targetPath}'.`, error);
    console.error("Error details:", error.stderr || error.stdout || error.message);
    
    // Check if reject files were created within the target directory
    const targetFullPath = path.join(repoRoot, targetPath);
    let rejectFiles: string[] = [];
    try {
        if (fs.existsSync(targetFullPath)) {
            rejectFiles = fs.readdirSync(targetFullPath).filter(f => f.endsWith('.rej'));
        }
    } catch (readDirError) {
        console.error(`Failed to read target directory ${targetFullPath} for .rej files:`, readDirError);
    }

    if (rejectFiles.length > 0) {
      console.error(`Patch application failed. Reject files created in ${targetFullPath}: ${rejectFiles.join(', ')}. Manual intervention may be required.`);
    } else {
      console.error("Patch application failed, but no .rej files were found in the target directory.");
    }
    // Re-throw the error to stop the commit process
    throw new Error(`Failed to apply code modification patch for ticket ${ticket.id}: ${error.message}`);
  } finally {
    // Clean up the temporary patch file
    if (fs.existsSync(patchFilePath)) {
      try {
        fs.unlinkSync(patchFilePath);
        console.log(`Ticket ${ticket.id}: Cleaned up temporary patch file: ${patchFilePath}`);
      } catch (cleanupError) {
        console.error(`Ticket ${ticket.id}: Failed to clean up patch file ${patchFilePath}:`, cleanupError);
        // Log error but don't throw, as the main operation might have succeeded or failed already.
      }
    }
  }
}

/**
 * Commits changes to the repository from the repository root.
 * Stages only the files within the targetPath.
 */
export async function commitChanges(
  ticket: VirtualTicket, 
  options: { repoRoot: string, targetPath: string, commitTemplate?: string } // Requires repoRoot and targetPath
): Promise<{ commitId: string, commitMessage: string }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const repoRoot = opts.repoRoot;
  const targetPath = opts.targetPath; // Relative path to stage
  
  // Create the commit message from template
  let commitMessage = (opts.commitTemplate || DEFAULT_OPTIONS.commitTemplate!)
    .replace('{title}', ticket.title)
    .replace('{id}', ticket.id);
  
  try {
    // Check if there are actually changes staged before committing
    // This check remains important to avoid empty commits if the patch resulted in no actual changes
    const statusCmd = `git status --porcelain -- "${targetPath}"`;
    const { stdout: statusOutput } = await execAsync(statusCmd, { cwd: repoRoot });
    if (!statusOutput.trim()) {
        console.warn(`Ticket ${ticket.id}: No changes were staged within '${targetPath}'. Skipping commit.`);
        // Return a placeholder or handle as needed. Maybe throw if a commit was expected?
        // Let's return an empty commitId to indicate no commit was made.
        return { commitId: '', commitMessage: 'No changes staged' }; 
    }

    // Create commit from repo root
    console.log(`Creating commit in ${repoRoot} with message: "${commitMessage}"`);
    await execAsync(`git commit -m "${commitMessage}"`, { cwd: repoRoot });
    
    // Get the commit ID from repo root
    console.log(`Fetching commit ID from ${repoRoot}...`);
    const { stdout } = await execAsync('git rev-parse HEAD', { cwd: repoRoot });
    const commitId = stdout.trim();
    
    return { commitId, commitMessage };
  } catch (error) {
    throw new Error(`Failed to commit changes: ${error}`);
  }
}

/**
 * Main function to apply a fix and create a commit from a virtual ticket.
 * Handles initializing a new repo if the target directory isn't already one.
 * Correctly operates when the working directory is a subdirectory of a git repo.
 */
export async function applyFix(
  ticket: VirtualTicket, 
  options: { workingDir?: string, branchPrefix?: string, commitTemplate?: string } = {}
): Promise<{ commitId: string, commitMessage: string, branchName: string }> {
  const initialWorkingDir = path.resolve(options.workingDir || process.cwd()); // Absolute path of the target dir
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options, workingDir: initialWorkingDir };
  
  let repoRoot: string;
  let targetPath: string; // Path of initialWorkingDir relative to repoRoot
  let originalBranch: string | null = null;
  let isNewRepo = false;
  let branchName: string | null = null;

  // 1. Determine Repository Root and Target Path
  const isRepo = await isGitRepository({ workingDir: initialWorkingDir });

  if (isRepo) {
    repoRoot = await getRepoRoot(initialWorkingDir);
    targetPath = path.relative(repoRoot, initialWorkingDir);
    if (targetPath === '') targetPath = '.'; // Use '.' if workingDir is the root
    console.log(`Detected Git repository root: '${repoRoot}'`);
    console.log(`Target path relative to root: '${targetPath}'`);
    
    // Get current branch from the actual repo root
    originalBranch = await getCurrentBranch({ repoRoot });
    console.log(`Current branch in '${repoRoot}': ${originalBranch}`);

    // Check for uncommitted changes within the target path relative to the repo root
    const hasChanges = await hasUncommittedChanges({ repoRoot, targetPath });
    if (hasChanges) {
      throw new Error(`There are uncommitted changes within the target path '${targetPath}'. Please commit or stash them before applying fixes.`);
    }

  } else {
    // Not in a repo, initialize one AT the working directory
    console.log(`Working directory '${initialWorkingDir}' is not a Git repository. Initializing...`);
    repoRoot = initialWorkingDir; // The working dir becomes the repo root
    targetPath = '.'; // Target path is the root itself
    await initializeGitRepository({ workingDir: repoRoot }); // Pass the absolute path
    isNewRepo = true;
    originalBranch = await getCurrentBranch({ repoRoot }); // Get default branch ('main' or 'master')
    console.log(`Initialized new repository at '${repoRoot}'. Current branch: ${originalBranch}`);
    // No need to check for uncommitted changes in a brand new repo with initial commit
  }

  // Prepare options for subsequent git operations
  const gitExecOptions = { 
    repoRoot, 
    targetPath, 
    branchPrefix: mergedOptions.branchPrefix, 
    commitTemplate: mergedOptions.commitTemplate 
  };

  try {
    // 2. Create a new branch (from repo root)
    branchName = await createFixBranch(ticket, { ...gitExecOptions, id: ticket.id });
    
    // 3. Apply the code modification (from repo root, targeting relative path)
    await applyCodeModification(ticket, gitExecOptions);
    
    // 4. Commit the changes (from repo root, adding only relative path)
    const { commitId, commitMessage } = await commitChanges(ticket, gitExecOptions);
    
    // 5. Return to the original branch (from repo root)
    if (originalBranch && branchName !== originalBranch) { // Avoid checking out the same branch
      console.log(`Returning to original branch '${originalBranch}'...`);
      await execAsync(`git checkout ${originalBranch}`, { cwd: repoRoot });
    } else if (!originalBranch) {
      console.warn("Could not determine original branch to return to.");
    } else {
        console.log(`Already on the original branch '${originalBranch}'. No checkout needed.`);
    }
    
    // Return result including the possibly empty commitId
    return { commitId, commitMessage, branchName };

  } catch (error) {
    console.error(`Error during applyFix process for ticket ${ticket.id}:`, error);
    // Attempt to clean up: return to original branch if possible
    if (originalBranch && branchName && branchName !== originalBranch) {
      try {
        console.log(`Attempting to return to original branch '${originalBranch}' after error...`);
        await execAsync(`git checkout ${originalBranch}`, { cwd: repoRoot });
      } catch (checkoutError) {
        console.error(`Failed to return to original branch '${originalBranch}' during error cleanup:`, checkoutError);
        // Log additional info: perhaps the branch we created doesn't exist anymore?
      }
    }
    // Re-throw the original error
    throw error;
  }
}

/**
 * Checks if there are any uncommitted changes within a specific path relative to the repository root.
 */
export async function hasUncommittedChanges(options: { repoRoot: string, targetPath: string }): Promise<boolean> {
  const { repoRoot, targetPath } = options;

  try {
    // Use --porcelain to get easily parseable output
    // Use -- "${targetPath}" to limit the status check to the specific directory/path
    // Ensure targetPath is quoted
    const command = `git status --porcelain -- "${targetPath}"`;
    console.log(`Checking for uncommitted changes within '${targetPath}' relative to ${repoRoot}...`);
    console.log(`Executing: ${command}`);
    const { stdout } = await execAsync(command, { cwd: repoRoot });
    
    const hasChanges = !!stdout.trim();
    if (hasChanges) {
      console.log(`Uncommitted changes detected within '${targetPath}'.`);
      // console.log("Changes:\n", stdout.trim()); // Optional: Log specific changes
    } else {
      console.log(`No uncommitted changes detected within '${targetPath}'.`);
    }
    return hasChanges;

  } catch (error: any) {
    // Handle cases where git status fails (e.g., repo corruption?)
    console.error(`Failed to check git status for path '${targetPath}' in '${repoRoot}':`, error);
    throw new Error(`Failed to check git status for path '${targetPath}' in '${repoRoot}': ${error.message}`);
  }
}

/**
 * Runs a git command via the default shell, ensuring it runs from the repo root.
 * DEPRECATED? Consider removing if direct execAsync is sufficient.
 */
export async function runGitCommand(
  command: string,
  options: { repoRoot: string } // Requires repoRoot
): Promise<string> {
  const { repoRoot } = options;
  
  try {
    // Execute the command ensuring the current directory is the repo root
    console.log(`Executing git command from ${repoRoot}: ${command}`);
    const { stdout } = await execAsync(command, { cwd: repoRoot });
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`);
  }
}

/**
 * Initializes a new Git repository in the specified directory.
 * Should be called with the absolute path intended as the repository root.
 */
export async function initializeGitRepository(options: { workingDir: string }): Promise<void> {
  const cwd = options.workingDir; // Expecting absolute path

  console.log(`Initializing new Git repository in '${cwd}'...`);

  try {
    // 1. Initialize the repository
    await execAsync('git init', { cwd });
    console.log('Git repository initialized.');

    // 2. Stage all existing files
    await execAsync('git add .', { cwd });
    console.log('Staged all files for initial commit.');

    // 3. Create an initial commit
    // Use --allow-empty in case the directory was empty, though git add . might fail first
    // Use a standard initial commit message
    await execAsync('git commit -m "Initial commit [AutoAgent]" --allow-empty', { cwd });
    console.log('Created initial commit.');

  } catch (error: any) {
    console.error(`Failed to initialize Git repository in '${cwd}':`, error);
    // Add more specific error checking if needed (e.g., directory doesn't exist)
    if (error.code === 'ENOENT') {
        throw new Error(`Directory '${cwd}' not found for Git initialization.`);
    }
    throw new Error(`Failed to initialize Git repository in '${cwd}': ${error.message}`);
  }
}