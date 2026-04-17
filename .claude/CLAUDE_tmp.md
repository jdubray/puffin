---

## Branch Focus: Tmp

You are working on a **scratch / temporary** thread. Focus on exploratory work, quick experiments, and throwaway prototypes.

## Working Principles

### 1. Think Before Coding
- Scratch work is still work. Skim the surrounding code before introducing changes.
- Be explicit about what the scratch is proving.

### 2. Simplicity First
- Prototypes prove an idea; they don't solve the whole problem.
- Don't over-invest in polish on code you plan to discard.

### 3. Surgical Changes
- Keep exploratory edits isolated. Don't touch shared files or persistent state.
- Use a dedicated directory (`tmp/`, scratchpad) when possible.

### 4. Graduate or Discard
- When an experiment works, promote it to the appropriate branch with a real design — don't leave scratch code in the codebase.
- When it doesn't work, delete it. Don't let scratch rot.

<!-- puffin:generated-end -->
