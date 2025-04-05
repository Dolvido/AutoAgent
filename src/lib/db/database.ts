import { v4 as uuidv4 } from 'uuid';
import type { CritiqueResult } from '@/components/CritiqueResults';
import type { CritiqueIssue } from '@/components/CritiqueCard';
import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import type { PromptTemplate } from '../default-prompt-template';

// Database file path
const DB_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'autocritic.db');

// SQLite database instance
let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

// Initialize the database connection
export async function initDatabase() {
  if (db) {
    console.log('Database connection already exists.');
    return db;
  }

  try {
    console.log(`Initializing SQLite database connection at ${DB_FILE}...`);
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`Created database directory: ${DB_DIR}`);
    }

    db = await open({
      filename: DB_FILE,
      driver: sqlite3.verbose().Database
    });

    console.log('Database connection opened.');

    // *** Add Logging: Check db object type/methods ***
    if (!db || typeof db.get !== 'function' || typeof db.run !== 'function' || typeof db.all !== 'function' || typeof db.exec !== 'function') {
        console.error('!!! CRITICAL: Database object does not have expected methods (get, run, all, exec). Object:', db);
        throw new Error('Database object initialization failed - missing methods.');
    }
    console.log('Database object seems valid and has expected methods.');

    // Enable foreign keys (using exec for simplicity)
    await db.exec('PRAGMA foreign_keys = ON;');
    console.log('Foreign keys enabled.');

    // Create tables if they don't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS critiques (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        language TEXT NOT NULL,
        summary TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        critique_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        fix_suggestion TEXT NOT NULL,
        severity TEXT NOT NULL,
        FOREIGN KEY (critique_id) REFERENCES critiques(id) ON DELETE CASCADE
      );
      
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        feedback_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
      );

      -- New table for prompt templates
      CREATE TABLE IF NOT EXISTS PromptTemplates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        template TEXT NOT NULL,
        acceptRate REAL DEFAULT 0.5, -- EMA of accept rate
        useCount INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        isActive INTEGER DEFAULT 0, -- 0 for false, 1 for true
        version INTEGER NOT NULL UNIQUE -- Version number
      );

      -- New table for daily performance metrics
      CREATE TABLE IF NOT EXISTS PerformanceMetrics (
        date TEXT PRIMARY KEY, -- YYYY-MM-DD format
        acceptCount INTEGER DEFAULT 0,
        rejectCount INTEGER DEFAULT 0,
        ignoreCount INTEGER DEFAULT 0,
        totalFeedbackCount INTEGER DEFAULT 0,
        promptsUsed TEXT -- Store JSON array of prompt IDs used that day
      );

      -- New table for Virtual Tickets
      CREATE TABLE IF NOT EXISTS VirtualTickets (
        id TEXT PRIMARY KEY, -- e.g., "VT-fae1e8d9"
        status TEXT NOT NULL DEFAULT 'Open', -- e.g., Open, InProgress, Resolved, VerificationFailed, Closed
        title TEXT NOT NULL, -- e.g., "Error handling issues in task_utils.py"
        description TEXT, -- Detailed description of the issue
        severity TEXT, -- e.g., LOW, MEDIUM, HIGH
        filePath TEXT NOT NULL, -- Affected file path
        lineNumber INTEGER, -- Optional: Line number where issue was found
        ruleId TEXT, -- Optional: Specific linter/analyzer rule ID
        originalIssueDetails TEXT, -- Optional: Store JSON of original finding details for verification
        proposedFix TEXT, -- Store the generated diff or code snippet
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      -- New table for learned negative constraints
      CREATE TABLE IF NOT EXISTS LearnedNegativeConstraints (
        id TEXT PRIMARY KEY, -- Unique ID for the constraint
        description TEXT NOT NULL, -- Why the pattern is considered bad/rejected
        patternExample TEXT, -- Example of the pattern (code snippet, issue title keyword, etc.)
        source TEXT, -- e.g., 'meta-agent', 'manual'
        isActive INTEGER DEFAULT 1, -- 1 for active, 0 for inactive
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
        -- Optional: Add score/frequency if needed later
      );
    `);
    
    console.log('Database tables ensured.');

    // *** Add Logging: Attempt a simple test query ***
    try {
      const result = await db.get('SELECT sqlite_version() AS version');
      console.log('*** Simple DB test query successful. SQLite Version:', result?.version);
    } catch (testQueryError) {
      console.error('!!! CRITICAL: Simple test query db.get("SELECT sqlite_version()") FAILED:', testQueryError);
      db = null; // Invalidate db object if test fails
      throw testQueryError; // Re-throw after logging
    }

    console.log('Database initialization successful.');
    return db;
  } catch (error) {
    console.error('Error during database initialization process:', error);
    db = null; // Ensure db is null if init fails
    throw error; // Re-throw the error to be handled by the caller
  }
}

// Save a critique to the database (Refactored for async sqlite)
export async function saveCritique(critique: CritiqueResult, code: string): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    // Begin transaction manually
    await db!.exec('BEGIN');
    
    try {
      // Insert critique
      await db!.run(
        `INSERT INTO critiques (id, code, language, summary, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
        critique.id,
        code,
        critique.language,
        critique.summary,
        critique.timestamp
      );
      
      // Insert issues (iterate and run insert for each)
      // Note: Running inserts one by one might be slower than batching if the library supports it,
      // but it's simpler and safer for async transactions without specific batch support.
      for (const issue of critique.issues) {
        await db!.run(
          `INSERT INTO issues (id, critique_id, title, description, fix_suggestion, severity)
           VALUES (?, ?, ?, ?, ?, ?)`,
          issue.id,
          critique.id,
          issue.title,
          issue.description,
          issue.fixSuggestion,
          issue.severity
        );
      }
      
      // Commit transaction if all inserts succeed
      await db!.exec('COMMIT');
      return true;

    } catch (transactionError) {
      // If any error occurs during the inserts, rollback the transaction
      console.error('Error during saveCritique transaction, rolling back:', transactionError);
      await db!.exec('ROLLBACK');
      return false; // Indicate failure
    }

  } catch (error) {
    // Catch errors outside the transaction block (e.g., BEGIN/COMMIT/ROLLBACK itself)
    console.error('Error executing saveCritique transaction:', error);
    return false;
  }
}

