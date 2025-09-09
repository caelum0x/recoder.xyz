/**
 * Language Configuration for Multi-Language Code Generator
 * Defines supported languages with their runtime configurations
 */

export interface LanguageConfig {
  id: string;
  name: string;
  displayName: string;
  version: string;
  container: string;
  fileExtension: string;
  syntax: string; // For Monaco Editor
  defaultCode: string;
  features: LanguageFeature[];
  packageManager?: PackageManager;
  compileCommand?: string;
  runCommand?: string;
  debugCommand?: string;
  testCommand?: string;
  lintCommand?: string;
  formatCommand?: string;
  dependencies: string[];
  examples: CodeExample[];
  documentation: string;
  icon: string;
  color: string;
  executionTimeout: number; // seconds
  memoryLimit: number; // MB
  cpuLimit: number; // CPU cores
}

export interface LanguageFeature {
  name: string;
  description: string;
  supported: boolean;
}

export interface PackageManager {
  name: string;
  installCommand: string;
  configFile: string;
  registry: string;
  popularPackages: string[];
}

export interface CodeExample {
  title: string;
  description: string;
  code: string;
  tags: string[];
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  javascript: {
    id: 'javascript',
    name: 'javascript',
    displayName: 'JavaScript',
    version: 'ES2023 (Node.js 20)',
    container: 'recoder-javascript',
    fileExtension: 'js',
    syntax: 'javascript',
    defaultCode: `// Welcome to JavaScript!
console.log('Hello, World!');

// Modern JavaScript features
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map(n => n * 2);
console.log('Doubled:', doubled);

// Async/await example
async function fetchData() {
  try {
    console.log('Fetching data...');
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { message: 'Data fetched successfully!' };
  } catch (error) {
    console.error('Error:', error);
  }
}

fetchData().then(data => console.log(data));`,
    features: [
      { name: 'ES2023 Support', description: 'Latest JavaScript features', supported: true },
      { name: 'Node.js Runtime', description: 'Server-side JavaScript execution', supported: true },
      { name: 'NPM Packages', description: 'Access to NPM registry', supported: true },
      { name: 'Async/Await', description: 'Modern asynchronous programming', supported: true },
      { name: 'Modules (ESM)', description: 'ECMAScript modules', supported: true },
      { name: 'Debugging', description: 'Debug support with source maps', supported: true },
    ],
    packageManager: {
      name: 'npm',
      installCommand: 'npm install',
      configFile: 'package.json',
      registry: 'https://registry.npmjs.org',
      popularPackages: ['lodash', 'axios', 'moment', 'uuid', 'express', 'react', 'vue']
    },
    runCommand: 'node',
    testCommand: 'jest',
    lintCommand: 'eslint',
    formatCommand: 'prettier',
    dependencies: ['node', 'npm', 'jest', 'eslint', 'prettier'],
    examples: [
      {
        title: 'Hello World',
        description: 'Basic console output',
        code: `console.log('Hello, World!');`,
        tags: ['beginner', 'console']
      },
      {
        title: 'Array Methods',
        description: 'Modern array manipulation',
        code: `const numbers = [1, 2, 3, 4, 5];
const result = numbers
  .filter(n => n % 2 === 0)
  .map(n => n * 2)
  .reduce((sum, n) => sum + n, 0);
console.log('Result:', result);`,
        tags: ['arrays', 'functional']
      },
      {
        title: 'Async Function',
        description: 'Asynchronous programming example',
        code: `async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Start');
  await delay(1000);
  console.log('After 1 second');
}

main();`,
        tags: ['async', 'promises']
      }
    ],
    documentation: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    icon: 'javascript',
    color: '#F7DF1E',
    executionTimeout: 30,
    memoryLimit: 512,
    cpuLimit: 0.5
  },

