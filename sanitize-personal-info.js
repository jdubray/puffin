#!/usr/bin/env node
/**
 * Sanitize personal information from .puffin files
 * Replaces IP addresses, usernames, and SSH key names with generic values
 */

const fs = require('fs');
const path = require('path');

const files = [
  '.puffin/history.json',
  '.puffin/story-generations.json'
];

const replacements = [
  { pattern: /jjdubray@108\.7\.186\.27/g, replacement: 'myaccount@192.168.1.100' },
  { pattern: /108\.7\.186\.27/g, replacement: '192.168.1.100' },
  { pattern: /jjdubray@corsair/g, replacement: 'myaccount@server' },
  { pattern: /jjdubray/g, replacement: 'myaccount' },
  { pattern: /id_ed25519/g, replacement: 'id_rsa' }
];

files.forEach(filePath => {
  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`Skipping ${filePath} - file not found`);
    return;
  }

  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(fullPath, 'utf8');

  let changeCount = 0;
  replacements.forEach(({ pattern, replacement }) => {
    const matches = content.match(pattern);
    if (matches) {
      changeCount += matches.length;
      content = content.replace(pattern, replacement);
    }
  });

  if (changeCount > 0) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`  ✓ Replaced ${changeCount} occurrence(s)`);
  } else {
    console.log(`  ✓ No changes needed`);
  }
});

console.log('\nSanitization complete!');
