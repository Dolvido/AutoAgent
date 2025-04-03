import { v4 as uuidv4 } from 'uuid';
import type { CritiqueResult } from '@/components/CritiqueResults';
import type { CritiqueIssue } from '@/components/CritiqueCard';
import sqlite3, { Database } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Database file path
const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'autocritic.db');

// SQLite database instance
let db: Database | null = null;

// Initialize database
export async function initializeDatabase() {
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    
    // Create and open database
    db = sqlite3(DB_PATH);
    
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
    
    // Create tables if they don't exist
    db.exec(`
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
    `);
    
    console.log('SQLite database initialized at', DB_PATH);
    return true;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

// Save a critique to the database
export async function saveCritique(critique: CritiqueResult, code: string) {
  try {
    if (!db) {
      await initializeDatabase();
    }
    
    // Begin transaction
    const transaction = db!.transaction(() => {
      // Insert critique
      const insertCritique = db!.prepare(`
        INSERT INTO critiques (id, code, language, summary, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      insertCritique.run(
        critique.id,
        code,
        critique.language,
        critique.summary,
        critique.timestamp
      );
      
      // Insert issues
      const insertIssue = db!.prepare(`
        INSERT INTO issues (id, critique_id, title, description, fix_suggestion, severity)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      critique.issues.forEach(issue => {
        insertIssue.run(
          issue.id,
          critique.id,
          issue.title,
          issue.description,
          issue.fixSuggestion,
          issue.severity
        );
      });
    });
    
    // Execute transaction
    transaction();
    
    return true;
  } catch (error) {
    console.error('Error saving critique:', error);
    throw error;
  }
}

// Save feedback for an issue
export async function saveFeedback(issueId: string, feedbackType: 'accept' | 'reject' | 'ignore') {
  try {
    if (!db) {
      await initializeDatabase();
    }
    
    const id = uuidv4();
    const timestamp = new Date().toISOString();
    
    const insertFeedback = db!.prepare(`
      INSERT INTO feedback (id, issue_id, feedback_type, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    
    insertFeedback.run(id, issueId, feedbackType, timestamp);
    
    return true;
  } catch (error) {
    console.error('Error saving feedback:', error);
    throw error;
  }
}

// Get all critiques
export async function getAllCritiques() {
  try {
    if (!db) {
      await initializeDatabase();
    }
    
    // Query all critiques
    const critiques = db!.prepare(`
      SELECT id, summary, language, timestamp
      FROM critiques
      ORDER BY timestamp DESC
    `).all();
    
    // For each critique, get its issues
    const getIssues = db!.prepare(`
      SELECT id, title, description, fix_suggestion as fixSuggestion, severity
      FROM issues
      WHERE critique_id = ?
    `);
    
    // Get feedback for each issue
    const getFeedback = db!.prepare(`
      SELECT feedback_type as feedbackType
      FROM feedback
      WHERE issue_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    const result = critiques.map((critique: any) => {
      const issues = getIssues.all(critique.id).map((issue: any) => {
        const feedback = getFeedback.get(issue.id);
        return {
          ...issue,
          userFeedback: feedback ? feedback.feedbackType : null
        };
      });
      
      return {
        ...critique,
        issues
      };
    });
    
    return result;
  } catch (error) {
    console.error('Error fetching critiques:', error);
    throw error;
  }
}

// Get a specific critique by ID
export async function getCritiqueById(id: string) {
  try {
    if (!db) {
      await initializeDatabase();
    }
    
    // Query the critique
    const critique = db!.prepare(`
      SELECT id, summary, language, timestamp
      FROM critiques
      WHERE id = ?
    `).get(id);
    
    if (!critique) {
      return null;
    }
    
    // Get issues for the critique
    const issues = db!.prepare(`
      SELECT id, title, description, fix_suggestion as fixSuggestion, severity
      FROM issues
      WHERE critique_id = ?
    `).all(id);
    
    // Get feedback for each issue
    const getFeedback = db!.prepare(`
      SELECT feedback_type as feedbackType
      FROM feedback
      WHERE issue_id = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `);
    
    const issuesWithFeedback = issues.map((issue: any) => {
      const feedback = getFeedback.get(issue.id);
      return {
        ...issue,
        userFeedback: feedback ? feedback.feedbackType : null
      };
    });
    
    return {
      ...critique,
      issues: issuesWithFeedback
    };
  } catch (error) {
    console.error('Error fetching critique:', error);
    throw error;
  }
}

// Get critiques with feedback statistics for meta-agent
export async function getFeedbackStatistics() {
  try {
    if (!db) {
      await initializeDatabase();
    }
    
    // Basic feedback counts by issue type, severity, and language
    const basicStats = db!.prepare(`
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
    `).all();
    
    // Get overall acceptance rate
    const overallAcceptanceRate = db!.prepare(`
      SELECT
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM feedback)) as percentage
      FROM
        feedback f
      GROUP BY
        f.feedback_type
    `).all();
    
    // Get acceptance rates by severity
    const acceptanceRateBySeverity = db!.prepare(`
      SELECT
        i.severity,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (
          SELECT COUNT(*) FROM feedback f2
          JOIN issues i2 ON f2.issue_id = i2.id
          WHERE i2.severity = i.severity
        )) as percentage
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
      GROUP BY
        i.severity, f.feedback_type
    `).all();
    
    // Get acceptance rates by language
    const acceptanceRateByLanguage = db!.prepare(`
      SELECT
        c.language,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (
          SELECT COUNT(*) FROM feedback f2
          JOIN issues i2 ON f2.issue_id = i2.id
          JOIN critiques c2 ON i2.critique_id = c2.id
          WHERE c2.language = c.language
        )) as percentage
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
        JOIN critiques c ON i.critique_id = c.id
      GROUP BY
        c.language, f.feedback_type
    `).all();
    
    // Get acceptance rates by time period (last 7 days, last 30 days, all time)
    const now = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const acceptanceRateByTimePeriod = {
      last7Days: db!.prepare(`
        SELECT
          f.feedback_type,
          COUNT(*) as count,
          (COUNT(*) * 100.0 / (
            SELECT COUNT(*) FROM feedback
            WHERE timestamp >= ?
          )) as percentage
        FROM
          feedback f
        WHERE
          f.timestamp >= ?
        GROUP BY
          f.feedback_type
      `).all(sevenDaysAgo, sevenDaysAgo),
      
      last30Days: db!.prepare(`
        SELECT
          f.feedback_type,
          COUNT(*) as count,
          (COUNT(*) * 100.0 / (
            SELECT COUNT(*) FROM feedback
            WHERE timestamp >= ?
          )) as percentage
        FROM
          feedback f
        WHERE
          f.timestamp >= ?
        GROUP BY
          f.feedback_type
      `).all(thirtyDaysAgo, thirtyDaysAgo),
      
      allTime: overallAcceptanceRate
    };
    
    // Get trends in acceptance rates over time (month by month)
    const acceptanceTrends = db!.prepare(`
      SELECT
        strftime('%Y-%m', f.timestamp) as month,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (
          SELECT COUNT(*) FROM feedback f2
          WHERE strftime('%Y-%m', f2.timestamp) = strftime('%Y-%m', f.timestamp)
        )) as percentage
      FROM
        feedback f
      GROUP BY
        strftime('%Y-%m', f.timestamp), f.feedback_type
      ORDER BY
        month, f.feedback_type
    `).all();
    
    // Get most accepted/rejected issue types
    const issueTypeStats = db!.prepare(`
      SELECT
        i.title as issue_type,
        f.feedback_type,
        COUNT(*) as count,
        (COUNT(*) * 100.0 / (
          SELECT COUNT(*) FROM feedback f2
          JOIN issues i2 ON f2.issue_id = i2.id
          WHERE i2.title = i.title
        )) as percentage
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
      GROUP BY
        i.title, f.feedback_type
      ORDER BY
        count DESC
    `).all();
    
    // Get most effective suggestion patterns
    const effectiveSuggestions = db!.prepare(`
      SELECT
        substr(i.fix_suggestion, 1, 100) as suggestion_start,
        f.feedback_type,
        COUNT(*) as count
      FROM
        feedback f
        JOIN issues i ON f.issue_id = i.id
      WHERE
        f.feedback_type = 'accept'
      GROUP BY
        suggestion_start
      HAVING
        count > 1
      ORDER BY
        count DESC
      LIMIT 10
    `).all();
    
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
    throw error;
  }
} 