  typescript: {
    id: 'typescript',
    name: 'typescript',
    displayName: 'TypeScript',
    version: '5.2',
    container: 'recoder-javascript',
    fileExtension: 'ts',
    syntax: 'typescript',
    defaultCode: `// Welcome to TypeScript!
interface User {
  id: number;
  name: string;
  email: string;
  isActive?: boolean;
}

class UserService {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
    console.log(\`Added user: \${user.name}\`);
  }

  getActiveUsers(): User[] {
    return this.users.filter(user => user.isActive !== false);
  }

  getUserById(id: number): User | undefined {
    return this.users.find(user => user.id === id);
  }
}

// Usage example
const userService = new UserService();

const newUser: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  isActive: true
};

userService.addUser(newUser);
console.log('Active users:', userService.getActiveUsers());`,
    features: [
      { name: 'Static Typing', description: 'Compile-time type checking', supported: true },
      { name: 'Latest TypeScript', description: 'TypeScript 5.2 features', supported: true },
      { name: 'Interfaces & Classes', description: 'Object-oriented programming', supported: true },
      { name: 'Generics', description: 'Type-safe generic programming', supported: true },
      { name: 'Decorators', description: 'Experimental decorator support', supported: true },
      { name: 'Type Definitions', description: 'Access to @types packages', supported: true },
    ],
    packageManager: {
      name: 'npm',
      installCommand: 'npm install',
      configFile: 'package.json',
      registry: 'https://registry.npmjs.org',
      popularPackages: ['@types/node', '@types/express', '@types/react', 'typescript', 'ts-node']
    },
    compileCommand: 'tsc',
    runCommand: 'ts-node',
    testCommand: 'jest',
    lintCommand: 'tslint',
    formatCommand: 'prettier',
    dependencies: ['typescript', 'ts-node', '@types/node'],
    examples: [
      {
        title: 'Interface Definition',
        description: 'Defining and using interfaces',
        code: `interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
}

function displayProduct(product: Product): void {
  console.log(\`\${product.name} - $\${product.price}\`);
}

const laptop: Product = {
  id: 1,
  name: 'MacBook Pro',
  price: 2399,
  category: 'Electronics'
};

displayProduct(laptop);`,
        tags: ['interface', 'types']
      },
      {
        title: 'Generic Functions',
        description: 'Type-safe generic programming',
        code: `function identity<T>(arg: T): T {
  return arg;
}

function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

// Usage
const num = identity(42);
const str = identity("hello");

const person = { name: "Alice", age: 30 };
const name = getProperty(person, "name");
const age = getProperty(person, "age");

console.log({ num, str, name, age });`,
        tags: ['generics', 'types']
      }
    ],
    documentation: 'https://www.typescriptlang.org/docs/',
    icon: 'typescript',
    color: '#3178C6',
    executionTimeout: 30,
    memoryLimit: 512,
    cpuLimit: 0.5
  },

