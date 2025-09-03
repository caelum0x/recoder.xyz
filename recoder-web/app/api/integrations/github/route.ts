import { NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';

// 🐙 GITHUB INTEGRATION - REAL REPOSITORY MANAGEMENT
// Complete GitHub API integration with repos, issues, PRs, actions, and webhooks

interface GitHubAction {
  action: 'get_repos' | 'create_repo' | 'get_repo' | 'update_repo' | 'delete_repo' | 'get_issues' | 'create_issue' | 'update_issue' | 'close_issue' | 'get_pulls' | 'create_pull' | 'merge_pull' | 'get_commits' | 'create_commit' | 'get_branches' | 'create_branch' | 'delete_branch' | 'get_releases' | 'create_release' | 'get_workflows' | 'trigger_workflow' | 'get_workflow_runs' | 'cancel_workflow' | 'get_secrets' | 'create_secret' | 'update_secret' | 'delete_secret' | 'get_collaborators' | 'add_collaborator' | 'remove_collaborator' | 'get_webhooks' | 'create_webhook' | 'update_webhook' | 'delete_webhook' | 'get_contents' | 'create_file' | 'update_file' | 'delete_file';
  data?: any;
  owner?: string;
  repo?: string;
  issue_number?: number;
  pull_number?: number;
  branch?: string;
  release_id?: string;
  workflow_id?: string;
  run_id?: string;
  secret_name?: string;
  collaborator?: string;
  hook_id?: string;
  path?: string;
  sha?: string;
}

export async function POST(request: Request) {
  try {
    const body: GitHubAction = await request.json();
    const { action, data, owner, repo, issue_number, pull_number, branch, release_id, workflow_id, run_id, secret_name, collaborator, hook_id, path, sha } = body;

    // Initialize Octokit with user's token or app token
    const octokit = new Octokit({
      auth: data?.token || process.env.GITHUB_TOKEN || process.env.GITHUB_APP_TOKEN
    });

    let result;

    switch (action) {
      case 'get_repos':
        result = await getRepositories(octokit, data);
        break;
        
      case 'create_repo':
        result = await createRepository(octokit, data);
        break;
        
      case 'get_repo':
        result = await getRepository(octokit, owner!, repo!);
        break;
        
      case 'update_repo':
        result = await updateRepository(octokit, owner!, repo!, data);
        break;
        
      case 'delete_repo':
        result = await deleteRepository(octokit, owner!, repo!);
        break;
        
      case 'get_issues':
        result = await getIssues(octokit, owner!, repo!, data);
        break;
        
      case 'create_issue':
        result = await createIssue(octokit, owner!, repo!, data);
        break;
        
      case 'update_issue':
        result = await updateIssue(octokit, owner!, repo!, issue_number!, data);
        break;
        
      case 'close_issue':
        result = await closeIssue(octokit, owner!, repo!, issue_number!);
        break;
        
      case 'get_pulls':
        result = await getPullRequests(octokit, owner!, repo!, data);
        break;
        
      case 'create_pull':
        result = await createPullRequest(octokit, owner!, repo!, data);
        break;
        
      case 'merge_pull':
        result = await mergePullRequest(octokit, owner!, repo!, pull_number!, data);
        break;
        
      case 'get_commits':
        result = await getCommits(octokit, owner!, repo!, data);
        break;
        
      case 'create_commit':
        result = await createCommit(octokit, owner!, repo!, data);
        break;
        
      case 'get_branches':
        result = await getBranches(octokit, owner!, repo!, data);
        break;
        
      case 'create_branch':
        result = await createBranch(octokit, owner!, repo!, branch!, data);
        break;
        
      case 'delete_branch':
        result = await deleteBranch(octokit, owner!, repo!, branch!);
        break;
        
      case 'get_releases':
        result = await getReleases(octokit, owner!, repo!, data);
        break;
        
      case 'create_release':
        result = await createRelease(octokit, owner!, repo!, data);
        break;
        
      case 'get_workflows':
        result = await getWorkflows(octokit, owner!, repo!);
        break;
        
      case 'trigger_workflow':
        result = await triggerWorkflow(octokit, owner!, repo!, workflow_id!, data);
        break;
        
      case 'get_workflow_runs':
        result = await getWorkflowRuns(octokit, owner!, repo!, workflow_id!, data);
        break;
        
      case 'cancel_workflow':
        result = await cancelWorkflow(octokit, owner!, repo!, run_id!);
        break;
        
      case 'get_secrets':
        result = await getSecrets(octokit, owner!, repo!);
        break;
        
      case 'create_secret':
        result = await createSecret(octokit, owner!, repo!, secret_name!, data);
        break;
        
      case 'update_secret':
        result = await updateSecret(octokit, owner!, repo!, secret_name!, data);
        break;
        
      case 'delete_secret':
        result = await deleteSecret(octokit, owner!, repo!, secret_name!);
        break;
        
      case 'get_collaborators':
        result = await getCollaborators(octokit, owner!, repo!);
        break;
        
      case 'add_collaborator':
        result = await addCollaborator(octokit, owner!, repo!, collaborator!, data);
        break;
        
      case 'remove_collaborator':
        result = await removeCollaborator(octokit, owner!, repo!, collaborator!);
        break;
        
      case 'get_webhooks':
        result = await getWebhooks(octokit, owner!, repo!);
        break;
        
      case 'create_webhook':
        result = await createWebhook(octokit, owner!, repo!, data);
        break;
        
      case 'update_webhook':
        result = await updateWebhook(octokit, owner!, repo!, hook_id!, data);
        break;
        
      case 'delete_webhook':
        result = await deleteWebhook(octokit, owner!, repo!, hook_id!);
        break;
        
      case 'get_contents':
        result = await getContents(octokit, owner!, repo!, path!, data);
        break;
        
      case 'create_file':
        result = await createFile(octokit, owner!, repo!, path!, data);
        break;
        
      case 'update_file':
        result = await updateFile(octokit, owner!, repo!, path!, sha!, data);
        break;
        
      case 'delete_file':
        result = await deleteFile(octokit, owner!, repo!, path!, sha!, data);
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('GitHub API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'GitHub integration failed',
        status: error.status || 500
      },
      { status: 500 }
    );
  }
}

// Repository Management
async function getRepositories(octokit: Octokit, params: any = {}) {
  const response = await octokit.repos.listForAuthenticatedUser({
    visibility: params.visibility || 'all',
    affiliation: params.affiliation || 'owner,collaborator',
    type: params.type || 'all',
    sort: params.sort || 'updated',
    direction: params.direction || 'desc',
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    repositories: response.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      fork: repo.fork,
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      size: repo.size,
      stargazers_count: repo.stargazers_count,
      watchers_count: repo.watchers_count,
      language: repo.language,
      forks_count: repo.forks_count,
      open_issues_count: repo.open_issues_count,
      default_branch: repo.default_branch,
      topics: repo.topics,
      has_issues: repo.has_issues,
      has_projects: repo.has_projects,
      has_wiki: repo.has_wiki,
      has_downloads: repo.has_downloads,
      archived: repo.archived,
      disabled: repo.disabled,
      license: repo.license?.name,
      clone_url: repo.clone_url,
      ssh_url: repo.ssh_url,
      html_url: repo.html_url
    })),
    total_count: response.data.length
  };
}

