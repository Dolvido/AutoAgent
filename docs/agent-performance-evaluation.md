# Agent Performance Evaluation

This documentation explains how to use the AutoAgent performance evaluation tools to analyze and improve the critique agent's effectiveness.

## Overview

AutoAgent comes with built-in performance tracking that records:

1. **Feedback statistics**: Acceptance/rejection rates per critique type, severity, and language
2. **Prompt performance**: How different prompt versions perform over time
3. **Self-improvement metrics**: Track if the agent is getting better at generating critiques

## Running Performance Evaluation

### Using PowerShell Script (Windows)

The easiest way to run performance evaluation is using the included PowerShell script:

```powershell
.\scripts\evaluate-performance.ps1
```

This will:
1. Install any required dependencies (ts-node)
2. Run the evaluation script
3. Offer to save results to a file in `data/performance-reports/`

### Running Directly

You can also run the evaluation script directly:

```bash
# From project root
npx ts-node scripts/evaluate-agent-performance.ts
```

## Understanding the Results

The evaluation report is divided into several sections:

### Overall Statistics

Shows the distribution of feedback types (accept/reject/ignore) and how they've changed over time. This gives a high-level view of agent performance.

### Acceptance by Category

Breaks down acceptance rates by:
- Severity (high/medium/low)
- Programming language
- Time period (7 days, 30 days, all time)

These metrics help identify where the agent performs best and which areas need improvement.

### Issue Type Analysis

Lists the most effective and least effective issue types based on user acceptance. This helps understand which types of critiques are most valuable to users.

### Prompt Template Performance

Compares different prompt versions, showing:
- Acceptance rates
- Usage counts
- Creation dates
- Active status

### Self-Improvement Assessment

Evaluates if the agent is getting better over time by tracking:
- Changes in acceptance rates
- Prompt version improvements
- Overall learning progress

## Interpreting Results

Look for these key patterns:

1. **Rising acceptance rates**: Indicates the agent is learning from feedback
2. **Prompt improvement**: Newer prompt versions should generally have higher acceptance rates
3. **Rejected critique types**: Identify patterns in what users frequently reject

## Improving Agent Performance

Based on evaluation results, you can:

1. **Run meta-agent analysis**: Use `runLearningLoop()` to generate a new prompt template based on feedback
2. **Remove problematic critique types**: Edit prompt templates to avoid frequently rejected critique types
3. **Add examples to vector store**: Quality examples help the agent learn specific patterns

## Scheduled Evaluation

For continuous monitoring, consider setting up a scheduled task to run evaluations regularly:

```powershell
# Example scheduled task (Windows)
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-File "D:\path\to\auto-agent\scripts\evaluate-performance.ps1"'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 9am
Register-ScheduledTask -Action $action -Trigger $trigger -TaskName "AutoAgent Performance Evaluation" -Description "Weekly performance analysis of AutoAgent"
```

## Troubleshooting

If you encounter issues:

- **No data available**: Use the agent first to collect feedback
- **Database errors**: Check that SQLite database exists and has proper permissions
- **Low performance**: Ensure you're using a high-quality LLM and appropriate prompts 