  python: {
    id: 'python',
    name: 'python',
    displayName: 'Python',
    version: '3.11',
    container: 'recoder-python',
    fileExtension: 'py',
    syntax: 'python',
    defaultCode: `# Welcome to Python!
import json
from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class Task:
    id: int
    title: str
    completed: bool = False
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

class TaskManager:
    def __init__(self):
        self.tasks: List[Task] = []
        self.next_id = 1
    
    def add_task(self, title: str) -> Task:
        task = Task(id=self.next_id, title=title)
        self.tasks.append(task)
        self.next_id += 1
        print(f"Added task: {title}")
        return task
    
    def complete_task(self, task_id: int) -> bool:
        for task in self.tasks:
            if task.id == task_id:
                task.completed = True
                print(f"Completed task: {task.title}")
                return True
        return False
    
    def get_pending_tasks(self) -> List[Task]:
        return [task for task in self.tasks if not task.completed]
    
    def summary(self) -> Dict[str, int]:
        total = len(self.tasks)
        completed = sum(1 for task in self.tasks if task.completed)
        pending = total - completed
        return {"total": total, "completed": completed, "pending": pending}

# Usage example
manager = TaskManager()
manager.add_task("Learn Python")
manager.add_task("Build a web app")
manager.add_task("Deploy to cloud")

manager.complete_task(1)

print("\\nPending tasks:")
for task in manager.get_pending_tasks():
    print(f"- {task.title}")

print("\\nSummary:", json.dumps(manager.summary(), indent=2))`,
    features: [
      { name: 'Python 3.11', description: 'Latest Python features', supported: true },
      { name: 'Type Hints', description: 'Static type checking support', supported: true },
      { name: 'Popular Libraries', description: 'NumPy, Pandas, Requests, etc.', supported: true },
      { name: 'Data Science', description: 'Scientific computing libraries', supported: true },
      { name: 'Web Frameworks', description: 'Flask, Django, FastAPI', supported: true },
      { name: 'Async/Await', description: 'Asynchronous programming', supported: true },
    ],
    packageManager: {
      name: 'pip',
      installCommand: 'pip install',
      configFile: 'requirements.txt',
      registry: 'https://pypi.org',
      popularPackages: ['requests', 'numpy', 'pandas', 'flask', 'django', 'fastapi', 'pytest']
    },
    runCommand: 'python3',
    testCommand: 'pytest',
    lintCommand: 'flake8',
    formatCommand: 'black',
    dependencies: ['python3', 'pip', 'pytest', 'black', 'flake8'],
    examples: [
      {
        title: 'List Comprehension',
        description: 'Pythonic list processing',
        code: `numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
squares = [x**2 for x in numbers if x % 2 == 0]
print("Even squares:", squares)`,
        tags: ['lists', 'comprehension']
      },
      {
        title: 'Data Classes',
        description: 'Modern Python data structures',
        code: `from dataclasses import dataclass
from typing import List

@dataclass
class Person:
    name: str
    age: int
    skills: List[str]
    
    def add_skill(self, skill: str):
        self.skills.append(skill)
    
    def __str__(self):
        return f"{self.name} ({self.age}) - Skills: {', '.join(self.skills)}"

person = Person("Alice", 30, ["Python", "JavaScript"])
person.add_skill("TypeScript")
print(person)`,
        tags: ['dataclass', 'types']
      }
    ],
    documentation: 'https://docs.python.org/3/',
    icon: 'python',
    color: '#3776AB',
    executionTimeout: 30,
    memoryLimit: 512,
    cpuLimit: 0.5
  },