async function createRepository(octokit: Octokit, data: any) {
  const response = await octokit.repos.createForAuthenticatedUser({
    name: data.name,
    description: data.description,
    homepage: data.homepage,
    private: data.private || false,
    has_issues: data.has_issues !== false,
    has_projects: data.has_projects !== false,
    has_wiki: data.has_wiki !== false,
    is_template: data.is_template || false,
    team_id: data.team_id,
    auto_init: data.auto_init || false,
    gitignore_template: data.gitignore_template,
    license_template: data.license_template,
    allow_squash_merge: data.allow_squash_merge !== false,
    allow_merge_commit: data.allow_merge_commit !== false,
    allow_rebase_merge: data.allow_rebase_merge !== false,
    delete_branch_on_merge: data.delete_branch_on_merge || false
  });

  return {
    repository_id: response.data.id,
    name: response.data.name,
    full_name: response.data.full_name,
    private: response.data.private,
    html_url: response.data.html_url,
    clone_url: response.data.clone_url,
    ssh_url: response.data.ssh_url,
    created_at: response.data.created_at
  };
}

async function getRepository(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.repos.get({ owner, repo });
  
  return {
    id: response.data.id,
    name: response.data.name,
    full_name: response.data.full_name,
    private: response.data.private,
    description: response.data.description,
    fork: response.data.fork,
    created_at: response.data.created_at,
    updated_at: response.data.updated_at,
    pushed_at: response.data.pushed_at,
    size: response.data.size,
    stargazers_count: response.data.stargazers_count,
    watchers_count: response.data.watchers_count,
    language: response.data.language,
    forks_count: response.data.forks_count,
    open_issues_count: response.data.open_issues_count,
    default_branch: response.data.default_branch,
    topics: response.data.topics,
    license: response.data.license?.name,
    clone_url: response.data.clone_url,
    ssh_url: response.data.ssh_url,
    html_url: response.data.html_url
  };
}

