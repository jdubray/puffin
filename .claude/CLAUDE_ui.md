---

## Branch Focus: UI/UX

You are working on the **UI/UX thread**. Focus on:
- User interface implementation
- Component design and structure
- Styling and visual consistency
- User interactions and feedback
- Accessibility and responsiveness

### Color Tokens

Use these CSS custom properties for colors:

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#6c63ff` | Main brand color |
| `--color-secondary` | `#16213e` | Secondary accent color |
| `--color-success` | `#48bb78` | Success state color |
| `--color-warning` | `#ecc94b` | Warning state color |
| `--color-error` | `#f56565` | Error state color |
| `--color-neutral` | `#e6e6e6` | Neutral text color |

### Spacing Scale

- **XS:** `0.25rem` - Extra small spacing
- **SM:** `0.5rem` - Small spacing
- **MD:** `0.75rem` - Medium spacing
- **LG:** `1rem` - Large spacing
- **XL:** `1.5rem` - Extra large spacing
- **2XL:** `2rem` - Double extra large spacing

### Border Radii

- **None:** `0`
- **Small:** `4px`
- **Medium:** `8px`
- **Large:** `12px`
- **Full:** `50%`

### Component Patterns

#### Primary Button

Main call-to-action button with primary styling

**Guidelines:** Use for primary actions like "Save", "Submit", "Create". Limit to one per page section.

**HTML Template:**
```html
<button class="btn btn-primary">Button Text</button>
```

**CSS:**
```css
.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-small);
  padding: var(--spacing-md) var(--spacing-lg);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--color-primary-dark);
  transform: translateY(-1px);
}
```

### Layout Guidelines

# Layout Guidelines

## Grid System
- Use consistent spacing and grid structure
- Maintain proper visual hierarchy
- Consider responsive design principles

## Alignment
- Align elements consistently
- Use proper margins and padding
- Follow established layout patterns

### Component Guidelines

# Component Guidelines

## Consistency
- Reusable component patterns
- Consistent interaction patterns
- Standard component variants

## States
- Default, hover, focus, disabled states
- Loading and error states
- Active and selected states

### Interaction Guidelines

# Interaction Guidelines

## User Feedback
- Provide clear feedback for user actions
- Use appropriate animations and transitions
- Indicate loading and processing states

## Accessibility
- Keyboard navigation support
- Screen reader compatibility
- Touch-friendly targets for mobile

## Branch Memory (auto-extracted)

### Conventions
- Plugin architecture uses naming convention '*-plugin' for plugin directories. Plugins export module with 'name', 'initialize(context)', and 'cleanup()' methods. Main process plugins access ipcMain, app, mainWindow, config, pluginDir. Renderer plugins access ipcRenderer, document, window, config, pluginDir via preload.
- IPC communication uses channel naming pattern 'featureName:methodName'. All IPC handlers in main process must validate input. Preload script exposes APIs via window.puffin namespace with nested structure like window.puffin.github, window.puffin.git, window.puffin.file.
- SAM (State-Action-Model) pattern: actions defined in actions.js, acceptors in model.js, state computed in state.js, rendering in components. Actions must be registered in app.js both in actionNames array and component.actions array to be available as intents.
- Modal system uses centralized ModalManager.show() for displaying modals. Modal types handled in modal-manager.js with dedicated render methods. Two-step modals implemented as state transitions within single modal showing different content based on step property.
- CSS naming uses kebab-case for class names. Component-specific styles prefixed with component name (e.g., .git-panel-*, .handoff-*, .branch-select-*). Views managed via 'view' classes and display controlled via active/inactive states.
- User stories workflow: stories persisted in .puffin/user-stories.json. Story updates should update individual stories rather than rewriting entire file to prevent data loss. State-persistence loops through stories and calls updateUserStory IPC handler for each.
- Handoff context display: use banner component above prompt input with dismissible design, showing source branch/thread info and summary. Banner persists until dismissed or new thread created, signaling context will be injected into next prompt.
- File operations modal UX: use native save/open dialogs via IPC handlers (dialog:showSaveDialog, dialog:showOpenDialog), return file paths or canceled status. Markdown file save defaults to 'response.md' with filters for .md, .txt, all files.
- Toast notifications for async operations: use window.puffin.state.showToast() with message, type (success/error/info/warning), optional duration. Toast dismissed on navigation/view switch unless persistent flag set.
- Modal component event flow: modal triggers action via button.click handler, action updates SAM model state, SAM render callback updates modal content, user confirms action which may trigger navigation or additional modal step.
- Copy/paste markdown functionality: 'Copy MD' button uses navigator.clipboard.writeText() for client-side copy (works immediately), 'Save MD' button uses file:saveMarkdown IPC handler to show native save dialog and write to filesystem.
- Tool emoji mapping: use single emoji per tool type (Read=📖, Edit=✏️, Write=📝, Grep/Glob=🔍, Bash=💻, WebFetch=🌐, WebSearch=🔎, Task=🤖, NotebookEdit=📓, TodoWrite=📋, default=⚙️). Display emoji-only in stream (no 'Tool:' text), with tooltip on hover and active animation state.
- Component event delegation: add event listeners in bindEvents() method during init, remove in destroy() method. Use data attributes (data-action, data-id) for declarative event routing instead of direct element references to enable dynamic content.
- SAM actions must be registered in app.js in TWO places: (1) actionNames array for action name collection, (2) component.actions object for intent function creation. Missing either registration causes 'intent not found' errors when components try to call intents.
- Modal types must be registered in modal-manager.js switch-case with a dedicated renderXxx() method. Unknown modal types log 'Unknown modal type: xxx' and display 'Loading' indefinitely. Each new modal type requires both registration and renderer implementation.

# Assigned Skills

## frontend-design

---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality. Use this skill when the user asks to build web components, pages, or applications. Generates creative, polished code that avoids generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
