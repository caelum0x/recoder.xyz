/**
 * Code Graph commands - connect repositories and inspect their code graph.
 *
 * Talks to the Recoder backend code-graph routes mounted on
 * `/api/agent-os/code-graph` (authenticateRequest). Reuses the CLI's existing
 * authed `apiClient`, which attaches the stored device-flow Bearer token and
 * handles 401s. The routes are flag-gated server-side
 * (RECODER_CODE_GRAPH_ENABLED) and return `{ enabled: false }` when off.
 *
 * Subcommand logic lives in exported `run*` handlers so it can be unit-tested
 * with an injected fake client; the `create*Command` builders only wire those
 * handlers into commander.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';
import { Logger } from 'recoder-shared';
import { apiClient } from '../services/api';

const BASE_PATH = '/api/agent-os/code-graph';

// Minimal shape of the CLI's authed api client. Lets tests inject a fake.
export interface CodeGraphApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    suggestions?: string[];
  };
}

export interface CodeGraphApiClient {
  get<T = any>(url: string): Promise<CodeGraphApiResponse<T>>;
  post<T = any>(url: string, data?: any): Promise<CodeGraphApiResponse<T>>;
}

interface ConnectResult {
  enabled?: boolean;
  repoId?: string;
  status?: string;
  nodes?: number;
  edges?: number;
}

// A connected-repo summary (backend PublicRepo: repoId is the identifier; there
// is no separate repo/name field).
interface RepoSummary {
  repoId?: string;
  status?: string;
  nodes?: number;
  edges?: number;
  branch?: string;
  indexedAt?: string;
  cloneUrl?: string | null;
}

interface ReposResult {
  enabled?: boolean;
  repos?: RepoSummary[];
}

// Backend status payload: { enabled, status, state?: IndexState } — the counts
// and timestamps live UNDER `state`, not at the top level.
interface StatusResult {
  enabled?: boolean;
  status?: string;
  state?: {
    repoId?: string;
    nodes?: number;
    edges?: number;
    branch?: string;
    indexedAt?: string;
  } | null;
}

// Backend domain-map payload: { enabled, map: { repoId, domains, crossEdges } }.
interface DomainMapResult {
  enabled?: boolean;
  map?: {
    repoId?: string;
    domains?: Array<{ name?: string; files?: number; description?: string }>;
    crossEdges?: unknown[];
  };
}

interface OutputOptions {
  json?: boolean;
}

// ---------------------------------------------------------------------------
// Command wiring
// ---------------------------------------------------------------------------

/**
 * Create the `code-graph` command group.
 *
 * @param client - authed api client (defaults to the shared CLI apiClient);
 *                 injectable so tests can pass a fake.
 */
export function createCodeGraphCommand(client: CodeGraphApiClient = apiClient): Command {
  const command = new Command('code-graph');

  command
    .description('Connect repositories and inspect their code graph')
    .addCommand(createConnectCommand(client))
    .addCommand(createReposCommand(client))
    .addCommand(createStatusCommand(client))
    .addCommand(createDomainMapCommand(client));

  return command;
}

function createConnectCommand(client: CodeGraphApiClient): Command {
  return new Command('connect')
    .description('Connect a repository and build its code graph')
    .argument('<owner/repo>', 'Repository in owner/name form (or a clone URL)')
    .option('--ref <branch>', 'Git ref / branch to index')
    .option('--json', 'Output as JSON', false)
    .action((repo: string, options: { ref?: string } & OutputOptions) => runConnect(client, repo, options));
}

function createReposCommand(client: CodeGraphApiClient): Command {
  return new Command('repos')
    .description('List connected repositories')
    .option('--json', 'Output as JSON', false)
    .action((options: OutputOptions) => runRepos(client, options));
}

function createStatusCommand(client: CodeGraphApiClient): Command {
  return new Command('status')
    .description('Show the index status of a connected repository')
    .argument('<repoId>', 'Repository ID')
    .option('--json', 'Output as JSON', false)
    .action((repoId: string, options: OutputOptions) => runStatus(client, repoId, options));
}

