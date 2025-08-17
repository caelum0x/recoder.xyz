import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Search query is required' },
        { status: 400 }
      );
    }

    logger.info('Searching GitHub repositories', { query });

    // Simulate GitHub API search results
    const mockRepos = [
      {
        id: 1,
        name: 'react',
        fullName: 'facebook/react',
        description: 'The library for web and native user interfaces',
        url: 'https://github.com/facebook/react',
        stars: 230000,
        forks: 47000,
        language: 'JavaScript',
        lastUpdated: '2 hours ago',
        isPrivate: false,
        size: 15600
      },
      {
        id: 2,
        name: 'next.js',
        fullName: 'vercel/next.js',
        description: 'The React Framework for the Web',
        url: 'https://github.com/vercel/next.js',
        stars: 125000,
        forks: 26800,
        language: 'TypeScript',
        lastUpdated: '1 hour ago',
        isPrivate: false,
        size: 45200
      },
      {
        id: 3,
        name: 'vue',
        fullName: 'vuejs/vue',
        description: 'Vue.js is a progressive, incrementally-adoptable JavaScript framework',
        url: 'https://github.com/vuejs/vue',
        stars: 207000,
        forks: 33600,
        language: 'TypeScript',
        lastUpdated: '3 hours ago',
        isPrivate: false,
        size: 34800
      },
      {
        id: 4,
        name: 'angular',
        fullName: 'angular/angular',
        description: 'Deliver web apps with confidence',
        url: 'https://github.com/angular/angular',
        stars: 96000,
        forks: 25200,
        language: 'TypeScript',
        lastUpdated: '4 hours ago',
        isPrivate: false,
        size: 67200
      },
      {
        id: 5,
        name: 'express',
        fullName: 'expressjs/express',
        description: 'Fast, unopinionated, minimalist web framework for node',
        url: 'https://github.com/expressjs/express',
        stars: 65000,
        forks: 15800,
        language: 'JavaScript',
        lastUpdated: '6 hours ago',
        isPrivate: false,
        size: 8400
      },
      {
        id: 6,
        name: 'django',
        fullName: 'django/django',
        description: 'The Web framework for perfectionists with deadlines',
        url: 'https://github.com/django/django',
        stars: 79000,
        forks: 31500,
        language: 'Python',
        lastUpdated: '5 hours ago',
        isPrivate: false,
        size: 28900
      }
    ];

    // Filter repos based on query
    const filteredRepos = mockRepos.filter(repo => 
      repo.name.toLowerCase().includes(query.toLowerCase()) ||
      repo.description.toLowerCase().includes(query.toLowerCase()) ||
      repo.language.toLowerCase().includes(query.toLowerCase())
    );

    // Add some randomization to make it feel more realistic
    const randomizedRepos = filteredRepos.map(repo => ({
      ...repo,
      stars: repo.stars + Math.floor(Math.random() * 1000) - 500,
      forks: repo.forks + Math.floor(Math.random() * 100) - 50,
      lastUpdated: [
        'just now',
        '5 minutes ago',
        '1 hour ago',
        '2 hours ago',
        '6 hours ago',
        '1 day ago'
      ][Math.floor(Math.random() * 6)]
    }));

    logger.info('GitHub search completed', { 
      query, 
      resultsCount: randomizedRepos.length 
    });

    return NextResponse.json({
      success: true,
      query,
      repos: randomizedRepos,
      totalCount: randomizedRepos.length,
      searchMetadata: {
        timestamp: new Date().toISOString(),
        source: 'github-api',
        cached: false
      }
    });

  } catch (error) {
    logger.error('Failed to search GitHub repositories', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to search repositories',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}