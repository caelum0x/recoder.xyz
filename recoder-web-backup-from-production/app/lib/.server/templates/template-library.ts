/**
 * Template Library System
 * Pre-built components and app patterns to reduce LLM generation costs
 */

interface Template {
  id: string;
  name: string;
  description: string;
  category: 'component' | 'page' | 'app' | 'feature';
  framework: 'react' | 'vue' | 'svelte' | 'vanilla';
  complexity: 'simple' | 'medium' | 'complex';
  files: TemplateFile[];
  dependencies?: string[];
  cost: number; // 0 for templates, reduces LLM costs
  usageCount: number;
  tags: string[];
}

interface TemplateFile {
  path: string;
  content: string;
  type: 'component' | 'style' | 'test' | 'config';
}

class TemplateLibrary {
  private templates: Map<string, Template> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    // React Templates
    this.addTemplate({
      id: 'react-todo-app',
      name: 'Todo App',
      description: 'Complete todo application with CRUD operations',
      category: 'app',
      framework: 'react',
      complexity: 'medium',
      cost: 0, // Free template
      usageCount: 0,
      tags: ['todo', 'crud', 'state-management'],
      files: [
        {
          path: 'src/App.tsx',
          type: 'component',
          content: `import React, { useState } from 'react';
import TodoList from './components/TodoList';
import TodoForm from './components/TodoForm';
import './App.css';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

function App() {
  const [todos, setTodos] = useState<Todo[]>([]);

  const addTodo = (text: string) => {
    setTodos([...todos, { id: Date.now(), text, completed: false }]);
  };

  const toggleTodo = (id: number) => {
    setTodos(todos.map(todo =>
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ));
  };

  const deleteTodo = (id: number) => {
    setTodos(todos.filter(todo => todo.id !== id));
  };

  return (
    <div className="app">
      <h1>Todo App</h1>
      <TodoForm onAdd={addTodo} />
      <TodoList todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} />
    </div>
  );
}

export default App;`
        },
        {
          path: 'src/components/TodoList.tsx',
          type: 'component',
          content: `import React from 'react';
import TodoItem from './TodoItem';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoListProps {
  todos: Todo[];
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}

const TodoList: React.FC<TodoListProps> = ({ todos, onToggle, onDelete }) => {
  return (
    <ul className="todo-list">
      {todos.map(todo => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
};

export default TodoList;`
        }
      ],
      dependencies: ['react', '@types/react']
    });

    // Vue Dashboard Template
    this.addTemplate({
      id: 'vue-dashboard',
      name: 'Admin Dashboard',
      description: 'Professional admin dashboard with charts and tables',
      category: 'app',
      framework: 'vue',
      complexity: 'complex',
      cost: 0,
      usageCount: 0,
      tags: ['dashboard', 'admin', 'charts', 'tables'],
      files: [
        {
          path: 'src/App.vue',
          type: 'component',
          content: `<template>
  <div id="app">
    <Sidebar />
    <div class="main-content">
      <Header />
      <router-view />
    </div>
  </div>
</template>

<script>
import Sidebar from './components/Sidebar.vue'
import Header from './components/Header.vue'

export default {
  name: 'App',
  components: {
    Sidebar,
    Header
  }
}
</script>

<style>
#app {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>`
        }
      ],
      dependencies: ['vue', 'vue-router', 'chart.js']
    });

    // API Templates
    this.addTemplate({
      id: 'node-express-api',
      name: 'Express REST API',
      description: 'Complete REST API with authentication and CRUD operations',
      category: 'app',
      framework: 'vanilla',
      complexity: 'medium',
      cost: 0,
      usageCount: 0,
      tags: ['api', 'express', 'rest', 'auth'],
      files: [
        {
          path: 'server.js',
          type: 'component',
          content: `const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`
        }
      ],
      dependencies: ['express', 'cors', 'morgan', 'dotenv']
    });
  }

  private addTemplate(template: Template) {
    this.templates.set(template.id, template);
  }

  async findMatchingTemplates(query: string, framework?: string): Promise<Template[]> {
    const queryLower = query.toLowerCase();
    const matches: Template[] = [];

    for (const template of this.templates.values()) {
      // Framework filter
      if (framework && template.framework !== framework) continue;

      // Text matching
      const searchText = `${template.name} ${template.description} ${template.tags.join(' ')}`.toLowerCase();

      if (searchText.includes(queryLower) ||
          template.tags.some(tag => queryLower.includes(tag)) ||
          queryLower.includes(template.name.toLowerCase())) {
        matches.push(template);
      }
    }

    // Sort by relevance and usage
    return matches.sort((a, b) => {
      // Prefer exact name matches
      if (a.name.toLowerCase().includes(queryLower)) return -1;
      if (b.name.toLowerCase().includes(queryLower)) return 1;

      // Then by usage count
      return b.usageCount - a.usageCount;
    });
  }

  async getTemplate(id: string): Promise<Template | null> {
    const template = this.templates.get(id);
    if (template) {
      // Increment usage count
      template.usageCount++;
    }
    return template || null;
  }

  getTemplatesByCategory(category: Template['category']): Template[] {
    return Array.from(this.templates.values())
      .filter(t => t.category === category)
      .sort((a, b) => b.usageCount - a.usageCount);
  }

  getPopularTemplates(limit: number = 10): Template[] {
    return Array.from(this.templates.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }

  calculateCostSavings(templateId: string): {
    tokensSaved: number;
    costSaved: number;
    timesSaved: string;
  } {
    const template = this.templates.get(templateId);
    if (!template) return { tokensSaved: 0, costSaved: 0, timesSaved: '0s' };

    const estimatedTokens = {
      simple: 500,
      medium: 1500,
      complex: 3000
    };

    const tokens = estimatedTokens[template.complexity];
    const costPerToken = 0.00003; // ~$0.03/1K tokens
    const cost = tokens * costPerToken;

    return {
      tokensSaved: tokens,
      costSaved: cost,
      timesSaved: template.complexity === 'simple' ? '30s' :
                  template.complexity === 'medium' ? '2min' : '5min'
    };
  }
}

export const templateLibrary = new TemplateLibrary();