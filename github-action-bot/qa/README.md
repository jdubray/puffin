# Puffin Q&A Bot

A GitHub Actions bot that automatically answers questions about Puffin in GitHub Discussions using Claude AI.

## How It Works

1. User creates a new Discussion in the "Q&A" category
2. GitHub Action triggers automatically
3. Bot sends the question to Claude API with Puffin context
4. Claude generates an answer
5. Bot posts the answer as a reply to the Discussion

## Setup Instructions

### 1. Enable GitHub Discussions

1. Go to your repository on GitHub
2. Click **Settings** → **General**
3. Scroll to **Features** section
4. Check **Discussions**

### 2. Create Q&A Category

1. Go to your repository's **Discussions** tab
2. Click the pencil icon next to "Categories"
3. Click **New category**
4. Name: `Q&A`
5. Description: `Ask questions about Puffin`
6. Discussion Format: `Question / Answer`
7. Click **Create**

**Important**: The category slug must be `q-a` (GitHub auto-generates this from "Q&A")

### 3. Add Anthropic API Key

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `ANTHROPIC_API_KEY`
4. Value: Your Claude API key from [console.anthropic.com](https://console.anthropic.com)
5. Click **Add secret**

### 4. Generate package-lock.json

Before the first run, generate the lock file:

```bash
cd github-action-bot/qa
npm install
```

Commit the `package-lock.json` file to the repository.

### 5. Deploy

Push the changes to your repository:

```bash
git add .
git commit -m "feat: add Q&A bot for GitHub Discussions"
git push
```

## Testing

1. Go to your repository's **Discussions** tab
2. Click **New discussion**
3. Select the **Q&A** category
4. Ask a question about Puffin, e.g., "What is Puffin and how does it work with Claude Code?"
5. Submit the discussion
6. Wait ~30 seconds for the bot to respond

## Customization

### Modify Context

Edit `puffin-context.md` to update the information the bot uses to answer questions.

### Change AI Model

Edit `answer-question.js` and change the model:
- `claude-sonnet-4-20250514` (default, balanced)
- `claude-haiku-4-20250514` (faster, cheaper)
- `claude-opus-4-20250514` (most capable)

### Adjust Response Length

Edit `max_tokens` in `answer-question.js` (default: 2048)

## Cost Considerations

- Each question uses ~500-2000 tokens input (context + question)
- Each answer uses ~200-800 tokens output
- Using Claude Haiku costs ~$0.001-0.003 per question
- Using Claude Sonnet costs ~$0.01-0.03 per question

## Troubleshooting

### Bot doesn't respond

1. Check **Actions** tab for workflow runs
2. Verify the discussion is in the "Q&A" category
3. Check that `ANTHROPIC_API_KEY` secret is set
4. Review action logs for errors

### Authentication errors

- Ensure `ANTHROPIC_API_KEY` is valid and has credits
- The `GITHUB_TOKEN` is automatically provided by Actions

### Wrong category

The workflow only triggers for discussions with category slug `q-a`. Verify your category slug in the Discussions settings.

## Files

```
github-action-bot/qa/
├── answer-question.js   # Main bot script
├── puffin-context.md    # Context for Claude
├── package.json         # Dependencies
└── README.md            # This file

.github/workflows/
└── qa-bot.yml           # GitHub Action workflow
```

## Security

- API keys are stored as GitHub Secrets (encrypted)
- Keys are never exposed in logs or code
- Bot only responds to discussions (not issues or PRs)
- Rate limited by GitHub Actions (1000 minutes/month free tier)