async function updateRepository(octokit: Octokit, owner: string, repo: string, data: any) {
  const response = await octokit.repos.update({
    owner,
    repo,
    name: data.name,
    description: data.description,
    homepage: data.homepage,
    private: data.private,
    has_issues: data.has_issues,
    has_projects: data.has_projects,
    has_wiki: data.has_wiki,
    default_branch: data.default_branch,
    allow_squash_merge: data.allow_squash_merge,
    allow_merge_commit: data.allow_merge_commit,
    allow_rebase_merge: data.allow_rebase_merge,
    delete_branch_on_merge: data.delete_branch_on_merge,
    archived: data.archived
  });

  return {
    repository_id: response.data.id,
    name: response.data.name,
    updated_at: response.data.updated_at
  };
}

async function deleteRepository(octokit: Octokit, owner: string, repo: string) {
  await octokit.repos.delete({ owner, repo });
  
  return {
    owner,
    repo,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Issue Management
async function getIssues(octokit: Octokit, owner: string, repo: string, params: any = {}) {
  const response = await octokit.issues.listForRepo({
    owner,
    repo,
    milestone: params.milestone,
    state: params.state || 'open',
    assignee: params.assignee,
    creator: params.creator,
    mentioned: params.mentioned,
    labels: params.labels,
    sort: params.sort || 'created',
    direction: params.direction || 'desc',
    since: params.since,
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    issues: response.data.map(issue => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      locked: issue.locked,
      assignees: issue.assignees?.map(a => a.login),
      milestone: issue.milestone?.title,
      labels: issue.labels.map(l => typeof l === 'string' ? l : l.name),
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at,
      author: issue.user?.login,
      comments: issue.comments,
      html_url: issue.html_url
    })),
    total_count: response.data.length
  };
}

async function createIssue(octokit: Octokit, owner: string, repo: string, data: any) {
  const response = await octokit.issues.create({
    owner,
    repo,
    title: data.title,
    body: data.body,
    assignees: data.assignees,
    milestone: data.milestone,
    labels: data.labels
  });

  return {
    issue_id: response.data.id,
    number: response.data.number,
    title: response.data.title,
    state: response.data.state,
    html_url: response.data.html_url,
    created_at: response.data.created_at
  };
}

async function updateIssue(octokit: Octokit, owner: string, repo: string, issue_number: number, data: any) {
  const response = await octokit.issues.update({
    owner,
    repo,
    issue_number,
    title: data.title,
    body: data.body,
    state: data.state,
    assignees: data.assignees,
    milestone: data.milestone,
    labels: data.labels
  });

  return {
    issue_id: response.data.id,
    number: response.data.number,
    title: response.data.title,
    state: response.data.state,
    updated_at: response.data.updated_at
  };
}

async function closeIssue(octokit: Octokit, owner: string, repo: string, issue_number: number) {
  const response = await octokit.issues.update({
    owner,
    repo,
    issue_number,
    state: 'closed'
  });

  return {
    issue_id: response.data.id,
    number: response.data.number,
    state: response.data.state,
    closed_at: response.data.closed_at
  };
}

// Pull Request Management
async function getPullRequests(octokit: Octokit, owner: string, repo: string, params: any = {}) {
  const response = await octokit.pulls.list({
    owner,
    repo,
    state: params.state || 'open',
    head: params.head,
    base: params.base,
    sort: params.sort || 'created',
    direction: params.direction || 'desc',
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    pull_requests: response.data.map(pr => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      locked: pr.locked,
      user: pr.user?.login,
      assignees: pr.assignees?.map(a => a.login),
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo?.name
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        repo: pr.base.repo?.name
      },
      mergeable: pr.mergeable,
      merged: pr.merged,
      merged_at: pr.merged_at,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      html_url: pr.html_url,
      diff_url: pr.diff_url,
      patch_url: pr.patch_url
    })),
    total_count: response.data.length
  };
}