  rust: {
    id: 'rust',
    name: 'rust',
    displayName: 'Rust',
    version: '1.70',
    container: 'recoder-rust',
    fileExtension: 'rs',
    syntax: 'rust',
    defaultCode: `// Welcome to Rust!
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Task {
    id: u32,
    title: String,
    completed: bool,
}

impl Task {
    fn new(id: u32, title: String) -> Self {
        Task {
            id,
            title,
            completed: false,
        }
    }
    
    fn complete(&mut self) {
        self.completed = true;
    }
}

struct TaskManager {
    tasks: HashMap<u32, Task>,
    next_id: u32,
}

impl TaskManager {
    fn new() -> Self {
        TaskManager {
            tasks: HashMap::new(),
            next_id: 1,
        }
    }
    
    fn add_task(&mut self, title: String) -> u32 {
        let id = self.next_id;
        let task = Task::new(id, title.clone());
        self.tasks.insert(id, task);
        self.next_id += 1;
        println!("Added task: {}", title);
        id
    }
    
    fn complete_task(&mut self, id: u32) -> Result<(), String> {
        match self.tasks.get_mut(&id) {
            Some(task) => {
                task.complete();
                println!("Completed task: {}", task.title);
                Ok(())
            }
            None => Err(format!("Task with id {} not found", id)),
        }
    }
    
    fn get_pending_tasks(&self) -> Vec<&Task> {
        self.tasks
            .values()
            .filter(|task| !task.completed)
            .collect()
    }
    
    fn summary(&self) -> (usize, usize, usize) {
        let total = self.tasks.len();
        let completed = self.tasks.values().filter(|t| t.completed).count();
        let pending = total - completed;
        (total, completed, pending)
    }
}

fn main() {
    let mut manager = TaskManager::new();
    
    let task1 = manager.add_task("Learn Rust".to_string());
    let task2 = manager.add_task("Build a CLI tool".to_string());
    let task3 = manager.add_task("Contribute to open source".to_string());
    
    manager.complete_task(task1).unwrap();
    
    println!("\\nPending tasks:");
    for task in manager.get_pending_tasks() {
        println!("- {}", task.title);
    }
    
    let (total, completed, pending) = manager.summary();
    println!("\\nSummary: {} total, {} completed, {} pending", total, completed, pending);
}`,
    features: [
      { name: 'Memory Safety', description: 'Zero-cost memory safety without GC', supported: true },
      { name: 'Performance', description: 'Systems programming performance', supported: true },
      { name: 'Cargo Package Manager', description: 'Built-in package management', supported: true },
      { name: 'Pattern Matching', description: 'Powerful pattern matching', supported: true },
      { name: 'Ownership System', description: 'Unique ownership model', supported: true },
      { name: 'Concurrency', description: 'Safe concurrent programming', supported: true },
    ],
    packageManager: {
      name: 'cargo',
      installCommand: 'cargo add',
      configFile: 'Cargo.toml',
      registry: 'https://crates.io',
      popularPackages: ['serde', 'tokio', 'reqwest', 'clap', 'anyhow', 'thiserror']
    },
    compileCommand: 'cargo build',
    runCommand: 'cargo run',
    testCommand: 'cargo test',
    lintCommand: 'cargo clippy',
    formatCommand: 'cargo fmt',
    dependencies: ['rustc', 'cargo'],
    examples: [
      {
        title: 'Ownership Example',
        description: 'Rust ownership and borrowing',
        code: `fn main() {
    let s1 = String::from("Hello");
    let len = calculate_length(&s1);
    println!("The length of '{}' is {}.", s1, len);
}

fn calculate_length(s: &String) -> usize {
    s.len()
}`,
        tags: ['ownership', 'borrowing']
      },
      {
        title: 'Error Handling',
        description: 'Result type and error handling',
        code: `use std::fs::File;
use std::io::ErrorKind;

fn main() {
    let result = File::open("hello.txt");
    
    let file = match result {
        Ok(file) => file,
        Err(error) => match error.kind() {
            ErrorKind::NotFound => {
                println!("File not found, creating...");
                File::create("hello.txt").unwrap()
            }
            other_error => {
                panic!("Problem opening file: {:?}", other_error);
            }
        },
    };
    
    println!("File handle: {:?}", file);
}`,
        tags: ['error-handling', 'result']
      }
    ],
    documentation: 'https://doc.rust-lang.org/',
    icon: 'rust',
    color: '#CE422B',
    executionTimeout: 60,
    memoryLimit: 1024,
    cpuLimit: 1.0
  },

