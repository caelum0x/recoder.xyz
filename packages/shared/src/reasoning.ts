/**
 * Reasoning and budget utilities
 */

export function shouldUseReasoningBudget(model: string): boolean {
  // Check if model supports reasoning budget
  const reasoningModels = [
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-5-sonnet-20241022',
    'gpt-4',
    'gpt-4-turbo'
  ]
  
  return reasoningModels.some(m => model.includes(m))
}