// Save feedback for an issue (Refactored for async sqlite)
export async function saveFeedback(issueId: string, feedbackType: 'accept' | 'reject' | 'ignore'): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    // Use await db.run directly
    await db!.run(
      `INSERT INTO feedback (id, issue_id, feedback_type, timestamp)
       VALUES (?, ?, ?, ?)`,
      id, 
      issueId, 
      feedbackType, 
      timestamp
    );
    
    return true;
  } catch (error) {
    console.error('Error saving feedback:', error);
    // Decide if error should be thrown or just return false
    return false; 
  }
}

// Get all critiques (Refactored for async sqlite)
export async function getAllCritiques(): Promise<CritiqueResult[]> {
  if (!db) await initDatabase();
  try {
    // Query all critiques directly
    const critiques: any[] = await db!.all(`
      SELECT id, summary, language, timestamp
      FROM critiques
      ORDER BY timestamp DESC
    `);
    
    // Use Promise.all to fetch issues and feedback for all critiques concurrently
    const results = await Promise.all(critiques.map(async (critique: any) => {
      // Get issues for this critique
      const issues: any[] = await db!.all(
        `SELECT id, title, description, fix_suggestion as fixSuggestion, severity
         FROM issues
         WHERE critique_id = ?`,
        critique.id
      );
      
      // Get latest feedback for each issue
      const issuesWithFeedback = await Promise.all(issues.map(async (issue: any) => {
        const feedback: any = await db!.get(
          `SELECT feedback_type as feedbackType
           FROM feedback
           WHERE issue_id = ?
           ORDER BY timestamp DESC
           LIMIT 1`,
          issue.id
        );
        return {
          ...issue,
          userFeedback: feedback ? feedback.feedbackType : null
        };
      }));
      
      return {
        ...critique,
        issues: issuesWithFeedback
      };
    }));
    
    return results as CritiqueResult[]; // Assert type after processing

  } catch (error) {
    console.error('Error fetching critiques:', error);
    return []; // Return empty array on error
  }
}