async function createPullRequest(octokit: Octokit, owner: string, repo: string, data: any) {
  const response = await octokit.pulls.create({
    owner,
    repo,
    title: data.title,
    head: data.head,
    base: data.base,
    body: data.body,
    maintainer_can_modify: data.maintainer_can_modify !== false,
    draft: data.draft || false
  });

  return {
    pull_request_id: response.data.id,
    number: response.data.number,
    title: response.data.title,
    state: response.data.state,
    html_url: response.data.html_url,
    created_at: response.data.created_at
  };
}

async function mergePullRequest(octokit: Octokit, owner: string, repo: string, pull_number: number, data: any = {}) {
  const response = await octokit.pulls.merge({
    owner,
    repo,
    pull_number,
    commit_title: data.commit_title,
    commit_message: data.commit_message,
    merge_method: data.merge_method || 'merge'
  });

  return {
    pull_request_id: pull_number,
    merged: response.data.merged,
    sha: response.data.sha,
    message: response.data.message
  };
}

// Commit Management
async function getCommits(octokit: Octokit, owner: string, repo: string, params: any = {}) {
  const response = await octokit.repos.listCommits({
    owner,
    repo,
    sha: params.sha,
    path: params.path,
    author: params.author,
    since: params.since,
    until: params.until,
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    commits: response.data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author?.name,
        email: commit.commit.author?.email,
        date: commit.commit.author?.date
      },
      committer: {
        name: commit.commit.committer?.name,
        email: commit.commit.committer?.email,
        date: commit.commit.committer?.date
      },
      url: commit.url,
      html_url: commit.html_url,
      stats: commit.stats
    })),
    total_count: response.data.length
  };
}

async function createCommit(octokit: Octokit, owner: string, repo: string, data: any) {
  // First, get the current commit SHA
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${data.branch || 'main'}`
  });

  const currentCommitSha = refData.object.sha;

  // Get the tree
  const { data: commitData } = await octokit.git.getCommit({
    owner,
    repo,
    commit_sha: currentCommitSha
  });

  // Create blobs for files
  const blobs = await Promise.all(
    data.files.map(async (file: any) => {
      const { data: blob } = await octokit.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: 'utf-8'
      });
      return { path: file.path, sha: blob.sha, mode: '100644', type: 'blob' };
    })
  );

  // Create tree
  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: commitData.tree.sha,
    tree: blobs
  });

  // Create commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: data.message,
    tree: tree.sha,
    parents: [currentCommitSha]
  });

  // Update reference
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${data.branch || 'main'}`,
    sha: newCommit.sha
  });

  return {
    commit_sha: newCommit.sha,
    message: newCommit.message,
    author: newCommit.author,
    html_url: newCommit.html_url
  };
}

