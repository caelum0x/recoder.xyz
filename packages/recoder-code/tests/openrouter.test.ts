import axios from 'axios';
import { RecoderCode } from '../cli/run.js';

jest.mock('axios');

describe('Open Router API Integration', () => {
  let recoder: RecoderCode;

  beforeEach(() => {
    recoder = new RecoderCode();
    // Mock the executeToolCall method
    jest.spyOn(recoder, 'executeToolCall').mockResolvedValue('Mocked tool result');
  });

  it('should call Open Router API with correct parameters', async () => {
    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'Test response from Open Router API'
            }
          }
        ]
      }
    };

    (axios.post as jest.Mock).mockResolvedValue(mockResponse);

    const userMessage = 'Test message';
    const response = await recoder.processConversation(userMessage);

    expect(axios.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content: `You are Recoder Code, a powerful AI assistant that can help users with software development tasks. You have access to tools that allow you to:
1. View, create, and edit files using the str_replace_editor tool
2. Execute bash commands using the bash tool

When users ask you to build projects or write code:
1. Start by understanding the requirements
2. Create the necessary project structure
3. Write the code files
4. Set up configuration files
5. Create documentation (README, etc.)
6. Test the project if possible

Always be thorough and create complete, working solutions. Ask clarifying questions if the requirements are unclear.

Available tools:
- str_replace_editor: For file operations (view, create, edit)
- bash: For executing shell commands

Current working directory: ${process.cwd()}`
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 4096,
        temperature: 0.7,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://github.com/anthropics/claude-code',
          'X-Title': process.env.OPENROUTER_SITE_NAME || 'Recoder Code'
        }
      }
    );

    expect(response).toBe('Test response from Open Router API');
  });

  it('should handle tool calls correctly', async () => {
    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'Test response from Open Router API',
              tool_calls: [
                {
                  id: 'tool_call_1',
                  function: {
                    name: 'str_replace_editor',
                    arguments: JSON.stringify({
                      command: 'view',
                      path: 'test.txt',
                      view_range: [1, 5]
                    })
                  }
                }
              ]
            }
          }
        ]
      }
    };

    (axios.post as jest.Mock).mockResolvedValue(mockResponse);

    const userMessage = 'Test message with tool call';
    const response = await recoder.processConversation(userMessage);

    expect(recoder.executeToolCall).toHaveBeenCalledWith({
      id: 'tool_call_1',
      function: {
        name: 'str_replace_editor',
        arguments: JSON.stringify({
          command: 'view',
          path: 'test.txt',
          view_range: [1, 5]
        })
      }
    });

    expect(response).toBe('Test response from Open Router API');
  });
});