// Get a specific critique by ID (Refactored for async sqlite)
export async function getCritiqueById(id: string): Promise<CritiqueResult | null> {
  if (!db) await initDatabase();
  try {
    // Query the critique directly
    const critique: any = await db!.get(
      `SELECT id, summary, language, timestamp
       FROM critiques
       WHERE id = ?`,
      id
    );
    
    if (!critique) {
      return null;
    }
    
    // Get issues for the critique directly
    const issues: any[] = await db!.all(
      `SELECT id, title, description, fix_suggestion as fixSuggestion, severity
       FROM issues
       WHERE critique_id = ?`,
      id
    );
    
    // Get feedback for each issue
    const issuesWithFeedback = await Promise.all(issues.map(async (issue: any) => {
      const feedback: any = await db!.get(
        `SELECT feedback_type as feedbackType
         FROM feedback
         WHERE issue_id = ?
         ORDER BY timestamp DESC
         LIMIT 1`,
        issue.id
      );
      return {
        ...issue,
        userFeedback: feedback ? feedback.feedbackType : null
      };
    }));
    
    return {
      ...critique,
      issues: issuesWithFeedback
    } as CritiqueResult; // Assert type after processing

  } catch (error) {
    console.error(`Error fetching critique by ID ${id}:`, error);
    return null; // Return null on error
  }
}

// Get critiques with feedback statistics for meta-agent (Refactored for async sqlite)
export async function getFeedbackStatistics() {
  if (!db) await initDatabase();
  try {
    // Basic feedback counts by issue type, severity, and language
    const basicStats = await db!.all(`
      SELECT 
        i.id as issue_id,
        i.title as issue_title,
        i.severity,
        c.language,
        f.feedback_type as feedback_type,
        COUNT(*) as count
      FROM 
        issues i
        JOIN critiques c ON i.critique_id = c.id
        JOIN feedback f ON f.issue_id = i.id
      GROUP BY 
        i.title, f.feedback_type, i.severity, c.language
      ORDER BY 
        count DESC
    `);
    
    // Get overall acceptance rate
    const overallAcceptanceRate = await db!.all(`
      SELECT
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback)) as percentage
      FROM
        feedback f
      GROUP BY
        f.feedback_type
    `);
    
    // Get acceptance rates by severity
    const acceptanceRateBySeverity = await db!.all(`
      SELECT
        i.severity,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback f2 JOIN issues i2 ON f2.issue_id = i2.id WHERE i2.severity = i.severity)) as percentage
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
      GROUP BY
        i.severity, f.feedback_type
    `);
    
    // Get acceptance rates by language
    const acceptanceRateByLanguage = await db!.all(`
      SELECT
        c.language,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback f2 JOIN issues i2 ON f2.issue_id = i2.id JOIN critiques c2 ON i2.critique_id = c2.id WHERE c2.language = c.language)) as percentage
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
        JOIN critiques c ON i.critique_id = c.id
      GROUP BY
        c.language, f.feedback_type
    `);
    
    // Get acceptance rates by time period (last 7 days, last 30 days, all time)
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const [last7DaysStats, last30DaysStats] = await Promise.all([
      db!.all(`
        SELECT
          f.feedback_type,
          COUNT(*) as count,
          (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback WHERE timestamp >= ?)) as percentage
        FROM feedback f
        WHERE f.timestamp >= ?
        GROUP BY f.feedback_type
      `, sevenDaysAgo, sevenDaysAgo),
      db!.all(`
        SELECT
          f.feedback_type,
          COUNT(*) as count,
          (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback WHERE timestamp >= ?)) as percentage
        FROM feedback f
        WHERE f.timestamp >= ?
        GROUP BY f.feedback_type
      `, thirtyDaysAgo, thirtyDaysAgo)
    ]);

    const acceptanceRateByTimePeriod = {
      last7Days: last7DaysStats,
      last30Days: last30DaysStats,
      allTime: overallAcceptanceRate // Reuse the already fetched overall rate
    };
    
    // Get trends in acceptance rates over time (month by month)
    const acceptanceTrends = await db!.all(`
      SELECT
        strftime('%Y-%m', f.timestamp) as month,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback f2 WHERE strftime('%Y-%m', f2.timestamp) = strftime('%Y-%m', f.timestamp))) as percentage
      FROM feedback f
      GROUP BY strftime('%Y-%m', f.timestamp), f.feedback_type
      ORDER BY month, f.feedback_type
    `);
    
    // Get most accepted/rejected issue types
    const issueTypeStats = await db!.all(`
      SELECT
        i.title as issue_type,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback f2 JOIN issues i2 ON f2.issue_id = i2.id WHERE i2.title = i.title)) as percentage
      FROM feedback f
      JOIN issues i ON f.issue_id = i.id
      GROUP BY i.title, f.feedback_type
      ORDER BY count DESC
    `);
    
    // Get most effective suggestion patterns
    const effectiveSuggestions = await db!.all(`
      SELECT
        substr(i.fix_suggestion, 1, 100) as suggestion_start,
        f.feedback_type,
        COUNT(*) as count
      FROM feedback f
      JOIN issues i ON f.issue_id = i.id
      WHERE f.feedback_type = 'accept'
      GROUP BY suggestion_start
      HAVING count > 1
      ORDER BY count DESC
      LIMIT 10
    `);
    
    // Combine all statistics into a comprehensive report
    return {
      basicStats,
      overallAcceptanceRate,
      acceptanceRateBySeverity,
      acceptanceRateByLanguage,
      acceptanceRateByTimePeriod,
      acceptanceTrends,
      issueTypeStats,
      effectiveSuggestions,
      lastUpdated: now
    };
  } catch (error) {
    console.error('Error fetching feedback statistics:', error);
    // Return null or a default structure on error
    return null; 
  }
}

