'use client';

import { useState } from 'react';
import { 
  Bot, Send, Lightbulb, Code, Bug, Zap, 
  History, Settings, Copy, ThumbsUp, ThumbsDown,
  Sparkles, Terminal, FileCode, RefreshCw
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: {
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  [key: string]: any;
}) => {
  const sizeClasses: Record<string, string> = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function AiChatAssistantPage() {
  const [messageText, setMessageText] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const quickActions = [
    {
      icon: Code,
      title: 'Generate Code',
      description: 'Create functions, components, or entire files',
      prompt: 'Generate a React component for...'
    },
    {
      icon: Bug,
      title: 'Debug Code',
      description: 'Find and fix issues in your code',
      prompt: 'Help me debug this error...'
    },
    {
      icon: Lightbulb,
      title: 'Explain Code',
      description: 'Understand complex code snippets',
      prompt: 'Explain what this code does...'
    },
    {
      icon: RefreshCw,
      title: 'Refactor Code',
      description: 'Improve code structure and performance',
      prompt: 'How can I refactor this code to...'
    }
  ];

  const conversation = [
    {
      id: 1,
      sender: 'user',
      content: 'Can you help me create a React component for a user profile card?',
      timestamp: '2:30 PM'
    },
    {
      id: 2,
      sender: 'ai',
      content: 'I\'d be happy to help you create a React user profile card component! Here\'s a clean, modern implementation:\n\n```jsx\nimport React from \'react\';\n\nconst UserProfileCard = ({ user }) => {\n  return (\n    <div className="bg-white rounded-lg shadow-md p-6 max-w-sm">\n      <div className="flex items-center space-x-4">\n        <img\n          src={user.avatar}\n          alt={user.name}\n          className="w-16 h-16 rounded-full object-cover"\n        />\n        <div>\n          <h3 className="text-lg font-semibold text-gray-900">\n            {user.name}\n          </h3>\n          <p className="text-gray-600">{user.role}</p>\n        </div>\n      </div>\n      <div className="mt-4">\n        <p className="text-gray-700">{user.bio}</p>\n      </div>\n      <div className="mt-4 flex space-x-2">\n        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">\n          Follow\n        </button>\n        <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50">\n          Message\n        </button>\n      </div>\n    </div>\n  );\n};\n\nexport default UserProfileCard;\n```\n\nThis component includes:\n- User avatar with rounded styling\n- Name and role display\n- Bio section\n- Action buttons (Follow/Message)\n- Responsive design with Tailwind CSS\n\nWould you like me to add any additional features or modify the styling?',
      timestamp: '2:31 PM',
      codeBlocks: [
        {
          language: 'jsx',
          code: 'const UserProfileCard = ({ user }) => {\n  return (\n    <div className="bg-white rounded-lg shadow-md p-6 max-w-sm">\n      {/* Component content */}\n    </div>\n  );\n};'
        }
      ]
    },
    {
      id: 3,
      sender: 'user',
      content: 'That looks great! Can you add a feature to toggle between light and dark mode?',
      timestamp: '2:33 PM'
    },
    {
      id: 4,
      sender: 'ai',
      content: 'Absolutely! Here\'s the updated component with dark mode support:\n\n```jsx\nimport React, { useState } from \'react\';\nimport { Moon, Sun } from \'lucide-react\';\n\nconst UserProfileCard = ({ user }) => {\n  const [isDarkMode, setIsDarkMode] = useState(false);\n\n  const toggleDarkMode = () => {\n    setIsDarkMode(!isDarkMode);\n  };\n\n  return (\n    <div className={`rounded-lg shadow-md p-6 max-w-sm transition-colors ${\n      isDarkMode \n        ? \'bg-gray-800 text-white\' \n        : \'bg-white text-gray-900\'\n    }`}>\n      <div className="flex items-center justify-between mb-4">\n        <h3 className="text-lg font-semibold">Profile</h3>\n        <button\n          onClick={toggleDarkMode}\n          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"\n        >\n          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}\n        </button>\n      </div>\n      \n      <div className="flex items-center space-x-4">\n        <img\n          src={user.avatar}\n          alt={user.name}\n          className="w-16 h-16 rounded-full object-cover"\n        />\n        <div>\n          <h3 className="text-lg font-semibold">\n            {user.name}\n          </h3>\n          <p className={isDarkMode ? \'text-gray-300\' : \'text-gray-600\'}>\n            {user.role}\n          </p>\n        </div>\n      </div>\n      \n      <div className="mt-4">\n        <p className={isDarkMode ? \'text-gray-300\' : \'text-gray-700\'}>\n          {user.bio}\n        </p>\n      </div>\n      \n      <div className="mt-4 flex space-x-2">\n        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">\n          Follow\n        </button>\n        <button className={`px-4 py-2 rounded-md ${\n          isDarkMode\n            ? \'border border-gray-600 text-gray-300 hover:bg-gray-700\'\n            : \'border border-gray-300 text-gray-700 hover:bg-gray-50\'\n        }`}>\n          Message\n        </button>\n      </div>\n    </div>\n  );\n};\n\nexport default UserProfileCard;\n```\n\nKey changes:\n- Added `useState` for dark mode state\n- Toggle button with sun/moon icons\n- Conditional styling based on `isDarkMode`\n- Smooth transitions with `transition-colors`\n- Dark mode colors for all text and backgrounds\n\nThe component now supports both light and dark themes!',
      timestamp: '2:34 PM',
      codeBlocks: [
        {
          language: 'jsx',
          code: 'const [isDarkMode, setIsDarkMode] = useState(false);\n\nconst toggleDarkMode = () => {\n  setIsDarkMode(!isDarkMode);\n};'
        }
      ]
    }
  ];

  const recentChats = [
    'React component optimization',
    'TypeScript error debugging',
    'Database query performance',
    'CSS Grid layout help',
    'API integration guide'
  ];

  const handleSendMessage = () => {
    if (messageText.trim()) {
      // Add user message to conversation
      setIsTyping(true);
      // Simulate AI response delay
      setTimeout(() => {
        setIsTyping(false);
      }, 2000);
      setMessageText('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mr-3">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">AI Assistant</h1>
                <p className="text-sm text-green-600 dark:text-green-400">Online</p>
              </div>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white">
              <Sparkles className="h-4 w-4 mr-2" />
              New Chat
            </Button>
          </div>

          {/* Quick Actions */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Quick Actions
            </h3>
            <div className="space-y-2">
              {quickActions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer group"
                  onClick={() => setMessageText(action.prompt)}
                >
                  <action.icon className="h-4 w-4 text-purple-600 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{action.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Chats */}
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Recent Chats
              </h3>
              <History className="h-4 w-4 text-gray-400" />
            </div>
            <div className="space-y-2">
              {recentChats.map((chat, index) => (
                <div
                  key={index}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                >
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{chat}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <Button className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Bot className="h-8 w-8 text-purple-600 mr-3" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">AI Code Assistant</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Powered by advanced language models • Ready to help with coding
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <Terminal className="h-4 w-4 mr-1" />
                  Code Mode
                </Button>
                <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                  <FileCode className="h-4 w-4 mr-1" />
                  Context
                </Button>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {conversation.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-4xl ${message.sender === 'user' ? 'order-1' : 'order-2'}`}>
                  <div className="flex items-start space-x-3">
                    {message.sender === 'ai' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="h-5 w-5 text-white" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div
                        className={`p-4 rounded-lg ${
                          message.sender === 'user'
                            ? 'bg-blue-600 text-white ml-12'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-lg'
                        }`}
                      >
                        <div className="prose prose-sm max-w-none">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                      
                      {message.sender === 'ai' && (
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center space-x-2">
                            <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                              <Copy className="h-3 w-3 mr-1" />
                              Copy
                            </Button>
                            <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                              <ThumbsUp className="h-3 w-3" />
                            </Button>
                            <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                              <ThumbsDown className="h-3 w-3" />
                            </Button>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {message.timestamp}
                          </span>
                        </div>
                      )}
                    </div>
                    {message.sender === 'user' && (
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-green-600 rounded-full flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                        You
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="flex items-start space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center">
                    <Bot className="h-5 w-5 text-white" />
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-lg">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Message Input */}
          <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-end space-x-3">
              <div className="flex-1">
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Ask me anything about coding, debugging, or development..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="flex space-x-2">
                    <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                      <Code className="h-4 w-4 mr-1" />
                      Code
                    </Button>
                    <Button size="sm" className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300">
                      <FileCode className="h-4 w-4 mr-1" />
                      File
                    </Button>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Press Enter to send, Shift+Enter for new line
                  </span>
                </div>
              </div>
              <Button 
                className={`${
                  messageText.trim() 
                    ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
                disabled={!messageText.trim()}
                onClick={handleSendMessage}
              >
                <Send className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
