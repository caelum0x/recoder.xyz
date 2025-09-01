import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import logger from '@/lib/logger';

interface ProjectAnalytics {
  projectId: string;
  metrics: {
    totalFiles: number;
    totalLines: number;
    languages: { [key: string]: number };
    fileTypes: { [key: string]: number };
    lastModified: string;
    collaborators: string[];
    deployments: number;
    buildTime: number;
    codeComplexity: {
      low: number;
      medium: number;
      high: number;
    };
    aiGeneratedLines: number;
    testCoverage?: number;
  };
  activity: {
    commits: number;
    edits: number;
    aiGenerations: number;
    previews: number;
    collaborationSessions: number;
  };
  performance: {
    buildTimes: number[];
    deploymentTimes: number[];
    errorRate: number;
    successRate: number;
  };
  insights: {
    mostActiveFiles: string[];
    productivityScore: number;
    codeQualityScore: number;
    suggestions: string[];
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const projectPath = path.join(process.cwd(), 'projects', projectId);

    if (!fs.existsSync(projectPath)) {
      return NextResponse.json({
        success: false,
        error: 'Project not found'
      }, { status: 404 });
    }

    // Calculate analytics
    const analytics = await calculateProjectAnalytics(projectId, projectPath);

    return NextResponse.json({
      success: true,
      data: analytics
    });

  } catch (error) {
    logger.error('Error calculating project analytics:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to calculate analytics'
    }, { status: 500 });
  }
}

async function calculateProjectAnalytics(projectId: string, projectPath: string): Promise<ProjectAnalytics> {
  const analytics: ProjectAnalytics = {
    projectId,
    metrics: {
      totalFiles: 0,
      totalLines: 0,
      languages: {},
      fileTypes: {},
      lastModified: '',
      collaborators: [],
      deployments: 0,
      buildTime: 0,
      codeComplexity: { low: 0, medium: 0, high: 0 },
      aiGeneratedLines: 0
    },
    activity: {
      commits: 0,
      edits: 0,
      aiGenerations: 0,
      previews: 0,
      collaborationSessions: 0
    },
    performance: {
      buildTimes: [],
      deploymentTimes: [],
      errorRate: 0,
      successRate: 100
    },
    insights: {
      mostActiveFiles: [],
      productivityScore: 0,
      codeQualityScore: 0,
      suggestions: []
    }
  };

  // Analyze project files
  await analyzeProjectFiles(projectPath, analytics);

  // Load metadata if exists
  const metadataPath = path.join(projectPath, '.recoder', 'metadata.json');
  if (fs.existsSync(metadataPath)) {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    
    // Extract deployment info
    if (metadata.deployments) {
      analytics.metrics.deployments = metadata.deployments.length;
      analytics.performance.deploymentTimes = metadata.deployments
        .filter((d: any) => d.buildTime)
        .map((d: any) => d.buildTime);
    }

    // Extract collaboration info
    if (metadata.collaborators) {
      analytics.metrics.collaborators = metadata.collaborators;
    }

    // Extract activity metrics
    if (metadata.activity) {
      analytics.activity = { ...analytics.activity, ...metadata.activity };
    }
  }

  // Calculate insights
  calculateInsights(analytics);

  return analytics;
}

async function analyzeProjectFiles(projectPath: string, analytics: ProjectAnalytics) {
  const analyzeDirectory = (dirPath: string) => {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        // Skip node_modules and .git directories
        if (!['node_modules', '.git', '.next', 'dist', 'build'].includes(item)) {
          analyzeDirectory(itemPath);
        }
      } else {
        analyzeFile(itemPath, analytics);
      }
    }
  };

  analyzeDirectory(projectPath);
}

