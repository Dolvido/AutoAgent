#!/usr/bin/env ts-node

/**
 * AutoAgent Performance Evaluation Script
 * 
 * This script analyzes feedback data and metrics collected from the critique agent
 * to provide insights on its performance and learning progress.
 */

import { 
  initDatabase, 
  getFeedbackStatistics, 
  getPerformanceMetrics,
  getAllPromptTemplates
} from '../src/lib/db/database';

// Main function to run the evaluation
async function evaluateAgentPerformance() {
  console.log('Initializing database connection...');
  await initDatabase();
  
  // Fetch all necessary data
  const [stats, performanceMetrics, prompts] = await Promise.all([
    getFeedbackStatistics(),
    getPerformanceMetrics(),
    getAllPromptTemplates()
  ]);
  
  if (!stats) {
    console.log('No feedback data available for evaluation. Please use the agent first.');
    return;
  }
  
  // Display overall statistics
  console.log('\n========== OVERALL STATISTICS ==========');
  console.log('Last updated:', stats.lastUpdated);
  
  // Format and display acceptance rates
  console.log('\n----- Feedback Distribution -----');
  stats.overallAcceptanceRate.forEach((rate: any) => {
    console.log(`${rate.feedback_type.toUpperCase()}: ${rate.count} (${rate.percentage.toFixed(2)}%)`);
  });
  
  // Display trend data
  console.log('\n----- Acceptance Rate Trends -----');
  console.log('Last 7 days:');
  displayFeedbackRates(stats.acceptanceRateByTimePeriod.last7Days || []);
  
  console.log('\nLast 30 days:');
  displayFeedbackRates(stats.acceptanceRateByTimePeriod.last30Days || []);
  
  // Display acceptance by severity
  console.log('\n----- Acceptance by Severity -----');
  const severityGroups = groupBy(stats.acceptanceRateBySeverity as any[], 'severity');
  
  Object.entries(severityGroups).forEach(([severity, rates]) => {
    console.log(`\n${severity.toUpperCase()}:`);
    displayFeedbackRates(rates);
  });
  
  // Display acceptance by language
  console.log('\n----- Acceptance by Language -----');
  const languageGroups = groupBy(stats.acceptanceRateByLanguage as any[], 'language');
  
  Object.entries(languageGroups).forEach(([language, rates]) => {
    console.log(`\n${language}:`);
    displayFeedbackRates(rates);
  });
  
  // Most effective issue types
  console.log('\n----- Most Effective Issue Types -----');
  const issuesByAcceptance = stats.issueTypeStats
    .filter((stat: any) => stat.feedback_type === 'accept')
    .sort((a: any, b: any) => b.percentage - a.percentage)
    .slice(0, 5);
  
  issuesByAcceptance.forEach((issue: any, index: number) => {
    console.log(`${index + 1}. ${issue.issue_type} - ${issue.percentage.toFixed(2)}% acceptance rate (${issue.count} accepts)`);
  });
  
  // Least effective issue types
  console.log('\n----- Least Effective Issue Types -----');
  const issuesByRejection = stats.issueTypeStats
    .filter((stat: any) => stat.feedback_type === 'reject')
    .sort((a: any, b: any) => b.percentage - a.percentage)
    .slice(0, 5);
  
  issuesByRejection.forEach((issue: any, index: number) => {
    console.log(`${index + 1}. ${issue.issue_type} - ${issue.percentage.toFixed(2)}% rejection rate (${issue.count} rejects)`);
  });
  
  // Prompt template performance
  console.log('\n========== PROMPT TEMPLATE PERFORMANCE ==========');
  prompts.sort((a, b) => b.acceptRate - a.acceptRate);
  
  prompts.forEach((prompt, index) => {
    console.log(`\n${index + 1}. ${prompt.name} (v${prompt.version})${prompt.isActive ? ' [ACTIVE]' : ''}`);
    console.log(`   Description: ${prompt.description}`);
    console.log(`   Acceptance Rate: ${(prompt.acceptRate * 100).toFixed(2)}%`);
    console.log(`   Usage Count: ${prompt.useCount}`);
    console.log(`   Created: ${new Date(prompt.createdAt).toLocaleString()}`);
  });
  
  // Display monthly trends
  console.log('\n========== MONTHLY TRENDS ==========');
  const trendsByMonth = groupBy(stats.acceptanceTrends, 'month');
  
  Object.keys(trendsByMonth).sort().forEach(month => {
    console.log(`\n${month}:`);
    displayFeedbackRates(trendsByMonth[month]);
  });
  
  // Self-improvement assessment
  console.log('\n========== SELF-IMPROVEMENT ASSESSMENT ==========');
  assessSelfImprovement(stats, performanceMetrics, prompts, issuesByRejection);
}

