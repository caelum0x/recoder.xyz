import OpenAI from 'openai';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

interface Issue {
  number: number;
  title: string;
}

interface Config {
  openRouterApiKey?: string;
  openRouterModel?: string;
}

const configPath = path.join(process.cwd(), '.recoderrc');
let config: Config = {};

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error reading .recoderrc:', err.message);
    } else {
      console.error('Error reading .recoderrc:', String(err));
    }
    process.exit(1);
  }
}

const openai = new (OpenAI as any)({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.openRouterApiKey || process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.SITE_URL, // Optional. Site URL for rankings on openrouter.ai.
    'X-Title': process.env.SITE_NAME, // Optional. Site title for rankings on openrouter.ai.
    'X-Model': config.openRouterModel || process.env.MODEL, // Use the imported model
  },
});

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function fetchIssues(owner: string, repo: string): Promise<Issue[]> {
  try {
    const response = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open',
    });
    return response.data as Issue[];
  } catch (error) {
    console.error('Error fetching issues:', error);
    throw error;
  }
}

async function closeIssue(owner: string, repo: string, issueNumber: number, comment: string): Promise<void> {
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: comment,
    });
    await octokit.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      state: 'closed',
    });
    console.log(`Closed issue #${issueNumber}`);
  } catch (error) {
    console.error(`Error closing issue #${issueNumber}:`, error);
    throw error;
  }
}

async function findDuplicates(issues: Issue[]): Promise<{ [key: string]: number[] }> {
  const titleMap: { [key: string]: number[] } = {};
  issues.forEach((issue, index) => {
    const title = issue.title.toLowerCase();
    if (!titleMap[title]) {
      titleMap[title] = [];
    }
    titleMap[title].push(index);
  });
  return Object.entries(titleMap)
    .filter(([_, indices]) => indices.length > 1)
    .reduce((acc, [title, indices]) => ({ ...acc, [title]: indices.map(i => issues[i].number) }), {});
}

export async function autoCloseDuplicates(): Promise<void> {
  const token = config.openRouterApiKey || process.env.OPENROUTER_API_KEY;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const issues = await fetchIssues(owner, repo);
  if (issues.length === 0) {
    console.log('No open issues found.');
    return;
  }

  const duplicates = await findDuplicates(issues);
  for (const [title, issueNumbers] of Object.entries(duplicates)) {
    const primaryIssue = issueNumbers[0];
    const duplicateIssues = issueNumbers.slice(1);

    for (const issueNumber of duplicateIssues) {
      await closeIssue(owner, repo, issueNumber, `Closing as duplicate of #${primaryIssue}`);
    }
  }
}

export async function getGitHubData(owner: string, repo: string): Promise<any> {
  try {
    const response = await octokit.repos.get({
      owner,
      repo,
    });
    return response.data;
  } catch (error) {
    if (error instanceof Error && 'status' in error) {
      if (error.status === 404) {
        throw new Error('Repository not found');
      } else if (error.status === 403) {
        throw new Error('User not found');
      } else {
        console.error('Error fetching GitHub data:', error);
        throw error;
      }
    } else {
      console.error('Unexpected error fetching GitHub data:', error);
      throw error;
    }
  }
}