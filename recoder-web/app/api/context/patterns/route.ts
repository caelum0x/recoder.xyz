import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    logger.info('Loading context patterns');

    // Simulate learned context patterns with realistic data
    const patterns = [
      {
        id: 'pattern-1',
        type: 'coding-style',
        pattern: 'Prefers functional programming with arrow functions',
        confidence: 0.92,
        frequency: 47,
        lastSeen: '2 hours ago',
        examples: [
          'const getUserData = async (id) => {...}',
          'const processItems = items => items.map(item => {...})'
        ]
      },
      {
        id: 'pattern-2',
        type: 'framework-preference',
        pattern: 'Consistently uses React with TypeScript',
        confidence: 0.98,
        frequency: 78,
        lastSeen: '30 minutes ago',
        examples: [
          'interface Props { title: string; }',
          'const Component: React.FC<Props> = ({ title }) => {...}'
        ]
      },
      {
        id: 'pattern-3',
        type: 'architecture-pattern',
        pattern: 'Follows component-based architecture with hooks',
        confidence: 0.89,
        frequency: 34,
        lastSeen: '1 hour ago',
        examples: [
          'const [state, setState] = useState(...)',
          'useEffect(() => {...}, [dependency])'
        ]
      },
      {
        id: 'pattern-4',
        type: 'naming-convention',
        pattern: 'Uses camelCase for variables, PascalCase for components',
        confidence: 0.94,
        frequency: 156,
        lastSeen: '45 minutes ago',
        examples: [
          'const userData = fetchUserData()',
          'const UserProfileComponent = () => {...}'
        ]
      },
      {
        id: 'pattern-5',
        type: 'coding-style',
        pattern: 'Prefers async/await over Promise chains',
        confidence: 0.87,
        frequency: 23,
        lastSeen: '3 hours ago',
        examples: [
          'const result = await api.getData()',
          'try { const data = await fetch(...) } catch (error) {...}'
        ]
      },
      {
        id: 'pattern-6',
        type: 'framework-preference',
        pattern: 'Uses Tailwind CSS for styling',
        confidence: 0.91,
        frequency: 67,
        lastSeen: '1 hour ago',
        examples: [
          'className="flex items-center justify-center"',
          'className="bg-blue-500 text-white px-4 py-2 rounded"'
        ]
      },
      {
        id: 'pattern-7',
        type: 'architecture-pattern',
        pattern: 'Implements custom hooks for state management',
        confidence: 0.83,
        frequency: 19,
        lastSeen: '4 hours ago',
        examples: [
          'const useUserData = () => { ... }',
          'const useLocalStorage = (key, initialValue) => { ... }'
        ]
      },
      {
        id: 'pattern-8',
        type: 'naming-convention',
        pattern: 'Prefixes boolean variables with "is", "has", or "should"',
        confidence: 0.88,
        frequency: 42,
        lastSeen: '2 hours ago',
        examples: [
          'const isLoading = false',
          'const hasPermission = checkPermission()',
          'const shouldRender = data && !error'
        ]
      }
    ];

    logger.info('Context patterns loaded', { 
      count: patterns.length,
      avgConfidence: patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
    });

    return NextResponse.json({
      success: true,
      patterns,
      metadata: {
        timestamp: new Date().toISOString(),
        totalPatterns: patterns.length,
        avgConfidence: Math.round(patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length * 100) / 100,
        categories: [...new Set(patterns.map(p => p.type))],
        learningStatus: 'active'
      },
      insights: [
        'Strong preference for modern JavaScript patterns detected',
        'Consistent TypeScript usage suggests advanced developer',
        'Component architecture shows React expertise',
        'Code quality patterns indicate best practices adherence'
      ]
    });

  } catch (error) {
    logger.error('Failed to load context patterns', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load context patterns',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}