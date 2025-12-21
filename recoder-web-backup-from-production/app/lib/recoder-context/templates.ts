/**
 * Default .recoder/ templates
 */

export const DEFAULT_CONTEXT = `# Project Context

This file provides context about your project to the AI assistant.

## Project Overview
Describe what your project does and its main goals.

## Tech Stack
List the main technologies, frameworks, and libraries used.

## Coding Conventions
- Describe your preferred coding style
- Naming conventions
- File organization

## Important Notes
Any specific requirements or constraints the AI should know about.
`;

export const DEFAULT_SPEC = `# Project Specification

## Features
List the main features of your project.

## Requirements
- Functional requirements
- Non-functional requirements

## Constraints
Any technical or business constraints.
`;

export const DEFAULT_PRD = `# Product Requirements Document

## Problem Statement
What problem does this project solve?

## Target Users
Who will use this product?

## Success Metrics
How will you measure success?

## User Stories
- As a [user type], I want to [action] so that [benefit]
`;

export const DEFAULT_ARCHITECTURE = `# System Architecture

## Overview
High-level architecture description.

## Components
List and describe main system components.

## Data Flow
How data moves through the system.

## External Dependencies
Third-party services and APIs used.
`;

export const DEFAULT_STYLE_GUIDE = `# Code Style Guide

## General Principles
- Write clean, readable code
- Follow DRY (Don't Repeat Yourself)
- Keep functions small and focused

## Naming Conventions
- Variables: camelCase
- Functions: camelCase
- Classes: PascalCase
- Constants: UPPER_SNAKE_CASE

## File Organization
Describe your preferred file structure.

## Comments
When and how to write comments.
`;

export const DEFAULT_API_DOCS = `# API Documentation

## Endpoints

### GET /api/example
Description of endpoint.

**Request:**
\`\`\`json
{
  "param": "value"
}
\`\`\`

**Response:**
\`\`\`json
{
  "result": "data"
}
\`\`\`
`;

export const DEFAULT_COMPONENT_PROMPT = `When generating React components:
- Use functional components with hooks
- Include TypeScript types
- Add prop validation
- Include basic styling
- Add accessibility attributes
- Write clean, readable code
`;

export const DEFAULT_API_PROMPT = `When generating API endpoints:
- Use RESTful conventions
- Include error handling
- Add input validation
- Return proper status codes
- Include TypeScript types
- Add JSDoc comments
`;

export const DEFAULT_TEST_PROMPT = `When generating tests:
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Test edge cases
- Mock external dependencies
- Aim for high coverage
- Keep tests simple and focused
`;

export interface RecoderTemplate {
  name: string;
  description: string;
  files: Record<string, string>;
}

export const TEMPLATES: Record<string, RecoderTemplate> = {
  'nextjs': {
    name: 'Next.js Project',
    description: 'Context for Next.js applications',
    files: {
      'context.md': `# Next.js Project Context

## Tech Stack
- Next.js 14+ (App Router)
- React 18+
- TypeScript
- Tailwind CSS

## Conventions
- Use Server Components by default
- Add 'use client' only when needed
- Keep components in /components
- API routes in /app/api
- Use TypeScript for all files
`,
      'style-guide.md': `# Next.js Style Guide

## Component Structure
- One component per file
- Export component as default
- Props interface above component
- Use TypeScript strict mode

## Server vs Client Components
- Default to Server Components
- Use Client Components for:
  - Event handlers
  - Browser APIs
  - State management
  - useEffect hooks
`,
    },
  },
  'react': {
    name: 'React Project',
    description: 'Context for React applications',
    files: {
      'context.md': `# React Project Context

## Tech Stack
- React 18+
- TypeScript
- Vite (or Create React App)

## Conventions
- Functional components with hooks
- Custom hooks for reusable logic
- Context API for state management
- CSS Modules or styled-components
`,
    },
  },
  'api': {
    name: 'API Project',
    description: 'Context for backend API projects',
    files: {
      'context.md': `# API Project Context

## Tech Stack
- Node.js
- Express/Fastify/Hono
- TypeScript
- Database (specify)

## Conventions
- RESTful API design
- Proper error handling
- Input validation
- Authentication/Authorization
- API versioning
`,
      'api-docs.md': DEFAULT_API_DOCS,
    },
  },
  'fullstack': {
    name: 'Full-Stack Project',
    description: 'Context for full-stack applications',
    files: {
      'context.md': `# Full-Stack Project Context

## Frontend
- Framework and libraries
- State management
- Styling approach

## Backend
- API framework
- Database
- Authentication

## Deployment
- Hosting platform
- CI/CD pipeline
`,
      'architecture.md': DEFAULT_ARCHITECTURE,
    },
  },
};

/**
 * Get template by project type
 */
export function getTemplate(type: keyof typeof TEMPLATES): RecoderTemplate | null {
  return TEMPLATES[type] || null;
}

/**
 * Get all available templates
 */
export function getAllTemplates(): RecoderTemplate[] {
  return Object.values(TEMPLATES);
}