function createDomainMapCommand(client: CodeGraphApiClient): Command {
  return new Command('domain-map')
    .description('Show the domain map of a connected repository')
    .argument('<repoId>', 'Repository ID')
    .option('--json', 'Output as JSON', false)
    .action((repoId: string, options: OutputOptions) => runDomainMap(client, repoId, options));
}

// ---------------------------------------------------------------------------
// Handlers (unit-testable)
// ---------------------------------------------------------------------------

export async function runConnect(
  client: CodeGraphApiClient,
  repo: string,
  options: { ref?: string } & OutputOptions = {}
): Promise<void> {
  const spinner = ora(`Connecting ${repo}...`).start();

  try {
    const body: { repo: string; ref?: string } = { repo };
    if (options.ref) body.ref = options.ref;

    const response = await client.post(`${BASE_PATH}/connect`, body);
    const data = handleResponse<ConnectResult>(response, spinner);
    if (!data) return;

    if (isDisabled(data)) {
      printDisabled(spinner);
      return;
    }

    spinner.succeed(chalk.green(`Connected ${repo}`));

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    console.log(
      `${chalk.yellow('Repo ID:')} ${data.repoId ?? 'unknown'}\n` +
        `${chalk.yellow('Status:')}  ${colorStatus(data.status)}\n` +
        `${chalk.yellow('Nodes:')}   ${data.nodes ?? 0}\n` +
        `${chalk.yellow('Edges:')}   ${data.edges ?? 0}`
    );
  } catch (error) {
    failSpinner(spinner, 'Failed to connect repository', error);
  }
}

export async function runRepos(client: CodeGraphApiClient, options: OutputOptions = {}): Promise<void> {
  const spinner = ora('Fetching repositories...').start();

  try {
    const response = await client.get(`${BASE_PATH}/repos`);
    const data = handleResponse<ReposResult>(response, spinner);
    if (!data) return;

    if (isDisabled(data)) {
      printDisabled(spinner);
      return;
    }

    const repos = data.repos ?? [];
    spinner.succeed(`Found ${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}`);

    if (options.json) {
      console.log(JSON.stringify(repos, null, 2));
      return;
    }

    if (repos.length === 0) {
      console.log(chalk.yellow('No repositories connected.'));
      console.log(chalk.gray('Connect one with: recoder code-graph connect <owner/repo>'));
      return;
    }

    const table = new Table({
      head: [chalk.blue('Repo ID'), chalk.blue('Branch'), chalk.blue('Status'), chalk.blue('Nodes'), chalk.blue('Edges')],
    });

    repos.forEach((r) => {
      table.push([
        r.repoId ?? '—',
        r.branch ?? '—',
        colorStatus(r.status),
        (r.nodes ?? 0).toString(),
        (r.edges ?? 0).toString(),
      ]);
    });

    console.log(table.toString());
  } catch (error) {
    failSpinner(spinner, 'Failed to fetch repositories', error);
  }
}

export async function runStatus(
  client: CodeGraphApiClient,
  repoId: string,
  options: OutputOptions = {}
): Promise<void> {
  const spinner = ora('Fetching status...').start();

  try {
    const response = await client.get(`${BASE_PATH}/${repoId}/status`);
    const data = handleResponse<StatusResult>(response, spinner);
    if (!data) return;

    if (isDisabled(data)) {
      printDisabled(spinner);
      return;
    }

    spinner.succeed('Status retrieved');

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    // Be truthful about the index state: indexed / stale / not_indexed.
    // Counts/timestamps live under `state`.
    const status = data.status ?? 'unknown';
    const state = data.state ?? undefined;
    console.log(
      `${chalk.yellow('Repo ID:')} ${state?.repoId ?? repoId}\n` +
        `${chalk.yellow('Status:')}  ${colorStatus(status)}\n` +
        `${chalk.yellow('Nodes:')}   ${state?.nodes ?? 0}\n` +
        `${chalk.yellow('Edges:')}   ${state?.edges ?? 0}` +
        (state?.indexedAt ? `\n${chalk.yellow('Indexed:')} ${state.indexedAt}` : '')
    );

    if (status === 'not_indexed') {
      console.log(chalk.gray('\nThis repository has not been indexed yet.'));
      console.log(chalk.gray('Run: recoder code-graph connect <owner/repo>'));
    } else if (status === 'stale') {
      console.log(chalk.gray('\nThe index is stale. Re-connect to refresh it.'));
    }
  } catch (error) {
    failSpinner(spinner, 'Failed to fetch status', error);
  }
}

