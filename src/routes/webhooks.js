const { Router } = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { getEmbedding } = require('../embeddings');

const router = Router();

function verifyGitHubSignature(req) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return true; // skip verification if no secret set
  const sig = req.headers['x-hub-signature-256'];
  if (!sig) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(req.body));
  const expected = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

router.post('/webhooks/github', async (req, res) => {
  if (!verifyGitHubSignature(req)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  try {
    if (event === 'push' && payload.commits) {
      for (const commit of payload.commits) {
        const content = [
          `[Commit] ${commit.message}`,
          `Author: ${commit.author?.name || 'unknown'}`,
          `Date: ${commit.timestamp || ''}`,
          `SHA: ${commit.id}`,
          `Repo: ${payload.repository?.name || ''}`,
          `Files: ${(commit.added || []).concat(commit.modified || []).join(', ').slice(0, 500)}`,
        ].join('\n');

        const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [commit.id]);
        if (existing.rows.length === 0) {
          const embedding = await getEmbedding(content);
          await pool.query(
            `INSERT INTO memories (content, embedding, source, memory_type, source_ref, source_url, project, author, access_level)
             VALUES ($1, $2, 'github', 'github_commit', $3, $4, $5, $6, 'internal')`,
            [content, embedding, commit.id, commit.url, payload.repository?.name || '', commit.author?.name || 'unknown']
          );
        }
      }
    }

    if (event === 'issues' && payload.issue) {
      const issue = payload.issue;
      const ref = `issue-${payload.repository?.name}-${issue.number}`;
      const content = [
        `[Issue] ${issue.title}`,
        `Action: ${payload.action}`,
        `Status: ${issue.state}`,
        `Labels: ${(issue.labels || []).map(l => l.name).join(', ') || 'none'}`,
        issue.body ? `\n${issue.body.slice(0, 1000)}` : '',
      ].join('\n');

      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [ref]);
      if (existing.rows.length === 0) {
        const embedding = await getEmbedding(content);
        await pool.query(
          `INSERT INTO memories (content, embedding, source, memory_type, source_ref, source_url, project, author, access_level)
           VALUES ($1, $2, 'github', 'github_issue', $3, $4, $5, $6, 'internal')`,
          [content, embedding, ref, issue.html_url, payload.repository?.name || '', issue.user?.login || 'unknown']
        );
      } else {
        // Update existing
        const embedding = await getEmbedding(content);
        await pool.query(
          'UPDATE memories SET content = $1, embedding = $2 WHERE source_ref = $3',
          [content, embedding, ref]
        );
      }
    }

    if (event === 'pull_request' && payload.pull_request) {
      const pr = payload.pull_request;
      const ref = `pr-${payload.repository?.name}-${pr.number}`;
      const content = [
        `[PR] ${pr.title}`,
        `Action: ${payload.action}`,
        `Status: ${pr.state}${pr.merged_at ? ' (merged)' : ''}`,
        `Author: ${pr.user?.login || 'unknown'}`,
        pr.body ? `\n${pr.body.slice(0, 1000)}` : '',
      ].join('\n');

      const existing = await pool.query('SELECT id FROM memories WHERE source_ref = $1', [ref]);
      if (existing.rows.length === 0) {
        const embedding = await getEmbedding(content);
        await pool.query(
          `INSERT INTO memories (content, embedding, source, memory_type, source_ref, source_url, project, author, access_level)
           VALUES ($1, $2, 'github', 'github_pr', $3, $4, $5, $6, 'internal')`,
          [content, embedding, ref, pr.html_url, payload.repository?.name || '', pr.user?.login || 'unknown']
        );
      } else {
        const embedding = await getEmbedding(content);
        await pool.query(
          'UPDATE memories SET content = $1, embedding = $2 WHERE source_ref = $3',
          [content, embedding, ref]
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('GitHub webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;