  go: {
    id: 'go',
    name: 'go',
    displayName: 'Go',
    version: '1.21',
    container: 'recoder-go',
    fileExtension: 'go',
    syntax: 'go',
    defaultCode: `// Welcome to Go!
package main

import (
\t"encoding/json"
\t"fmt"
\t"sync"
\t"time"
)

type Task struct {
\tID        int       \`json:"id"\`
\tTitle     string    \`json:"title"\`
\tCompleted bool      \`json:"completed"\`
\tCreatedAt time.Time \`json:"created_at"\`
}

type TaskManager struct {
\ttasks  []Task
\tnextID int
\tmutex  sync.RWMutex
}

func NewTaskManager() *TaskManager {
\treturn &TaskManager{
\t\ttasks:  make([]Task, 0),
\t\tnextID: 1,
\t}
}

func (tm *TaskManager) AddTask(title string) *Task {
\ttm.mutex.Lock()
\tdefer tm.mutex.Unlock()
\t
\ttask := Task{
\t\tID:        tm.nextID,
\t\tTitle:     title,
\t\tCompleted: false,
\t\tCreatedAt: time.Now(),
\t}
\t
\ttm.tasks = append(tm.tasks, task)
\ttm.nextID++
\t
\tfmt.Printf("Added task: %s\\n", title)
\treturn &task
}

func (tm *TaskManager) CompleteTask(id int) error {
\ttm.mutex.Lock()
\tdefer tm.mutex.Unlock()
\t
\tfor i := range tm.tasks {
\t\tif tm.tasks[i].ID == id {
\t\t\ttm.tasks[i].Completed = true
\t\t\tfmt.Printf("Completed task: %s\\n", tm.tasks[i].Title)
\t\t\treturn nil
\t\t}
\t}
\t
\treturn fmt.Errorf("task with ID %d not found", id)
}

func (tm *TaskManager) GetPendingTasks() []Task {
\ttm.mutex.RLock()
\tdefer tm.mutex.RUnlock()
\t
\tvar pending []Task
\tfor _, task := range tm.tasks {
\t\tif !task.Completed {
\t\t\tpending = append(pending, task)
\t\t}
\t}
\treturn pending
}

func (tm *TaskManager) Summary() map[string]int {
\ttm.mutex.RLock()
\tdefer tm.mutex.RUnlock()
\t
\ttotal := len(tm.tasks)
\tcompleted := 0
\t
\tfor _, task := range tm.tasks {
\t\tif task.Completed {
\t\t\tcompleted++
\t\t}
\t}
\t
\treturn map[string]int{
\t\t"total":     total,
\t\t"completed": completed,
\t\t"pending":   total - completed,
\t}
}

func main() {
\tmanager := NewTaskManager()
\t
\t// Add some tasks
\ttask1 := manager.AddTask("Learn Go")
\tmanager.AddTask("Build a web service")
\tmanager.AddTask("Deploy to production")
\t
\t// Complete first task
\tmanager.CompleteTask(task1.ID)
\t
\t// Show pending tasks
\tfmt.Println("\\nPending tasks:")
\tfor _, task := range manager.GetPendingTasks() {
\t\tfmt.Printf("- %s\\n", task.Title)
\t}
\t
\t// Show summary
\tsummary := manager.Summary()
\tsummaryJSON, _ := json.MarshalIndent(summary, "", "  ")
\tfmt.Printf("\\nSummary: %s\\n", summaryJSON)
}`,
    features: [
      { name: 'Simplicity', description: 'Simple and readable syntax', supported: true },
      { name: 'Concurrency', description: 'Built-in goroutines and channels', supported: true },
      { name: 'Performance', description: 'Compiled language performance', supported: true },
      { name: 'Standard Library', description: 'Rich standard library', supported: true },
      { name: 'Cross Platform', description: 'Easy cross-compilation', supported: true },
      { name: 'Garbage Collection', description: 'Automatic memory management', supported: true },
    ],
    packageManager: {
      name: 'go modules',
      installCommand: 'go get',
      configFile: 'go.mod',
      registry: 'https://pkg.go.dev',
      popularPackages: ['gin-gonic/gin', 'gorilla/mux', 'labstack/echo', 'gorm.io/gorm']
    },
    compileCommand: 'go build',
    runCommand: 'go run',
    testCommand: 'go test',
    lintCommand: 'golangci-lint',
    formatCommand: 'go fmt',
    dependencies: ['go'],
    examples: [
      {
        title: 'Goroutines',
        description: 'Concurrent programming with goroutines',
        code: `package main

import (
\t"fmt"
\t"sync"
\t"time"
)

func worker(id int, wg *sync.WaitGroup) {
\tdefer wg.Done()
\tfmt.Printf("Worker %d starting\\n", id)
\ttime.Sleep(time.Second)
\tfmt.Printf("Worker %d done\\n", id)
}

func main() {
\tvar wg sync.WaitGroup
\t
\tfor i := 1; i <= 3; i++ {
\t\twg.Add(1)
\t\tgo worker(i, &wg)
\t}
\t
\twg.Wait()
\tfmt.Println("All workers completed")
}`,
        tags: ['concurrency', 'goroutines']
      },
      {
        title: 'Channels',
        description: 'Communication between goroutines',
        code: `package main

import "fmt"

func fibonacci(n int, c chan int) {
\tx, y := 0, 1
\tfor i := 0; i < n; i++ {
\t\tc <- x
\t\tx, y = y, x+y
\t}
\tclose(c)
}

func main() {
\tc := make(chan int, 10)
\tgo fibonacci(cap(c), c)
\t
\tfor i := range c {
\t\tfmt.Println(i)
\t}
}`,
        tags: ['channels', 'concurrency']
      }
    ],
    documentation: 'https://golang.org/doc/',
    icon: 'go',
    color: '#00ADD8',
    executionTimeout: 45,
    memoryLimit: 1024,
    cpuLimit: 1.0
  },