export async function runDomainMap(
  client: CodeGraphApiClient,
  repoId: string,
  options: OutputOptions = {}
): Promise<void> {
  const spinner = ora('Fetching domain map...').start();

  try {
    const response = await client.get(`${BASE_PATH}/${repoId}/domain-map`);
    const data = handleResponse<DomainMapResult>(response, spinner);
    if (!data) return;

    if (isDisabled(data)) {
      printDisabled(spinner);
      return;
    }

    spinner.succeed('Domain map retrieved');

    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    const domains = data.map?.domains ?? [];
    if (domains.length === 0) {
      console.log(chalk.yellow('No domains found for this repository.'));
      return;
    }

    const table = new Table({
      head: [chalk.blue('Domain'), chalk.blue('Files'), chalk.blue('Description')],
    });

    domains.forEach((d) => {
      table.push([d.name ?? '—', (d.files ?? 0).toString(), d.description ?? '']);
    });

    console.log(table.toString());
  } catch (error) {
    failSpinner(spinner, 'Failed to fetch domain map', error);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Inspect the api response envelope. Returns the inner payload on success, or
 * null after printing a clear error (auth, server, etc.) on failure.
 *
 * NOTE: the CLI's apiClient sets `ApiResponse.data` to the RAW HTTP body, which
 * is itself the backend envelope `{ success, data: PAYLOAD }`. So the real
 * payload is one level deeper (`response.data.data`) — unwrap it here. (Getting
 * this wrong silently shows empty/0 fields, which is what the contract test now
 * guards against.)
 */
function handleResponse<T>(response: CodeGraphApiResponse<unknown>, spinner: Ora): T | null {
  if (response.success && response.data && typeof response.data === 'object') {
    const body = response.data as { success?: boolean; data?: T; error?: { message?: string } };
    if (body.success !== false && body.data !== undefined) {
      return body.data;
    }
    // Backend returned a server-level error envelope inside a 2xx (rare).
    if (body.error?.message) {
      spinner.fail(chalk.red(body.error.message));
      process.exitCode = 1;
      return null;
    }
  }

  const code = response.error?.code;
  if (code === 'AUTH_REQUIRED' || code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
    spinner.fail(chalk.red('Authentication required'));
    console.log(chalk.yellow('Please login first: ') + chalk.cyan('recoder auth login'));
    process.exitCode = 1;
    return null;
  }

  spinner.fail(chalk.red(response.error?.message || 'Request failed'));
  if (response.error?.code) {
    console.log(chalk.gray(`Error code: ${response.error.code}`));
  }
  process.exitCode = 1;
  return null;
}

function isDisabled(data: { enabled?: boolean }): boolean {
  return data?.enabled === false;
}

function printDisabled(spinner: Ora): void {
  spinner.info(chalk.yellow('Code graph is not enabled'));
  console.log(chalk.gray('\nThe code graph feature is turned off on the server.'));
  console.log(chalk.gray('Ask an administrator to set RECODER_CODE_GRAPH_ENABLED=true to enable it.'));
}

function colorStatus(status?: string): string {
  switch (status) {
    case 'indexed':
      return chalk.green(status);
    case 'stale':
      return chalk.yellow(status);
    case 'not_indexed':
      return chalk.red(status);
    default:
      return chalk.gray(status ?? 'unknown');
  }
}

function failSpinner(spinner: Ora, message: string, error: unknown): void {
  spinner.fail(chalk.red(message));
  const detail = error instanceof Error ? error.message : String(error);
  Logger.error(`${message}: ${detail}`);
  console.error(chalk.red(detail));
  process.exitCode = 1;
}

export default createCodeGraphCommand;