// Helper function to display feedback rates
function displayFeedbackRates(rates: any[]) {
  if (!rates || rates.length === 0) {
    console.log('  No data available');
    return;
  }
  
  const ratesObject: Record<string, any> = {};
  rates.forEach(rate => {
    ratesObject[rate.feedback_type] = {
      count: rate.count,
      percentage: rate.percentage
    };
  });
  
  const acceptRate = ratesObject.accept ? ratesObject.accept.percentage.toFixed(2) + '%' : 'N/A';
  const rejectRate = ratesObject.reject ? ratesObject.reject.percentage.toFixed(2) + '%' : 'N/A';
  const ignoreRate = ratesObject.ignore ? ratesObject.ignore.percentage.toFixed(2) + '%' : 'N/A';
  
  console.log(`  Accept: ${acceptRate} | Reject: ${rejectRate} | Ignore: ${ignoreRate}`);
}

// Helper function to assess self-improvement
function assessSelfImprovement(stats: any, metrics: any[], prompts: any[], issuesByRejection: any[]) {
  // Calculate overall self-improvement metrics
  const activePromptVersion = prompts.find(p => p.isActive)?.version || 1;
  const totalPromptVersions = prompts.length;
  const promptImprovementCount = totalPromptVersions - 1;
  
  console.log(`Prompt versions created: ${totalPromptVersions} (${promptImprovementCount} improvements)`);
  console.log(`Current active version: v${activePromptVersion}`);
  
  // Calculate trend in acceptance rate
  if (stats.acceptanceTrends.length > 1) {
    const sortedTrends = [...stats.acceptanceTrends]
      .filter((t: any) => t.feedback_type === 'accept')
      .sort((a: any, b: any) => a.month.localeCompare(b.month));
    
    if (sortedTrends.length >= 2) {
      const oldestMonth = sortedTrends[0];
      const newestMonth = sortedTrends[sortedTrends.length - 1];
      
      const rateChange = newestMonth.percentage - oldestMonth.percentage;
      console.log(`\nAcceptance rate change from ${oldestMonth.month} to ${newestMonth.month}: ${rateChange.toFixed(2)}%`);
      
      if (rateChange > 0) {
        console.log('✅ IMPROVING: Acceptance rate is trending upward');
      } else if (rateChange < 0) {
        console.log('❌ DECLINING: Acceptance rate is trending downward');
      } else {
        console.log('➖ STABLE: Acceptance rate is stable');
      }
    }
  }
  
  // Assess prompt effectiveness improvement
  if (prompts.length >= 2) {
    const sortedPrompts = [...prompts].sort((a, b) => a.version - b.version);
    const firstPrompt = sortedPrompts[0];
    const latestPrompt = sortedPrompts[sortedPrompts.length - 1];
    
    const promptRateChange = latestPrompt.acceptRate - firstPrompt.acceptRate;
    console.log(`\nPrompt acceptance rate change from v1 to v${latestPrompt.version}: ${(promptRateChange * 100).toFixed(2)}%`);
    
    if (promptRateChange > 0) {
      console.log('✅ IMPROVING: Prompt quality is improving');
    } else if (promptRateChange < 0) {
      console.log('❌ DECLINING: Prompt quality is declining');
    } else {
      console.log('➖ STABLE: Prompt quality is stable');
    }
  }
  
  // Overall assessment  
  console.log('\nRECOMMENDATIONS:');
  
  // Check if we need more data
  if (Object.keys(stats.issueTypeStats).length < 10) {
    console.log('- Collect more critique data for better assessment');
  }
  
  // Check lowest performing issue types
  if (issuesByRejection.length > 0) {
    console.log(`- Consider removing issue type "${issuesByRejection[0].issue_type}" from critique scope`);
  }
  
  // Check if prompts need improvement
  const activePrompt = prompts.find(p => p.isActive);
  if (activePrompt && activePrompt.acceptRate < 0.5) {
    console.log('- Current active prompt has acceptance rate below 50%, consider running meta-agent analysis');
  }
}

// Helper function to group array by key
function groupBy(array: any[], key: string) {
  return array.reduce((result, currentItem) => {
    (result[currentItem[key]] = result[currentItem[key]] || []).push(currentItem);
    return result;
  }, {});
}

// Run the evaluation
evaluateAgentPerformance().catch(error => {
  console.error('Error evaluating agent performance:', error);
  process.exit(1);
}); 