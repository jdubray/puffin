/**
 * Title Generator Service
 *
 * Generates concise titles for prompts using Claude API
 */

/**
 * Generate a title for a prompt using Claude
 * @param {string} content - The prompt content
 * @returns {Promise<string>} - Generated title
 */
export async function generateTitle(content) {
  try {
    // For title generation, use a simple approach that extracts the key intent
    return await generateTitleWithClaude(content)
  } catch (error) {
    console.warn('Title generation failed, falling back to truncation:', error)
    return generateFallbackTitle(content)
  }
}

/**
 * Generate title using Claude API
 * @param {string} content - The prompt content
 * @returns {Promise<string>} - Generated title
 */
async function generateTitleWithClaude(content) {
  // Make a simple request to Claude to generate a title
  const titlePrompt = `Generate a concise 2-5 word title for this user request. Respond with ONLY the title, no quotes or additional text:

${content}`

  // Use the electron IPC to call Claude
  if (window.puffin?.claude?.generateTitle) {
    const response = await window.puffin.claude.generateTitle(titlePrompt)
    if (response && response.trim()) {
      return response.trim().substring(0, 50) // Limit to 50 characters
    }
  }

  // Fallback if service unavailable
  throw new Error('Title generation service unavailable')
}

/**
 * Generate a fallback title from content
 * @param {string} content - The prompt content
 * @returns {string} - Fallback title
 */
function generateFallbackTitle(content) {
  // Clean the content
  const cleaned = content.trim()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .substring(0, 100)

  // Try to extract a meaningful title from the first sentence
  const firstSentence = cleaned.split(/[.!?]/)[0]

  // Look for action words and extract intent
  const actionWords = [
    'implement', 'create', 'build', 'add', 'fix', 'update', 'refactor',
    'design', 'optimize', 'test', 'deploy', 'configure', 'setup',
    'develop', 'write', 'generate', 'analyze', 'review', 'debug'
  ]

  for (const action of actionWords) {
    const regex = new RegExp(`\\b${action}\\b`, 'i')
    if (regex.test(firstSentence)) {
      // Extract the object of the action
      const words = firstSentence.toLowerCase().split(' ')
      const actionIndex = words.findIndex(word => word.includes(action.toLowerCase()))

      if (actionIndex !== -1 && actionIndex < words.length - 1) {
        const titleWords = words.slice(actionIndex, Math.min(actionIndex + 4, words.length))
        return titleWords.join(' ').replace(/[^\w\s]/g, '').trim()
      }
    }
  }

  // If no action word found, take first few meaningful words
  const words = firstSentence.split(' ').filter(word =>
    word.length > 2 && !['the', 'and', 'for', 'with', 'that', 'this'].includes(word.toLowerCase())
  )

  return words.slice(0, 4).join(' ').substring(0, 30) || 'New Request'
}