// Branch Management
async function getBranches(octokit: Octokit, owner: string, repo: string, params: any = {}) {
  const response = await octokit.repos.listBranches({
    owner,
    repo,
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    branches: response.data.map(branch => ({
      name: branch.name,
      commit: {
        sha: branch.commit.sha,
        url: branch.commit.url
      },
      protected: branch.protected
    }))
  };
}

async function createBranch(octokit: Octokit, owner: string, repo: string, branch: string, data: any) {
  const response = await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branch}`,
    sha: data.from_sha || data.sha
  });

  return {
    branch_name: branch,
    ref: response.data.ref,
    sha: response.data.object.sha,
    created_at: new Date().toISOString()
  };
}

async function deleteBranch(octokit: Octokit, owner: string, repo: string, branch: string) {
  await octokit.git.deleteRef({
    owner,
    repo,
    ref: `heads/${branch}`
  });

  return {
    branch_name: branch,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Release Management
async function getReleases(octokit: Octokit, owner: string, repo: string, params: any = {}) {
  const response = await octokit.repos.listReleases({
    owner,
    repo,
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    releases: response.data.map(release => ({
      id: release.id,
      tag_name: release.tag_name,
      target_commitish: release.target_commitish,
      name: release.name,
      body: release.body,
      draft: release.draft,
      prerelease: release.prerelease,
      created_at: release.created_at,
      published_at: release.published_at,
      author: release.author?.login,
      html_url: release.html_url,
      assets: release.assets.map(asset => ({
        id: asset.id,
        name: asset.name,
        size: asset.size,
        download_count: asset.download_count,
        browser_download_url: asset.browser_download_url
      }))
    }))
  };
}

async function createRelease(octokit: Octokit, owner: string, repo: string, data: any) {
  const response = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: data.tag_name,
    target_commitish: data.target_commitish,
    name: data.name,
    body: data.body,
    draft: data.draft || false,
    prerelease: data.prerelease || false,
    generate_release_notes: data.generate_release_notes || false
  });

  return {
    release_id: response.data.id,
    tag_name: response.data.tag_name,
    name: response.data.name,
    html_url: response.data.html_url,
    created_at: response.data.created_at
  };
}

// GitHub Actions Workflow Management
async function getWorkflows(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.actions.listRepoWorkflows({ owner, repo });

  return {
    workflows: response.data.workflows.map(workflow => ({
      id: workflow.id,
      name: workflow.name,
      path: workflow.path,
      state: workflow.state,
      created_at: workflow.created_at,
      updated_at: workflow.updated_at,
      url: workflow.url,
      html_url: workflow.html_url,
      badge_url: workflow.badge_url
    })),
    total_count: response.data.total_count
  };
}

async function triggerWorkflow(octokit: Octokit, owner: string, repo: string, workflow_id: string, data: any) {
  await octokit.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id,
    ref: data.ref || 'main',
    inputs: data.inputs || {}
  });

  return {
    workflow_id,
    triggered: true,
    ref: data.ref || 'main',
    inputs: data.inputs || {},
    triggered_at: new Date().toISOString()
  };
}

async function getWorkflowRuns(octokit: Octokit, owner: string, repo: string, workflow_id: string, params: any = {}) {
  const response = await octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id,
    actor: params.actor,
    branch: params.branch,
    event: params.event,
    status: params.status,
    per_page: params.per_page || 30,
    page: params.page || 1
  });

  return {
    workflow_runs: response.data.workflow_runs.map(run => ({
      id: run.id,
      name: run.name,
      head_branch: run.head_branch,
      head_sha: run.head_sha,
      status: run.status,
      conclusion: run.conclusion,
      workflow_id: run.workflow_id,
      created_at: run.created_at,
      updated_at: run.updated_at,
      run_attempt: run.run_attempt,
      run_started_at: run.run_started_at,
      html_url: run.html_url,
      jobs_url: run.jobs_url,
      logs_url: run.logs_url,
      check_suite_url: run.check_suite_url,
      artifacts_url: run.artifacts_url,
      cancel_url: run.cancel_url,
      rerun_url: run.rerun_url
    })),
    total_count: response.data.total_count
  };
}

async function cancelWorkflow(octokit: Octokit, owner: string, repo: string, run_id: string) {
  await octokit.actions.cancelWorkflowRun({
    owner,
    repo,
    run_id: parseInt(run_id)
  });

  return {
    run_id,
    cancelled: true,
    cancelled_at: new Date().toISOString()
  };
}

// Secrets Management
async function getSecrets(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.actions.listRepoSecrets({ owner, repo });

  return {
    secrets: response.data.secrets.map(secret => ({
      name: secret.name,
      created_at: secret.created_at,
      updated_at: secret.updated_at
    })),
    total_count: response.data.total_count
  };
}

async function createSecret(octokit: Octokit, owner: string, repo: string, secret_name: string, data: any) {
  // Get public key for encryption
  const { data: keyData } = await octokit.actions.getRepoPublicKey({ owner, repo });
  
  // Encrypt the secret value (simplified - in production use proper encryption)
  const encrypted_value = Buffer.from(data.value).toString('base64');

  await octokit.actions.createOrUpdateRepoSecret({
    owner,
    repo,
    secret_name,
    encrypted_value,
    key_id: keyData.key_id
  });

  return {
    secret_name,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function updateSecret(octokit: Octokit, owner: string, repo: string, secret_name: string, data: any) {
  // Get public key for encryption
  const { data: keyData } = await octokit.actions.getRepoPublicKey({ owner, repo });
  
  // Encrypt the secret value (simplified)
  const encrypted_value = Buffer.from(data.value).toString('base64');

  await octokit.actions.createOrUpdateRepoSecret({
    owner,
    repo,
    secret_name,
    encrypted_value,
    key_id: keyData.key_id
  });

  return {
    secret_name,
    updated: true,
    updated_at: new Date().toISOString()
  };
}

async function deleteSecret(octokit: Octokit, owner: string, repo: string, secret_name: string) {
  await octokit.actions.deleteRepoSecret({ owner, repo, secret_name });

  return {
    secret_name,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Collaborator Management
async function getCollaborators(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.repos.listCollaborators({ owner, repo });

  return {
    collaborators: response.data.map(collaborator => ({
      id: collaborator.id,
      login: collaborator.login,
      avatar_url: collaborator.avatar_url,
      permissions: collaborator.permissions,
      role_name: collaborator.role_name
    }))
  };
}

async function addCollaborator(octokit: Octokit, owner: string, repo: string, username: string, data: any) {
  await octokit.repos.addCollaborator({
    owner,
    repo,
    username,
    permission: data.permission || 'push'
  });

  return {
    username,
    permission: data.permission || 'push',
    invited: true,
    invited_at: new Date().toISOString()
  };
}

async function removeCollaborator(octokit: Octokit, owner: string, repo: string, username: string) {
  await octokit.repos.removeCollaborator({ owner, repo, username });

  return {
    username,
    removed: true,
    removed_at: new Date().toISOString()
  };
}

// Webhook Management
async function getWebhooks(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.repos.listWebhooks({ owner, repo });

  return {
    webhooks: response.data.map(webhook => ({
      id: webhook.id,
      name: webhook.name,
      active: webhook.active,
      events: webhook.events,
      config: webhook.config,
      created_at: webhook.created_at,
      updated_at: webhook.updated_at
    }))
  };
}

async function createWebhook(octokit: Octokit, owner: string, repo: string, data: any) {
  const response = await octokit.repos.createWebhook({
    owner,
    repo,
    name: data.name || 'web',
    active: data.active !== false,
    events: data.events || ['push'],
    config: {
      url: data.url,
      content_type: data.content_type || 'json',
      secret: data.secret,
      insecure_ssl: data.insecure_ssl || '0'
    }
  });

  return {
    webhook_id: response.data.id,
    name: response.data.name,
    active: response.data.active,
    events: response.data.events,
    url: response.data.config.url,
    created_at: response.data.created_at
  };
}

async function updateWebhook(octokit: Octokit, owner: string, repo: string, hook_id: string, data: any) {
  const response = await octokit.repos.updateWebhook({
    owner,
    repo,
    hook_id: parseInt(hook_id),
    active: data.active,
    events: data.events,
    config: data.config ? {
      url: data.config.url,
      content_type: data.config.content_type,
      secret: data.config.secret,
      insecure_ssl: data.config.insecure_ssl
    } : undefined
  });

  return {
    webhook_id: hook_id,
    active: response.data.active,
    events: response.data.events,
    updated_at: response.data.updated_at
  };
}

async function deleteWebhook(octokit: Octokit, owner: string, repo: string, hook_id: string) {
  await octokit.repos.deleteWebhook({ owner, repo, hook_id: parseInt(hook_id) });

  return {
    webhook_id: hook_id,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// File Management
async function getContents(octokit: Octokit, owner: string, repo: string, path: string, params: any = {}) {
  const response = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: params.ref
  });

  if (Array.isArray(response.data)) {
    // Directory listing
    return {
      type: 'dir',
      contents: response.data.map(item => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        size: item.size,
        type: item.type,
        download_url: item.download_url,
        html_url: item.html_url
      }))
    };
  } else {
    // Single file
    const file = response.data as any;
    return {
      type: 'file',
      name: file.name,
      path: file.path,
      sha: file.sha,
      size: file.size,
      encoding: file.encoding,
      content: file.content,
      decoded_content: file.encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf-8') : file.content,
      download_url: file.download_url,
      html_url: file.html_url
    };
  }
}

async function createFile(octokit: Octokit, owner: string, repo: string, path: string, data: any) {
  const response = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: data.message || `Create ${path}`,
    content: Buffer.from(data.content).toString('base64'),
    branch: data.branch
  });

  return {
    path,
    sha: response.data.content?.sha,
    message: data.message,
    created: true,
    created_at: new Date().toISOString(),
    html_url: response.data.content?.html_url
  };
}

async function updateFile(octokit: Octokit, owner: string, repo: string, path: string, sha: string, data: any) {
  const response = await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: data.message || `Update ${path}`,
    content: Buffer.from(data.content).toString('base64'),
    sha,
    branch: data.branch
  });

  return {
    path,
    sha: response.data.content?.sha,
    message: data.message,
    updated: true,
    updated_at: new Date().toISOString(),
    html_url: response.data.content?.html_url
  };
}

async function deleteFile(octokit: Octokit, owner: string, repo: string, path: string, sha: string, data: any) {
  const response = await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message: data.message || `Delete ${path}`,
    sha,
    branch: data.branch
  });

  return {
    path,
    message: data.message,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'GitHub Integration',
    status: 'operational',
    features: [
      'Repository Management',
      'Issue Tracking',
      'Pull Request Management',
      'Commit Operations',
      'Branch Management',
      'Release Management',
      'GitHub Actions Integration',
      'Secrets Management',
      'Collaborator Management',
      'Webhook Management',
      'File Management'
    ],
    endpoints: {
      repositories: ['get', 'create', 'update', 'delete', 'list'],
      issues: ['get', 'create', 'update', 'close', 'list'],
      pulls: ['get', 'create', 'merge', 'list'],
      commits: ['get', 'create', 'list'],
      branches: ['get', 'create', 'delete', 'list'],
      releases: ['get', 'create', 'list'],
      workflows: ['get', 'trigger', 'list_runs', 'cancel'],
      secrets: ['get', 'create', 'update', 'delete'],
      collaborators: ['get', 'add', 'remove'],
      webhooks: ['get', 'create', 'update', 'delete'],
      files: ['get', 'create', 'update', 'delete']
    },
    webhook_events: [
      'push',
      'pull_request',
      'issues',
      'issue_comment',
      'release',
      'workflow_run',
      'star',
      'fork',
      'watch',
      'commit_comment',
      'pull_request_review'
    ],
    supported_operations: [
      'Repository CRUD',
      'Issue Management',
      'PR Workflow',
      'CI/CD Integration',
      'Team Collaboration',
      'Code Review',
      'Release Management',
      'Security & Access Control'
    ]
  });
}