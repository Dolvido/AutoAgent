# scripts/reset_test_project.py
import subprocess
import os
import argparse
import sys

# Define the explicit path to the Git executable
GIT_EXECUTABLE = r"C:\Program Files\Git\cmd\git.exe" # Use raw string for Windows path

def run_command(cmd, cwd):
    """Runs a command in a subprocess and handles errors, using the full Git path."""

    # Replace 'git' command with the full path if it's the command being run
    original_cmd = list(cmd) # Keep a copy for error messages
    if cmd[0] == 'git':
        cmd = [GIT_EXECUTABLE] + cmd[1:]

    print(f"Running in {cwd}: {' '.join(cmd)}")
    try:
        # Use shell=False (default) now that we have the full path
        result = subprocess.run(cmd, cwd=cwd, check=True, capture_output=True, text=True, encoding='utf-8')
        # Print stdout line by line to handle potential multi-line output better
        for line in result.stdout.splitlines():
            print(line)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {' '.join(original_cmd)}", file=sys.stderr) # Use original cmd in error
        print(f"Full command attempted: {' '.join(cmd)}", file=sys.stderr)
        print(f"Return code: {e.returncode}", file=sys.stderr)
        print(f"Stderr: {e.stderr}", file=sys.stderr)
        print(f"Stdout: {e.stdout}", file=sys.stderr)
        return None # Indicate failure
    except FileNotFoundError:
        # This error should now only happen if GIT_EXECUTABLE is wrong
        print(f"Error: Command '{cmd[0]}' not found. Is the GIT_EXECUTABLE path correct?", file=sys.stderr)
        print(f"Path used: {GIT_EXECUTABLE}", file=sys.stderr)
        sys.exit(1) # Exit if Git executable is fundamentally wrong
    except Exception as e: # Catch other potential errors like encoding issues
        print(f"An unexpected error occurred running {' '.join(original_cmd)}: {e}", file=sys.stderr)
        return None # Indicate failure

def get_main_branch_name(repo_path):
    """Determines the main branch name (main or master)."""
    # Check for 'main'
    if run_command(["git", "show-ref", "--verify", "--quiet", "refs/heads/main"], repo_path) is not None:
        print("Detected main branch: main")
        return "main"
    # Check for 'master' if 'main' not found
    if run_command(["git", "show-ref", "--verify", "--quiet", "refs/heads/master"], repo_path) is not None:
        print("Detected main branch: master")
        return "master"

    print("Error: Could not determine main branch (neither 'main' nor 'master' found).", file=sys.stderr)
    return None

