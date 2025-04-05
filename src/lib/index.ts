import { scheduleLearningLoop } from './self-improvement-loop';
import { AgentOrchestrator } from './agent-orchestrator';

// Export components for use in other files
export * from './db/database';
export * from './db/vector-store';
export * from './llm/meta-agent';
export * from './codebase-critic';
export * from './default-prompt-template';
export * from './self-improvement-loop';
export * from './agent-orchestrator';

// Initialize the learning loop with a 4-hour interval for development
// (This would typically be 24 hours in production)
scheduleLearningLoop(4);

// Create a singleton instance of the agent orchestrator
export const agentOrchestrator = new AgentOrchestrator();

console.log("AutoAgent systems initialized with self-improvement loop enabled."); 