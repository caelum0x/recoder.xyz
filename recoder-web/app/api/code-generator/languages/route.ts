// Supported languages API for the Multi-language Code Generator
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

export interface Language {
  id: string;
  name: string;
  version: string;
  fileExtension: string;
  dockerImage: string;
  compilerCommand: string;
  runCommand: string;
  examples: {
    helloWorld: string;
    fibonacci: string;
  };
  features: string[];
  documentation: string;
  popularity: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

const SUPPORTED_LANGUAGES: Language[] = [
  {
    id: 'javascript',
    name: 'JavaScript',
    version: 'Node.js 20',
    fileExtension: '.js',
    dockerImage: 'node:20-alpine',
    compilerCommand: 'node',
    runCommand: 'node {filename}',
    examples: {
      helloWorld: `console.log("Hello, World!");`,
      fibonacci: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci(10):", fibonacci(10));`
    },
    features: ['Dynamic typing', 'Event-driven', 'First-class functions', 'Prototype-based OOP'],
    documentation: 'https://nodejs.org/docs/',
    popularity: 95,
    difficulty: 'beginner'
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    version: '5.7.2',
    fileExtension: '.ts',
    dockerImage: 'node:20-alpine',
    compilerCommand: 'tsc',
    runCommand: 'tsc {filename} && node {filename.replace(".ts", ".js")}',
    examples: {
      helloWorld: `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet("World"));`,
      fibonacci: `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log("Fibonacci(10):", fibonacci(10));`
    },
    features: ['Static typing', 'Modern JavaScript', 'Interfaces', 'Generics'],
    documentation: 'https://www.typescriptlang.org/docs/',
    popularity: 85,
    difficulty: 'intermediate'
  },
  {
    id: 'python',
    name: 'Python',
    version: '3.12',
    fileExtension: '.py',
    dockerImage: 'python:3.12-alpine',
    compilerCommand: 'python3',
    runCommand: 'python3 {filename}',
    examples: {
      helloWorld: `print("Hello, World!")`,
      fibonacci: `def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print("Fibonacci(10):", fibonacci(10))`
    },
    features: ['Dynamic typing', 'Interpreted', 'Object-oriented', 'Functional programming'],
    documentation: 'https://docs.python.org/3/',
    popularity: 90,
    difficulty: 'beginner'
  },
  {
    id: 'java',
    name: 'Java',
    version: '21 LTS',
    fileExtension: '.java',
    dockerImage: 'openjdk:21-alpine',
    compilerCommand: 'javac',
    runCommand: 'javac {filename} && java {classname}',
    examples: {
      helloWorld: `public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
      fibonacci: `public class Fibonacci {
    public static int fibonacci(int n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
    
    public static void main(String[] args) {
        System.out.println("Fibonacci(10): " + fibonacci(10));
    }
}`
    },
    features: ['Static typing', 'Object-oriented', 'Platform independent', 'Memory management'],
    documentation: 'https://docs.oracle.com/en/java/',
    popularity: 85,
    difficulty: 'intermediate'
  },
  {
    id: 'cpp',
    name: 'C++',
    version: 'GCC 13',
    fileExtension: '.cpp',
    dockerImage: 'gcc:13-alpine',
    compilerCommand: 'g++',
    runCommand: 'g++ -o output {filename} && ./output',
    examples: {
      helloWorld: `#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
      fibonacci: `#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    cout << "Fibonacci(10): " << fibonacci(10) << endl;
    return 0;
}`
    },
    features: ['Static typing', 'Low-level control', 'Object-oriented', 'High performance'],
    documentation: 'https://en.cppreference.com/',
    popularity: 75,
    difficulty: 'advanced'
  },
  {
    id: 'rust',
    name: 'Rust',
    version: '1.85',
    fileExtension: '.rs',
    dockerImage: 'rust:1.85-alpine',
    compilerCommand: 'rustc',
    runCommand: 'rustc {filename} && ./output',
    examples: {
      helloWorld: `fn main() {
    println!("Hello, World!");
}`,
      fibonacci: `fn fibonacci(n: u32) -> u32 {
    if n <= 1 {
        return n;
    }
    fibonacci(n - 1) + fibonacci(n - 2)
}

fn main() {
    println!("Fibonacci(10): {}", fibonacci(10));
}`
    },
    features: ['Memory safety', 'Zero-cost abstractions', 'Concurrent programming', 'System programming'],
    documentation: 'https://doc.rust-lang.org/',
    popularity: 70,
    difficulty: 'advanced'
  },
  {
    id: 'go',
    name: 'Go',
    version: '1.23',
    fileExtension: '.go',
    dockerImage: 'golang:1.23-alpine',
    compilerCommand: 'go',
    runCommand: 'go run {filename}',
    examples: {
      helloWorld: `package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
      fibonacci: `package main

import "fmt"

func fibonacci(n int) int {
    if n <= 1 {
        return n
    }
    return fibonacci(n-1) + fibonacci(n-2)
}

func main() {
    fmt.Printf("Fibonacci(10): %d\\n", fibonacci(10))
}`
    },
    features: ['Static typing', 'Garbage collection', 'Concurrency', 'Fast compilation'],
    documentation: 'https://golang.org/doc/',
    popularity: 78,
    difficulty: 'intermediate'
  },
  {
    id: 'php',
    name: 'PHP',
    version: '8.3',
    fileExtension: '.php',
    dockerImage: 'php:8.3-alpine',
    compilerCommand: 'php',
    runCommand: 'php {filename}',
    examples: {
      helloWorld: `<?php
echo "Hello, World!\\n";
?>`,
      fibonacci: `<?php
function fibonacci($n) {
    if ($n <= 1) return $n;
    return fibonacci($n - 1) + fibonacci($n - 2);
}

echo "Fibonacci(10): " . fibonacci(10) . "\\n";
?>`
    },
    features: ['Dynamic typing', 'Web development', 'Server-side scripting', 'Large ecosystem'],
    documentation: 'https://www.php.net/docs.php',
    popularity: 65,
    difficulty: 'beginner'
  },
  {
    id: 'csharp',
    name: 'C#',
    version: '.NET 9',
    fileExtension: '.cs',
    dockerImage: 'mcr.microsoft.com/dotnet/sdk:9.0-alpine',
    compilerCommand: 'dotnet',
    runCommand: 'dotnet run',
    examples: {
      helloWorld: `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}`,
      fibonacci: `using System;

class Program {
    static int Fibonacci(int n) {
        if (n <= 1) return n;
        return Fibonacci(n - 1) + Fibonacci(n - 2);
    }
    
    static void Main() {
        Console.WriteLine($"Fibonacci(10): {Fibonacci(10)}");
    }
}`
    },
    features: ['Static typing', 'Object-oriented', '.NET ecosystem', 'Memory managed'],
    documentation: 'https://docs.microsoft.com/en-us/dotnet/csharp/',
    popularity: 80,
    difficulty: 'intermediate'
  },
  {
    id: 'ruby',
    name: 'Ruby',
    version: '3.3',
    fileExtension: '.rb',
    dockerImage: 'ruby:3.3-alpine',
    compilerCommand: 'ruby',
    runCommand: 'ruby {filename}',
    examples: {
      helloWorld: `puts "Hello, World!"`,
      fibonacci: `def fibonacci(n)
  return n if n <= 1
  fibonacci(n - 1) + fibonacci(n - 2)
end

puts "Fibonacci(10): #{fibonacci(10)}"`
    },
    features: ['Dynamic typing', 'Object-oriented', 'Expressive syntax', 'Metaprogramming'],
    documentation: 'https://ruby-doc.org/',
    popularity: 60,
    difficulty: 'beginner'
  }
];

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const languageId = url.searchParams.get('id');
    const category = url.searchParams.get('category');
    const difficulty = url.searchParams.get('difficulty');

    let languages = SUPPORTED_LANGUAGES;

    // Filter by specific language
    if (languageId) {
      const language = languages.find(lang => lang.id === languageId);
      if (!language) {
        return Response.json({ error: 'Language not found' }, { status: 404 });
      }
      return Response.json(language);
    }

    // Filter by difficulty
    if (difficulty && ['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
      languages = languages.filter(lang => lang.difficulty === difficulty);
    }

    // Sort by popularity by default
    languages = languages.sort((a, b) => b.popularity - a.popularity);

    return Response.json({
      languages,
      meta: {
        total: languages.length,
        popular: languages.filter(l => l.popularity >= 80).length,
        beginner: languages.filter(l => l.difficulty === 'beginner').length,
        intermediate: languages.filter(l => l.difficulty === 'intermediate').length,
        advanced: languages.filter(l => l.difficulty === 'advanced').length,
      }
    });

  } catch (error) {
    console.error('Languages API error:', error);
    return Response.json(
      { error: 'Failed to fetch supported languages' },
      { status: 500 }
    );
  }
}

export const runtime = "edge";