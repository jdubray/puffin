/**
 * Branch Defaults
 *
 * Default context templates for each branch type.
 * These are used when creating new CLAUDE_{branch}.md files
 * or as fallbacks when a branch context file is empty.
 */

/**
 * Default branch focus instructions
 * These define the role and constraints for each branch type
 */
const BRANCH_FOCUS_DEFAULTS = {
  specifications: `## Branch Focus: Specifications

You are working on the **specifications thread**. Focus on:
- Requirements gathering and clarification
- Feature definitions and scope
- User stories and acceptance criteria
- Business logic and rules
- Edge cases and constraints

**IMPORTANT: NO CODE CHANGES ALLOWED**

This is a planning-only thread. You must NOT:
- Create, modify, or delete any source code files
- Make changes to implementation files (.js, .ts, .py, .css, .html, etc.)
- Execute code or run build/test commands

You MAY only:
- Generate user stories and acceptance criteria
- Create implementation plans and technical specifications
- Produce documentation in markdown format
- Answer questions and clarify requirements
- Analyze existing code to inform planning (read-only)

If asked to implement something, explain that implementation should happen
in the appropriate branch (UI, Backend, or a feature branch) after planning is complete.

When deriving user stories, format them as:
- Title: Brief descriptive name
- Description: "As a [role], I want [feature] so that [benefit]"
- Acceptance Criteria: Testable conditions for completion`,

  architecture: `## Branch Focus: Architecture

You are working on the **architecture thread**. Focus on:
- System design and high-level structure
- Modularity patterns (IoC, DI, SAM, etc.)
- Component relationships and data flow
- API design and contracts
- Technology stack decisions
- Scalability and performance considerations
- Security architecture

Consider maintainability, testability, and separation of concerns.
Document architectural decisions and their rationale.`,

  ui: `## Branch Focus: UI/UX

You are working on the **UI/UX thread**. Focus on:
- User interface design and implementation
- User experience and interaction patterns
- Component layout and styling
- Accessibility (WCAG compliance)
- Responsive design
- Frontend implementation

Consider usability, visual consistency, and modern frontend best practices.
Ensure all interactive elements are keyboard accessible.`,

  backend: `## Branch Focus: Backend

You are working on the **backend thread**. Focus on:
- Server-side logic and APIs
- Database operations and data models
- Business logic implementation
- Authentication and authorization
- Backend services and integrations
- Error handling and logging

Consider performance, security, data integrity, and API design best practices.`,

  deployment: `## Branch Focus: Deployment

You are working on the **deployment thread**. Focus on:
- CI/CD pipeline configuration
- Infrastructure as code
- Containerization (Docker, etc.)
- Hosting and cloud services
- Monitoring and alerting
- DevOps practices and automation

Consider reliability, scalability, security, and operational concerns.`,

  tmp: `## Branch Focus: Temporary/Scratch

This is a **scratch space** for ad-hoc tasks and experiments.

**IMPORTANT**: Always output your final results as text in your response, not just as file writes.
When asked to create documents, lists, or summaries, include the full content in your response text.

This branch is for:
- Quick experiments and prototypes
- One-off tasks that don't fit other branches
- Exploratory work and research`,

  improvements: `## Branch Focus: Improvements

This branch tracks **fixes and improvements** made via Claude Code CLI.

Entries are synced automatically using the /puffin-sync command.
Use this as a log of incremental changes and quick fixes.

When logging improvements:
- Summarize what was fixed or improved
- Note the files that were modified
- Include any relevant context`,

  'bug-fixes': `## Branch Focus: Bug Fixes

You are working on the **bug fixes thread**. Focus on:
- Identifying and diagnosing bugs
- Root cause analysis
- Implementing fixes with minimal side effects
- Adding regression tests
- Documenting the fix and its rationale

Be thorough in testing and consider edge cases.`,

  'code-reviews': `## Branch Focus: Code Reviews

You are working on the **code reviews thread**. Focus on:
- Reviewing code for correctness and quality
- Identifying potential issues and improvements
- Suggesting best practices
- Checking for security vulnerabilities
- Evaluating test coverage

Provide constructive feedback with specific suggestions.`,

  'plugin-development': `## Branch Focus: Plugin Development

You are working on the **plugin development thread**. Focus on:
- Plugin architecture and design
- Plugin API integration
- IPC handlers and actions
- Renderer components for plugins
- Plugin testing and documentation

Follow the established plugin patterns in the codebase.`,

  fullstack: `## Branch Focus: Full Stack

You are working on the **full stack thread**. Focus on:
- End-to-end feature implementation
- Frontend and backend integration
- Full feature lifecycle
- Cross-cutting concerns

This branch allows work across the entire stack when features require coordinated changes.`
}

/**
 * Get the default focus content for a branch
 * @param {string} branchId - The branch identifier
 * @returns {string|null} Default focus content or null if no default exists
 */
function getDefaultBranchFocus(branchId) {
  return BRANCH_FOCUS_DEFAULTS[branchId] || null
}

/**
 * Get fallback context for custom branches without predefined defaults
 * @param {string} branchId - The branch identifier
 * @param {boolean} codeModificationAllowed - Whether code modifications are allowed
 * @returns {string} Fallback context string
 */
function getCustomBranchFallback(branchId, codeModificationAllowed = true) {
  if (codeModificationAllowed) {
    return `## Branch Focus: ${formatBranchName(branchId)}

You are working on the **${branchId}** thread.

Add specific focus areas and constraints for this branch.`
  }

  return `## Branch Focus: ${formatBranchName(branchId)}

You are working on the **${branchId}** thread.

**IMPORTANT: DOCUMENTATION ONLY, NO CODE CHANGES**

You MAY create and modify documentation files (markdown, text, config files, etc.).
You must NOT write, modify, or delete source code files (.js, .ts, .py, .java, etc.).

If implementation is requested, advise the user to move to an appropriate implementation branch.`
}

/**
 * Format branch name for display
 * @param {string} branchId - The branch identifier
 * @returns {string} Formatted display name
 */
function formatBranchName(branchId) {
  if (!branchId) return 'Default'
  return branchId
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * List all available default branch types
 * @returns {string[]} Array of branch identifiers
 */
function listDefaultBranches() {
  return Object.keys(BRANCH_FOCUS_DEFAULTS)
}

module.exports = {
  BRANCH_FOCUS_DEFAULTS,
  getDefaultBranchFocus,
  getCustomBranchFallback,
  formatBranchName,
  listDefaultBranches
}
