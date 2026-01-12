#!/usr/bin/env node
/**
 * Puffin Sync Script
 *
 * Receives a session summary from Claude Code CLI and writes it to
 * Puffin's history.json under the specified branch (defaults to "improvements").
 *
 * Usage: echo '{"title":"...", "content":"...", "files":[]}' | node puffin-sync.js [branch-name]
 *
 * Examples:
 *   echo '{"title":"Fix bug", "content":"..."}' | node puffin-sync.js
 *   echo '{"title":"New feature", "content":"..."}' | node puffin-sync.js ui
 *   echo '{"title":"API changes", "content":"..."}' | node puffin-sync.js backend
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Find .puffin directory (walk up from cwd)
function findPuffinDir(startDir = process.cwd()) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const puffinPath = path.join(dir, '.puffin');
    if (fs.existsSync(puffinPath)) {
      return puffinPath;
    }
    dir = path.dirname(dir);
  }
  return null;
}

// Generate unique ID
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// Read stdin
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);

    // Timeout after 5 seconds if no input
    setTimeout(() => {
      if (!data) {
        reject(new Error('No input received'));
      }
    }, 5000);
  });
}

async function main() {
  try {
    // Parse command line argument for branch name
    const argBranch = process.argv[2];
    const branchId = argBranch ? argBranch.toLowerCase().replace(/\s+/g, '-') : 'improvements';
    const branchName = argBranch || 'Improvements';

    // Find .puffin directory
    const puffinDir = findPuffinDir();
    if (!puffinDir) {
      console.error('Error: Could not find .puffin directory');
      process.exit(1);
    }

    const historyPath = path.join(puffinDir, 'history.json');
    const inboxPath = path.join(puffinDir, 'sync-inbox.json');

    // Read existing history to validate branch
    let history;
    try {
      const content = fs.readFileSync(historyPath, 'utf8');
      history = JSON.parse(content);
    } catch {
      console.error('Error: Could not read history.json');
      process.exit(1);
    }

    // Read input from stdin
    const input = await readStdin();
    let summary;
    try {
      summary = JSON.parse(input.trim());
    } catch {
      console.error('Error: Invalid JSON input');
      console.error('Expected: {"title":"...", "content":"...", "files":[]}');
      process.exit(1);
    }

    // Validate input
    if (!summary.title || !summary.content) {
      console.error('Error: Missing required fields (title, content)');
      process.exit(1);
    }

    // Get list of valid branch names
    const validBranches = Object.keys(history.branches);

    // Validate target branch exists (except for default "improvements" which can be created)
    if (!history.branches[branchId] && branchId !== 'improvements') {
      // Invalid branch specified - show error with valid options
      console.error(`Error: Branch "${argBranch}" not found.`);
      console.error('');
      console.error('Valid branches:');
      validBranches.forEach(b => {
        const branch = history.branches[b];
        console.error(`  - ${b}${branch.name !== b ? ` (${branch.name})` : ''}`);
      });
      process.exit(1);
    }

    // Create the prompt entry
    const promptId = generateId();
    const timestamp = new Date().toISOString();

    // Build content with metadata
    let promptContent = `## ${summary.title}\n\n${summary.content}`;
    if (summary.files && summary.files.length > 0) {
      promptContent += `\n\n### Files Modified\n${summary.files.map(f => `- ${f}`).join('\n')}`;
    }

    const prompt = {
      id: promptId,
      content: promptContent,
      timestamp: timestamp,
      response: {
        content: `Summary synced from Claude Code CLI on ${new Date().toLocaleString()}`,
        timestamp: timestamp
      },
      metadata: {
        source: 'claude-code-cli',
        syncedAt: timestamp,
        files: summary.files || []
      }
    };

    // Read existing inbox or create new
    let inbox = [];
    try {
      const inboxContent = fs.readFileSync(inboxPath, 'utf8');
      inbox = JSON.parse(inboxContent);
      if (!Array.isArray(inbox)) inbox = [];
    } catch {
      // Inbox doesn't exist yet, that's fine
    }

    // Add to inbox (will be processed by Puffin on next load/refresh)
    inbox.push({
      branchId,
      branchName,
      prompt,
      addedAt: timestamp
    });

    // Save inbox
    fs.writeFileSync(inboxPath, JSON.stringify(inbox, null, 2));

    console.log(`Successfully queued for Puffin: "${summary.title}"`);
    console.log(`Branch: ${branchName}`);
    console.log(`Prompt ID: ${promptId}`);
    console.log('Note: Restart Puffin or refresh to see the synced entry.');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