// --- Prompt Template Functions ---

// Save or update a prompt template
export async function savePromptTemplate(prompt: PromptTemplate): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    await db!.run(
      `INSERT INTO PromptTemplates (id, name, description, template, acceptRate, useCount, createdAt, isActive, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name,
         description=excluded.description,
         template=excluded.template,
         acceptRate=excluded.acceptRate,
         useCount=excluded.useCount,
         createdAt=excluded.createdAt,
         isActive=excluded.isActive,
         version=excluded.version`, 
      prompt.id,
      prompt.name,
      prompt.description,
      prompt.template,
      prompt.acceptRate,
      prompt.useCount,
      prompt.createdAt,
      prompt.isActive ? 1 : 0,
      prompt.version
    );
    return true;
  } catch (error) {
    console.error('Error saving prompt template:', error);
    return false;
  }
}

// Get a prompt template by ID
export async function getPromptTemplateById(id: string): Promise<PromptTemplate | null> {
  if (!db) await initDatabase();
  try {
    const row: any = await db!.get('SELECT * FROM PromptTemplates WHERE id = ?', id);
    if (!row) return null;
    return { ...row, isActive: row.isActive === 1 }; 
  } catch (error) {
    console.error(`Error getting prompt template by ID ${id}:`, error);
    return null; // Return null on error
  }
}

// Get all prompt templates
export async function getAllPromptTemplates(): Promise<PromptTemplate[]> {
  if (!db) await initDatabase();
  try {
    const rows: any[] = await db!.all('SELECT * FROM PromptTemplates ORDER BY version ASC');
    return rows.map((row: any) => ({ ...row, isActive: row.isActive === 1 }));
  } catch (error) {
    console.error('Error getting all prompt templates:', error);
    return [];
  }
}

// Get the currently active prompt template
export async function getActivePromptTemplateFromDb(): Promise<PromptTemplate | null> {
  if (!db) await initDatabase();
  try {
    const row: any = await db!.get('SELECT * FROM PromptTemplates WHERE isActive = 1');
    if (!row) return null;
    return { ...row, isActive: row.isActive === 1 };
  } catch (error) {
    console.error('Error getting active prompt template:', error);
    return null;
  }
}

// Set a specific prompt template as active
export async function setActivePromptTemplateInDb(id: string): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    // Deactivate all first
    await db!.run('UPDATE PromptTemplates SET isActive = 0');
    // Activate the target one
    await db!.run('UPDATE PromptTemplates SET isActive = 1 WHERE id = ?', id);
    return true;
  } catch (error) {
    console.error('Error setting active prompt template:', error);
    return false;
  }
}

// Update prompt usage count
export async function updatePromptUsageInDb(id: string): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    await db!.run('UPDATE PromptTemplates SET useCount = useCount + 1 WHERE id = ?', id);
    return true;
  } catch (error) {
    console.error('Error updating prompt usage count:', error);
    return false;
  }
}

// Update prompt accept rate (e.g., using EMA calculated beforehand)
export async function updatePromptAcceptRateInDb(id: string, newRate: number): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    await db!.run('UPDATE PromptTemplates SET acceptRate = ? WHERE id = ?', newRate, id);
    return true;
  } catch (error) {
    console.error('Error updating prompt accept rate:', error);
    return false;
  }
}

// --- Performance Metrics Functions ---