def reset_repository(repo_path):
    """Resets the Git repository at the given path to a clean state."""
    # Check if the path is a directory and contains .git
    git_dir = os.path.join(repo_path, ".git")
    if not os.path.isdir(repo_path) or not os.path.isdir(git_dir):
        print(f"'{repo_path}' does not appear to be an initialized Git repository.", file=sys.stderr)
        return # Don't proceed if it's not a repo

    print(f"--- Resetting Git repository: {repo_path} ---")

    # 1. Determine main branch
    main_branch = get_main_branch_name(repo_path)
    if not main_branch:
        print("Aborting reset due to missing main branch.", file=sys.stderr)
        return

    # 2. Stash any potential leftover changes (useful if reset/clean fail partially)
    print("Attempting to stash potential leftovers...")
    # Use subprocess.run directly to handle non-zero exit code gracefully if nothing to stash
    stash_result = subprocess.run([GIT_EXECUTABLE, "stash", "push", "--include-untracked", "-m", "AutoAgentResetStash"], cwd=repo_path, capture_output=True, text=True, encoding='utf-8')
    if stash_result.returncode == 0 and "No local changes" not in stash_result.stdout:
        print("Stashed changes. Dropping stash...")
        # Use run_command to drop the stash, ensuring errors are caught if drop fails
        drop_output = run_command(["git", "stash", "drop"], repo_path)
        if drop_output is None:
            print("Warning: Failed to drop stash. Manual cleanup might be needed ('git stash list').", file=sys.stderr)
    elif stash_result.returncode != 0:
         print(f"Stash command failed (may be expected if no changes). Stderr: {stash_result.stderr.strip()}")
    else:
        print("No local changes to stash.")


    # 3. Checkout main branch
    print(f"Switching to branch: {main_branch}")
    if run_command(["git", "checkout", main_branch], repo_path) is None:
         print(f"Error: Failed to switch to branch {main_branch}. Aborting further potentially destructive actions.", file=sys.stderr)
         return # Stop if we can't switch

    # Confirm we are on the main branch now
    current_branch_check = run_command(["git", "branch", "--show-current"], repo_path)
    if current_branch_check != main_branch:
         print(f"Error: Failed to confirm switch to branch {main_branch} (Current: {current_branch_check}). Aborting.", file=sys.stderr)
         return

    # 4. Fetch latest changes for the main branch from origin (optional but good practice)
    print(f"Fetching latest changes for {main_branch}...")
    if run_command(["git", "fetch", "origin", main_branch], repo_path) is None:
        print(f"Warning: Failed to fetch origin/{main_branch}. Resetting to local {main_branch}.", file=sys.stderr)
        reset_target = "HEAD" # Reset to local HEAD if fetch failed
    else:
        reset_target = f"origin/{main_branch}" # Reset to origin's version if fetch succeeded
        print(f"Successfully fetched origin/{main_branch}.")


    # 5. Force reset to the state of the fetched main branch HEAD (or local if fetch failed)
    print(f"Resetting index and working directory to {reset_target}...")
    if run_command(["git", "reset", "--hard", reset_target], repo_path) is None:
         print(f"Error: Failed hard reset on branch {main_branch} to {reset_target}. State might be inconsistent.", file=sys.stderr)
         return # Stop if reset failed


    # 6. Remove all untracked files and directories
    print("Cleaning untracked files...")
    # -f: force, -d: directories, -x: ignored files too (like .rej, .patch)
    if run_command(["git", "clean", "-fdx"], repo_path) is None:
         print(f"Warning: Failed git clean. Untracked files might remain.", file=sys.stderr)


    # 7. Delete all local branches except the main one
    print("Deleting other local branches...")
    branches_output = run_command(["git", "branch"], repo_path)
    if branches_output:
        # Filter branches more carefully
        branches = [b.strip().replace('* ', '') for b in branches_output.splitlines() if b.strip()]
        deleted_count = 0
        failed_deletions = []
        for branch_name in branches:
            if branch_name != main_branch:
                print(f"Deleting branch: {branch_name}")
                if run_command(["git", "branch", "-D", branch_name], repo_path) is not None:
                    deleted_count += 1
                else:
                    # If delete failed, maybe it has upstream tracking? Try without -D
                    print(f"Force delete failed for {branch_name}, trying regular delete...")
                    if run_command(["git", "branch", "-d", branch_name], repo_path) is not None:
                         deleted_count +=1
                    else:
                        print(f"Warning: Failed to delete branch {branch_name}", file=sys.stderr)
                        failed_deletions.append(branch_name)

        print(f"Deleted {deleted_count} other local branches.")
        if failed_deletions:
             print(f"Could not delete branches: {', '.join(failed_deletions)}", file=sys.stderr)
    else:
         print("Could not list branches or no other branches found.")


    print("--- Repository reset complete ---")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset a Git repository to a clean state on the main branch.")
    parser.add_argument("repo_path", nargs='?', default="./test_project",
                        help="Path to the Git repository to reset (default: ./test_project)")
    args = parser.parse_args()

    # Ensure GIT_EXECUTABLE exists before proceeding
    if not os.path.isfile(GIT_EXECUTABLE): # Use isfile for executables
        print(f"FATAL ERROR: Git executable not found at the specified path: {GIT_EXECUTABLE}", file=sys.stderr)
        print("Please correct the GIT_EXECUTABLE variable in the script.", file=sys.stderr)
        sys.exit(1)

    repo_full_path = os.path.abspath(args.repo_path)

    # Check if path exists *before* checking if it's a valid directory/repo
    if not os.path.exists(repo_full_path):
         print(f"Error: Provided path '{repo_full_path}' does not exist.", file=sys.stderr)
         sys.exit(1)
    elif not os.path.isdir(repo_full_path):
        print(f"Error: Provided path '{repo_full_path}' is not a valid directory.", file=sys.stderr)
        sys.exit(1)

    reset_repository(repo_full_path)