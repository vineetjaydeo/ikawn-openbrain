const { pool } = require('../db');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_ORG = process.env.GITHUB_ORG || 'ikawn-technologies';
const GITHUB_REPOS = (process.env.GITHUB_REPOS || 'ikawn-v3,ikawn-openbrain').split(',').map(r => r.trim());

async function githubFetch(path) {
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ikawn-openbrain',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText} for ${path}`);
  }
  return res.json();
}

async function upsertMemory({ content, memory_type, source_ref, source_url, project, author, access_level }) {
  // Check if already exists by source_ref
  const existing = await pool.query(
    'SELECT id FROM memories WHERE source_ref = $1 AND memory_type = $2',
    [source_ref, memory_type]
  );
  if (existing.rows.length > 0) return null;

  const result = await pool.query(
    `INSERT INTO memories (content, source, memory_type, source_ref, source_url, project, author, access_level, brand_id, embedding_status)
     VALUES ($1, 'github', $2, $3, $4, $5, $6, $7, 'ikawn', 'pending') RETURNING id`,
    [content, memory_type, source_ref, source_url, project, author || 'github', access_level || 'internal']
  );
  return result.rows[0].id;
}

async function syncCommits(repo, since) {
  let added = 0;
  const sinceParam = since ? `&since=${since}` : `&since=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`;

  try {
    const commits = await githubFetch(`/repos/${GITHUB_ORG}/${repo}/commits?per_page=100${sinceParam}`);

    for (const commit of commits) {
      const content = [
        `[Commit] ${commit.commit.message}`,
        `Author: ${commit.commit.author?.name || 'unknown'}`,
        `Date: ${commit.commit.author?.date || ''}`,
        `SHA: ${commit.sha}`,
        `Repo: ${repo}`,
      ].join('\n');

      const id = await upsertMemory({
        content,
        memory_type: 'github_commit',
        source_ref: commit.sha,
        source_url: commit.html_url,
        project: repo,
        author: commit.commit.author?.name || 'unknown',
        access_level: 'internal',
      });
      if (id) added++;
    }
  } catch (err) {
    console.error(`Error syncing commits for ${repo}:`, err.message);
  }
  return added;
}

async function syncIssues(repo) {
  let added = 0;
  try {
    const issues = await githubFetch(`/repos/${GITHUB_ORG}/${repo}/issues?state=all&per_page=100&sort=updated&direction=desc`);

    for (const issue of issues) {
      if (issue.pull_request) continue; // skip PRs in issues endpoint

      const content = [
        `[Issue] ${issue.title}`,
        `Status: ${issue.state}`,
        `Labels: ${(issue.labels || []).map(l => l.name).join(', ') || 'none'}`,
        `Assignee: ${issue.assignee?.login || 'unassigned'}`,
        issue.body ? `\n${issue.body.slice(0, 1000)}` : '',
      ].join('\n');

      const id = await upsertMemory({
        content,
        memory_type: 'github_issue',
        source_ref: `issue-${repo}-${issue.number}`,
        source_url: issue.html_url,
        project: repo,
        author: issue.user?.login || 'unknown',
        access_level: 'internal',
      });
      if (id) added++;
    }
  } catch (err) {
    console.error(`Error syncing issues for ${repo}:`, err.message);
  }
  return added;
}

async function syncPRs(repo) {
  let added = 0;
  try {
    const prs = await githubFetch(`/repos/${GITHUB_ORG}/${repo}/pulls?state=all&per_page=100&sort=updated&direction=desc`);

    for (const pr of prs) {
      const content = [
        `[PR] ${pr.title}`,
        `Status: ${pr.state}${pr.merged_at ? ' (merged)' : ''}`,
        `Author: ${pr.user?.login || 'unknown'}`,
        `Base: ${pr.base?.ref || ''} <- ${pr.head?.ref || ''}`,
        pr.body ? `\n${pr.body.slice(0, 1000)}` : '',
      ].join('\n');

      const id = await upsertMemory({
        content,
        memory_type: 'github_pr',
        source_ref: `pr-${repo}-${pr.number}`,
        source_url: pr.html_url,
        project: repo,
        author: pr.user?.login || 'unknown',
        access_level: 'internal',
      });
      if (id) added++;
    }
  } catch (err) {
    console.error(`Error syncing PRs for ${repo}:`, err.message);
  }
  return added;
}

async function syncAll() {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set, skipping GitHub sync');
    return { total: 0, repos: {} };
  }

  console.log('Starting GitHub sync...');
  const results = {};
  let total = 0;

  for (const repo of GITHUB_REPOS) {
    const commits = await syncCommits(repo);
    const issues = await syncIssues(repo);
    const prs = await syncPRs(repo);
    const repoTotal = commits + issues + prs;
    results[repo] = { commits, issues, prs, total: repoTotal };
    total += repoTotal;
    console.log(`GitHub sync [${repo}]: ${commits} commits, ${issues} issues, ${prs} PRs`);
  }

  // Log to ingestion log
  await pool.query(
    `INSERT INTO ob_ingestion_log (source, status, records_added) VALUES ('github', 'success', $1)`,
    [total]
  );

  console.log(`GitHub sync complete: ${total} new records`);
  return { total, repos: results };
}

module.exports = { syncAll, syncCommits, syncIssues, syncPRs };