// Record performance metric for a given day
export async function recordPerformanceMetric(date: string, feedbackType: 'accept' | 'reject' | 'ignore', promptId: string): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    // Determine which count to increment
    let columnToIncrement = '';
    if (feedbackType === 'accept') columnToIncrement = 'acceptCount';
    else if (feedbackType === 'reject') columnToIncrement = 'rejectCount';
    else columnToIncrement = 'ignoreCount';

    // Upsert the metric for the day
    await db!.run(
      `INSERT INTO PerformanceMetrics (date, ${columnToIncrement}, totalFeedbackCount, promptsUsed)
       VALUES (?, 1, 1, json(?))
       ON CONFLICT(date) DO UPDATE SET
         ${columnToIncrement} = ${columnToIncrement} + 1,
         totalFeedbackCount = totalFeedbackCount + 1,
         promptsUsed = CASE
           WHEN json_valid(promptsUsed) AND NOT EXISTS (
             SELECT 1 FROM json_each(promptsUsed) WHERE value = excluded.promptsUsed ->> '$[0]'
           ) THEN json_insert(promptsUsed, '$[#]', json_extract(excluded.promptsUsed, '$[0]'))
           ELSE promptsUsed
         END`,
      date, 
      JSON.stringify([promptId]), 
    );
    return true;
  } catch (error) {
    console.error('Error recording performance metric:', error);
    return false;
  }
}

// Get performance metrics (example: retrieve all for simplicity)
export async function getPerformanceMetrics(): Promise<any[]> { // Consider defining a proper return type
  if (!db) await initDatabase();
  try {
    const rows: any[] = await db!.all('SELECT * FROM PerformanceMetrics ORDER BY date DESC');
    return rows.map((row: any) => ({
      ...row,
      promptsUsed: JSON.parse(row.promptsUsed || '[]')
    }));
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    return [];
  }
}

// --- Virtual Ticket Functions ---

// Update the status of a virtual ticket
export async function updateTicketStatusInDb(ticketId: string, newStatus: string): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    const now = new Date().toISOString();
    const result = await db!.run(
      'UPDATE VirtualTickets SET status = ?, updatedAt = ? WHERE id = ?',
      newStatus,
      now, // Update the updatedAt timestamp
      ticketId
    );
    // Check if any row was actually updated
    const success = result.changes !== undefined && result.changes > 0;
    if (!success) {
        console.warn(`Attempted to update status for ticket ${ticketId} to ${newStatus}, but ticket was not found or status was unchanged.`);
    }
    return success; 
  } catch (error) {
    console.error(`Error updating status for ticket ${ticketId} to ${newStatus}:`, error);
    return false;
  }
}

// --- Negative Constraint Functions ---

// Save or update a negative constraint
export async function saveNegativeConstraint(constraint: {
  id?: string; // Optional: provide ID for updates
  description: string;
  patternExample?: string;
  source?: string;
}): Promise<boolean> {
  if (!db) await initDatabase();
  try {
    const now = new Date().toISOString();
    const id = constraint.id || uuidv4(); // Generate ID if not provided
    
    await db!.run(
      `INSERT INTO LearnedNegativeConstraints (id, description, patternExample, source, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         description=excluded.description,
         patternExample=excluded.patternExample,
         source=excluded.source,
         isActive=excluded.isActive, -- Keep existing isActive on conflict, or explicitly set?
         updatedAt=excluded.updatedAt`,
      id,
      constraint.description,
      constraint.patternExample || null, // Use null if undefined
      constraint.source || 'meta-agent', // Default source
      now, // createdAt for INSERT
      now  // updatedAt for INSERT and UPDATE
    );
    return true;
  } catch (error) {
    console.error('Error saving negative constraint:', error);
    return false;
  }
}

// Get all active negative constraints
export async function getActiveNegativeConstraints(): Promise<Array<{id: string, description: string, patternExample: string | null}>> {
  if (!db) await initDatabase();
  try {
    const constraints: any[] = await db!.all(
      'SELECT id, description, patternExample FROM LearnedNegativeConstraints WHERE isActive = 1'
    );
    return constraints;
  } catch (error) {
    console.error('Error fetching active negative constraints:', error);
    return []; // Return empty array on error
  }
}

// TODO: Add functions to create/get/list VirtualTickets as needed by the UI/workflow
// export async function createVirtualTicket(...) { ... }
// export async function getVirtualTicketById(...) { ... }
// export async function getAllVirtualTickets(...) { ... } 