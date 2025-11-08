#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

/**
 * Production-Ready Todo Management System for Recoder Code
 * Provides visual todo management with checkboxes and status tracking
 */
class TodoManager {
  constructor(options = {}) {
    this.todoFile = options.todoFile || path.join(process.cwd(), '.recoder-todos.json');
    this.todos = [];
    this.currentUser = options.user || this.getCurrentUser();
    this.loadTodos();
  }

  getCurrentUser() {
    return process.env.USER || process.env.USERNAME || 'developer';
  }

  /**
   * Load todos from file
   */
  loadTodos() {
    try {
      if (fs.existsSync(this.todoFile)) {
        const data = JSON.parse(fs.readFileSync(this.todoFile, 'utf8'));
        this.todos = data.todos || [];
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load todos: ${error.message}`));
      this.todos = [];
    }
  }

  /**
   * Save todos to file
   */
  saveTodos() {
    try {
      const data = {
        todos: this.todos,
        lastUpdated: new Date().toISOString(),
        user: this.currentUser
      };
      fs.writeFileSync(this.todoFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save todos: ${error.message}`));
    }
  }

  /**
   * Add a new todo
   */
  addTodo(content, priority = 'medium', category = 'general') {
    const todo = {
      id: this.generateId(),
      content: content,
      status: 'pending',
      priority: priority,
      category: category,
      createdAt: new Date().toISOString(),
      createdBy: this.currentUser,
      updatedAt: new Date().toISOString()
    };

    this.todos.push(todo);
    this.saveTodos();
    return todo.id;
  }

  /**
   * Update todo status
   */
  updateTodoStatus(id, status) {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.status = status;
      todo.updatedAt = new Date().toISOString();
      this.saveTodos();
      return true;
    }
    return false;
  }

  /**
   * Mark todo as completed
   */
  completeTodo(id) {
    return this.updateTodoStatus(id, 'completed');
  }

  /**
   * Mark todo as in progress
   */
  startTodo(id) {
    return this.updateTodoStatus(id, 'in_progress');
  }

  /**
   * Delete a todo
   */
  deleteTodo(id) {
    const index = this.todos.findIndex(t => t.id === id);
    if (index !== -1) {
      this.todos.splice(index, 1);
      this.saveTodos();
      return true;
    }
    return false;
  }

  /**
   * Display todos with visual interface like shown
   */
  displayTodos(showCompleted = true) {
    console.log(chalk.cyan.bold('Update Todos'));
    
    if (this.todos.length === 0) {
      console.log(chalk.gray('  ⎿  No todos found. Add one with: /todo add <task>'));
      return;
    }

    // Group todos by status
    const pending = this.todos.filter(t => t.status === 'pending');
    const inProgress = this.todos.filter(t => t.status === 'in_progress');
    const completed = this.todos.filter(t => t.status === 'completed');

    // Display in progress first
    if (inProgress.length > 0) {
      console.log(chalk.yellow('  ⎿  ◐ In Progress:'));
      inProgress.forEach(todo => {
        console.log(chalk.yellow(`     ◐ ${todo.content}`));
      });
    }

    // Display pending todos
    if (pending.length > 0) {
      console.log(chalk.white('  ⎿  ☐ Pending:'));
      pending.forEach(todo => {
        const priorityIcon = this.getPriorityIcon(todo.priority);
        console.log(chalk.white(`     ☐ ${priorityIcon} ${todo.content}`));
      });
    }

    // Display completed todos if requested
    if (showCompleted && completed.length > 0) {
      console.log(chalk.green('  ⎿  ☒ Completed:'));
      completed.forEach(todo => {
        console.log(chalk.green(`     ☒ ${todo.content}`));
      });
    }
  }

  /**
   * Get priority icon
   */
  getPriorityIcon(priority) {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  }

  /**
   * Display todos by category
   */
  displayTodosByCategory() {
    const categories = {};
    this.todos.forEach(todo => {
      if (!categories[todo.category]) {
        categories[todo.category] = [];
      }
      categories[todo.category].push(todo);
    });

    Object.keys(categories).forEach(category => {
      console.log(chalk.cyan.bold(`\n📋 ${category.toUpperCase()}`));
      categories[category].forEach(todo => {
        const statusIcon = this.getStatusIcon(todo.status);
        const priorityIcon = this.getPriorityIcon(todo.priority);
        console.log(`  ${statusIcon} ${priorityIcon} ${todo.content}`);
      });
    });
  }

  /**
   * Get status icon
   */
  getStatusIcon(status) {
    switch (status) {
      case 'completed': return chalk.green('☒');
      case 'in_progress': return chalk.yellow('◐');
      case 'pending': return chalk.white('☐');
      default: return '⚪';
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get statistics
   */
  getStats() {
    const total = this.todos.length;
    const completed = this.todos.filter(t => t.status === 'completed').length;
    const inProgress = this.todos.filter(t => t.status === 'in_progress').length;
    const pending = this.todos.filter(t => t.status === 'pending').length;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  }

  /**
   * Display statistics
   */
  displayStats() {
    const stats = this.getStats();
    console.log(chalk.cyan.bold('📊 Todo Statistics'));
    console.log(chalk.white(`Total: ${stats.total}`));
    console.log(chalk.green(`Completed: ${stats.completed}`));
    console.log(chalk.yellow(`In Progress: ${stats.inProgress}`));
    console.log(chalk.gray(`Pending: ${stats.pending}`));
    console.log(chalk.blue(`Completion Rate: ${stats.completionRate}%`));
  }

  /**
   * Clear completed todos
   */
  clearCompleted() {
    const beforeCount = this.todos.length;
    this.todos = this.todos.filter(t => t.status !== 'completed');
    const removedCount = beforeCount - this.todos.length;
    
    if (removedCount > 0) {
      this.saveTodos();
      console.log(chalk.green(`✅ Cleared ${removedCount} completed todos`));
    } else {
      console.log(chalk.gray('No completed todos to clear'));
    }
  }

  /**
   * Search todos
   */
  searchTodos(query) {
    const results = this.todos.filter(todo => 
      todo.content.toLowerCase().includes(query.toLowerCase()) ||
      todo.category.toLowerCase().includes(query.toLowerCase())
    );

    if (results.length === 0) {
      console.log(chalk.gray(`No todos found matching: ${query}`));
      return;
    }

    console.log(chalk.cyan.bold(`🔍 Search Results for "${query}":`));
    results.forEach(todo => {
      const statusIcon = this.getStatusIcon(todo.status);
      const priorityIcon = this.getPriorityIcon(todo.priority);
      console.log(`  ${statusIcon} ${priorityIcon} ${todo.content}`);
    });
  }

  /**
   * Import todos from existing TodoWrite format
   */
  importFromTodoWrite(todoWriteTodos) {
    todoWriteTodos.forEach(todo => {
      this.addTodo(todo.content, 'medium', 'imported');
      if (todo.status !== 'pending') {
        this.updateTodoStatus(this.todos[this.todos.length - 1].id, todo.status);
      }
    });
    console.log(chalk.green(`✅ Imported ${todoWriteTodos.length} todos`));
  }
}

module.exports = TodoManager;

// CLI interface when run directly
if (require.main === module) {
  const todoManager = new TodoManager();
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'add':
      if (args.length === 0) {
        console.log('Usage: todo-manager.js add <content> [priority] [category]');
        process.exit(1);
      }
      const content = args[0];
      const priority = args[1] || 'medium';
      const category = args[2] || 'general';
      const id = todoManager.addTodo(content, priority, category);
      console.log(chalk.green(`✅ Added todo: ${id}`));
      break;

    case 'list':
      todoManager.displayTodos();
      break;

    case 'complete':
      if (args.length === 0) {
        console.log('Usage: todo-manager.js complete <id>');
        process.exit(1);
      }
      if (todoManager.completeTodo(args[0])) {
        console.log(chalk.green('✅ Todo marked as completed'));
      } else {
        console.log(chalk.red('❌ Todo not found'));
      }
      break;

    case 'start':
      if (args.length === 0) {
        console.log('Usage: todo-manager.js start <id>');
        process.exit(1);
      }
      if (todoManager.startTodo(args[0])) {
        console.log(chalk.yellow('◐ Todo marked as in progress'));
      } else {
        console.log(chalk.red('❌ Todo not found'));
      }
      break;

    case 'delete':
      if (args.length === 0) {
        console.log('Usage: todo-manager.js delete <id>');
        process.exit(1);
      }
      if (todoManager.deleteTodo(args[0])) {
        console.log(chalk.green('✅ Todo deleted'));
      } else {
        console.log(chalk.red('❌ Todo not found'));
      }
      break;

    case 'stats':
      todoManager.displayStats();
      break;

    case 'clear':
      todoManager.clearCompleted();
      break;

    case 'search':
      if (args.length === 0) {
        console.log('Usage: todo-manager.js search <query>');
        process.exit(1);
      }
      todoManager.searchTodos(args[0]);
      break;

    case 'categories':
      todoManager.displayTodosByCategory();
      break;

    default:
      console.log(chalk.cyan.bold('Recoder Code - Todo Manager'));
      console.log('');
      console.log('Usage:');
      console.log('  todo-manager.js add <content> [priority] [category]');
      console.log('  todo-manager.js list');
      console.log('  todo-manager.js complete <id>');
      console.log('  todo-manager.js start <id>');
      console.log('  todo-manager.js delete <id>');
      console.log('  todo-manager.js stats');
      console.log('  todo-manager.js clear');
      console.log('  todo-manager.js search <query>');
      console.log('  todo-manager.js categories');
      break;
  }
}