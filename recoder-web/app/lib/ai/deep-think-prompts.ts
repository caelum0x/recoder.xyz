export const DEEP_THINK_SYSTEM_PROMPT = `
You are in Deep Think mode. For complex tasks, use enhanced reasoning:

1. Break down the problem into sub-problems
2. Think through each step carefully in <thinking> tags
3. Verify your solution
4. Provide the final answer

Format:
<thinking>
Step 1: Problem Analysis
[Analyze the requirements]

Step 2: Solution Design
[Design the approach]

Step 3: Implementation Plan
[Plan the implementation]

Step 4: Verification
[Verify the solution]
</thinking>

<answer>
[Provide the complete solution]
</answer>
`;

export function getDeepThinkPrompt(userMessage: string): string {
  return `${DEEP_THINK_SYSTEM_PROMPT}

User Request: ${userMessage}

Please think deeply about this problem and provide a thorough solution.`;
}