function analyzeFile(filePath: string, analytics: ProjectAnalytics) {
  const ext = path.extname(filePath).toLowerCase();
  const fileName = path.basename(filePath);

  // Skip non-code files
  if (['.log', '.tmp', '.cache', '.lock'].includes(ext)) {
    return;
  }

  analytics.metrics.totalFiles++;

  // Count file types
  const fileType = ext || 'no-extension';
  analytics.metrics.fileTypes[fileType] = (analytics.metrics.fileTypes[fileType] || 0) + 1;

  // Determine language
  let language = 'other';
  switch (ext) {
    case '.js':
    case '.jsx':
      language = 'javascript';
      break;
    case '.ts':
    case '.tsx':
      language = 'typescript';
      break;
    case '.py':
      language = 'python';
      break;
    case '.java':
      language = 'java';
      break;
    case '.cpp':
    case '.c':
      language = 'c++';
      break;
    case '.html':
      language = 'html';
      break;
    case '.css':
      language = 'css';
      break;
    case '.scss':
    case '.sass':
      language = 'scss';
      break;
    case '.json':
      language = 'json';
      break;
    case '.md':
      language = 'markdown';
      break;
  }

  analytics.metrics.languages[language] = (analytics.metrics.languages[language] || 0) + 1;

  // Count lines of code
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    analytics.metrics.totalLines += lines.length;

    // Check for AI-generated code markers
    if (content.includes('// Generated by AI') || content.includes('// AI-generated')) {
      analytics.metrics.aiGeneratedLines += lines.length;
    }

    // Simple complexity analysis
    const complexityIndicators = [
      /for\s*\(/g,
      /while\s*\(/g,
      /if\s*\(/g,
      /switch\s*\(/g,
      /catch\s*\(/g,
      /function\s+\w+/g,
      /=>\s*{/g
    ];

    let complexity = 0;
    complexityIndicators.forEach(regex => {
      const matches = content.match(regex);
      if (matches) complexity += matches.length;
    });

    if (complexity < 5) analytics.metrics.codeComplexity.low++;
    else if (complexity < 15) analytics.metrics.codeComplexity.medium++;
    else analytics.metrics.codeComplexity.high++;

  } catch (error) {
    // Binary file or read error, skip content analysis
  }

  // Update last modified
  const stat = fs.statSync(filePath);
  if (!analytics.metrics.lastModified || stat.mtime > new Date(analytics.metrics.lastModified)) {
    analytics.metrics.lastModified = stat.mtime.toISOString();
  }
}

function calculateInsights(analytics: ProjectAnalytics) {
  // Calculate productivity score
  const fileScore = Math.min(analytics.metrics.totalFiles / 50, 1) * 25;
  const lineScore = Math.min(analytics.metrics.totalLines / 1000, 1) * 25;
  const activityScore = Math.min(analytics.activity.edits / 100, 1) * 25;
  const collaborationScore = Math.min(analytics.metrics.collaborators.length / 5, 1) * 25;
  
  analytics.insights.productivityScore = Math.round(fileScore + lineScore + activityScore + collaborationScore);

  // Calculate code quality score
  const complexityRatio = analytics.metrics.codeComplexity.low / analytics.metrics.totalFiles;
  const languageVariety = Object.keys(analytics.metrics.languages).length;
  const aiAssistedRatio = analytics.metrics.aiGeneratedLines / analytics.metrics.totalLines;
  
  analytics.insights.codeQualityScore = Math.round(
    (complexityRatio * 40) + 
    (Math.min(languageVariety / 3, 1) * 30) + 
    (Math.min(aiAssistedRatio * 2, 1) * 30)
  );

  // Generate suggestions
  const suggestions: string[] = [];
  
  if (analytics.metrics.totalFiles < 5) {
    suggestions.push('Consider adding more components to improve project structure');
  }
  
  if (analytics.metrics.codeComplexity.high > analytics.metrics.codeComplexity.low) {
    suggestions.push('Consider refactoring complex functions for better maintainability');
  }
  
  if (analytics.metrics.collaborators.length === 0) {
    suggestions.push('Invite team members to collaborate on this project');
  }
  
  if (analytics.metrics.deployments === 0) {
    suggestions.push('Deploy your project to see it live');
  }
  
  if (!analytics.metrics.languages.typescript && analytics.metrics.languages.javascript) {
    suggestions.push('Consider migrating to TypeScript for better type safety');
  }

  analytics.insights.suggestions = suggestions;

  // Most active files (mock data for now)
  analytics.insights.mostActiveFiles = [
    'src/App.jsx',
    'src/components/Button.jsx',
    'src/utils/helpers.js'
  ].slice(0, Math.min(3, analytics.metrics.totalFiles));
}