  cpp: {
    id: 'cpp',
    name: 'cpp',
    displayName: 'C++',
    version: 'C++20 (GCC 13)',
    container: 'recoder-cpp',
    fileExtension: 'cpp',
    syntax: 'cpp',
    defaultCode: `// Welcome to C++20!
#include <iostream>
#include <vector>
#include <string>
#include <memory>
#include <algorithm>
#include <map>
#include <chrono>

class Task {
private:
    static int next_id;
    int id;
    std::string title;
    bool completed;
    std::chrono::system_clock::time_point created_at;

public:
    Task(const std::string& title) 
        : id(next_id++), title(title), completed(false), 
          created_at(std::chrono::system_clock::now()) {}
    
    int getId() const { return id; }
    const std::string& getTitle() const { return title; }
    bool isCompleted() const { return completed; }
    
    void complete() { 
        completed = true; 
        std::cout << "Completed task: " << title << std::endl;
    }
    
    auto getCreatedAt() const { return created_at; }
};

int Task::next_id = 1;

class TaskManager {
private:
    std::vector<std::unique_ptr<Task>> tasks;

public:
    int addTask(const std::string& title) {
        auto task = std::make_unique<Task>(title);
        int id = task->getId();
        tasks.push_back(std::move(task));
        std::cout << "Added task: " << title << std::endl;
        return id;
    }
    
    bool completeTask(int id) {
        auto it = std::find_if(tasks.begin(), tasks.end(),
            [id](const auto& task) { return task->getId() == id; });
        
        if (it != tasks.end()) {
            (*it)->complete();
            return true;
        }
        return false;
    }
    
    std::vector<Task*> getPendingTasks() const {
        std::vector<Task*> pending;
        for (const auto& task : tasks) {
            if (!task->isCompleted()) {
                pending.push_back(task.get());
            }
        }
        return pending;
    }
    
    std::map<std::string, int> getSummary() const {
        int total = tasks.size();
        int completed = std::count_if(tasks.begin(), tasks.end(),
            [](const auto& task) { return task->isCompleted(); });
        
        return {
            {"total", total},
            {"completed", completed},
            {"pending", total - completed}
        };
    }
};

int main() {
    TaskManager manager;
    
    // Add tasks
    int task1 = manager.addTask("Learn C++20");
    int task2 = manager.addTask("Implement algorithms");
    int task3 = manager.addTask("Optimize performance");
    
    // Complete first task
    manager.completeTask(task1);
    
    // Show pending tasks
    std::cout << "\\nPending tasks:" << std::endl;
    for (const auto& task : manager.getPendingTasks()) {
        std::cout << "- " << task->getTitle() << std::endl;
    }
    
    // Show summary
    auto summary = manager.getSummary();
    std::cout << "\\nSummary:" << std::endl;
    for (const auto& [key, value] : summary) {
        std::cout << "  " << key << ": " << value << std::endl;
    }
    
    return 0;
}`,
    features: [
      { name: 'C++20 Standard', description: 'Latest C++ features', supported: true },
      { name: 'STL', description: 'Standard Template Library', supported: true },
      { name: 'Memory Management', description: 'Smart pointers and RAII', supported: true },
      { name: 'Performance', description: 'Zero-overhead abstractions', supported: true },
      { name: 'Templates', description: 'Generic programming', supported: true },
      { name: 'Package Manager', description: 'vcpkg package management', supported: true },
    ],
    packageManager: {
      name: 'vcpkg',
      installCommand: 'vcpkg install',
      configFile: 'vcpkg.json',
      registry: 'https://github.com/microsoft/vcpkg',
      popularPackages: ['fmt', 'spdlog', 'nlohmann-json', 'catch2', 'boost']
    },
    compileCommand: 'g++ -std=c++20',
    runCommand: './a.out',
    testCommand: 'catch2',
    lintCommand: 'clang-tidy',
    formatCommand: 'clang-format',
    dependencies: ['g++', 'clang', 'cmake'],
    examples: [
      {
        title: 'Modern C++ Features',
        description: 'C++20 features demonstration',
        code: `#include <iostream>
#include <vector>
#include <ranges>
#include <algorithm>

int main() {
    std::vector<int> numbers{1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
    
    // C++20 ranges
    auto even_squares = numbers 
        | std::views::filter([](int n) { return n % 2 == 0; })
        | std::views::transform([](int n) { return n * n; });
    
    std::cout << "Even squares: ";
    for (int value : even_squares) {
        std::cout << value << " ";
    }
    std::cout << std::endl;
    
    return 0;
}`,
        tags: ['cpp20', 'ranges']
      },
      {
        title: 'Smart Pointers',
        description: 'Modern memory management',
        code: `#include <iostream>
#include <memory>

class Resource {
public:
    Resource(int id) : id_(id) {
        std::cout << "Resource " << id_ << " created\\n";
    }
    
    ~Resource() {
        std::cout << "Resource " << id_ << " destroyed\\n";
    }
    
    void use() {
        std::cout << "Using resource " << id_ << "\\n";
    }

private:
    int id_;
};

int main() {
    auto ptr = std::make_unique<Resource>(1);
    ptr->use();
    
    auto shared = std::make_shared<Resource>(2);
    {
        auto shared2 = shared;
        shared2->use();
    } // shared2 goes out of scope
    
    shared->use(); // shared still valid
    
    return 0;
}`,
        tags: ['smart-pointers', 'memory']
      }
    ],
    documentation: 'https://en.cppreference.com/',
    icon: 'cpp',
    color: '#00599C',
    executionTimeout: 45,
    memoryLimit: 1024,
    cpuLimit: 1.0
  },

  java: {
    id: 'java',
    name: 'java',
    displayName: 'Java',
    version: '21 LTS',
    container: 'recoder-java',
    fileExtension: 'java',
    syntax: 'java',
    defaultCode: `// Welcome to Java 21!
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;
import java.time.LocalDateTime;

record Task(int id, String title, boolean completed, LocalDateTime createdAt) {
    public Task(int id, String title) {
        this(id, title, false, LocalDateTime.now());
    }
    
    public Task complete() {
        return new Task(id, title, true, createdAt);
    }
}

class TaskManager {
    private final Map<Integer, Task> tasks = new ConcurrentHashMap<>();
    private int nextId = 1;
    
    public synchronized Task addTask(String title) {
        Task task = new Task(nextId++, title);
        tasks.put(task.id(), task);
        System.out.println("Added task: " + title);
        return task;
    }
    
    public boolean completeTask(int id) {
        Task task = tasks.get(id);
        if (task != null && !task.completed()) {
            Task completedTask = task.complete();
            tasks.put(id, completedTask);
            System.out.println("Completed task: " + task.title());
            return true;
        }
        return false;
    }
    
    public List<Task> getPendingTasks() {
        return tasks.values().stream()
                .filter(task -> !task.completed())
                .sorted(Comparator.comparing(Task::createdAt))
                .collect(Collectors.toList());
    }
    
    public Map<String, Long> getSummary() {
        long total = tasks.size();
        long completed = tasks.values().stream()
                .mapToLong(task -> task.completed() ? 1 : 0)
                .sum();
        
        return Map.of(
            "total", total,
            "completed", completed,
            "pending", total - completed
        );
    }
}

public class Main {
    public static void main(String[] args) {
        TaskManager manager = new TaskManager();
        
        // Add tasks
        Task task1 = manager.addTask("Learn Java 21");
        Task task2 = manager.addTask("Build Spring Boot app");
        Task task3 = manager.addTask("Deploy to cloud");
        
        // Complete first task
        manager.completeTask(task1.id());
        
        // Show pending tasks
        System.out.println("\\nPending tasks:");
        manager.getPendingTasks().forEach(task -> 
            System.out.println("- " + task.title())
        );
        
        // Show summary
        System.out.println("\\nSummary:");
        manager.getSummary().forEach((key, value) ->
            System.out.println("  " + key + ": " + value)
        );
    }
}`,
    features: [
      { name: 'Java 21 LTS', description: 'Latest LTS Java version', supported: true },
      { name: 'Records', description: 'Modern data classes', supported: true },
      { name: 'Streams API', description: 'Functional programming', supported: true },
      { name: 'Maven/Gradle', description: 'Build tool integration', supported: true },
      { name: 'JVM Ecosystem', description: 'Access to JVM libraries', supported: true },
      { name: 'Concurrency', description: 'Threading and parallel processing', supported: true },
    ],
    packageManager: {
      name: 'maven',
      installCommand: 'mvn dependency:get',
      configFile: 'pom.xml',
      registry: 'https://mvnrepository.com',
      popularPackages: ['spring-boot', 'jackson', 'junit', 'guava', 'commons-lang3']
    },
    compileCommand: 'javac',
    runCommand: 'java',
    testCommand: 'junit',
    lintCommand: 'checkstyle',
    formatCommand: 'google-java-format',
    dependencies: ['openjdk-21', 'maven'],
    examples: [
      {
        title: 'Records and Streams',
        description: 'Modern Java features',
        code: `import java.util.*;
import java.util.stream.Collectors;

record Person(String name, int age, String city) {}

public class Main {
    public static void main(String[] args) {
        List<Person> people = List.of(
            new Person("Alice", 30, "New York"),
            new Person("Bob", 25, "London"),
            new Person("Charlie", 35, "New York"),
            new Person("Diana", 28, "Tokyo")
        );
        
        Map<String, List<String>> peopleByCity = people.stream()
            .collect(Collectors.groupingBy(
                Person::city,
                Collectors.mapping(Person::name, Collectors.toList())
            ));
        
        peopleByCity.forEach((city, names) ->
            System.out.println(city + ": " + String.join(", ", names))
        );
    }
}`,
        tags: ['records', 'streams']
      },
      {
        title: 'Switch Expressions',
        description: 'Modern switch syntax',
        code: `public class Main {
    public static void main(String[] args) {
        String day = "MONDAY";
        
        String dayType = switch (day) {
            case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
            case "SATURDAY", "SUNDAY" -> "Weekend";
            default -> "Unknown";
        };
        
        System.out.println(day + " is a " + dayType);
    }
}`,
        tags: ['switch-expressions', 'java21']
      }
    ],
    documentation: 'https://docs.oracle.com/en/java/',
    icon: 'java',
    color: '#ED8B00',
    executionTimeout: 45,
    memoryLimit: 1024,
    cpuLimit: 1.0
  }
};

export function getLanguageConfig(languageId: string): LanguageConfig | undefined {
  return SUPPORTED_LANGUAGES[languageId];
}

export function getAllLanguages(): LanguageConfig[] {
  return Object.values(SUPPORTED_LANGUAGES);
}

export function getLanguagesByFeature(feature: string): LanguageConfig[] {
  return getAllLanguages().filter(lang => 
    lang.features.some(f => f.name.toLowerCase().includes(feature.toLowerCase()) && f.supported)
  );
}
