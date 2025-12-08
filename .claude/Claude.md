# puffin

Puffin is an Electron-based GUI application that serves as a **management layer** on top of the Claude Code CLI (3CLI). Its primary purpose is to:

1. **Track and organize** 3CLI outputs and conversations
2. **Provide context** to 3CLI through project configuration and history
3. **Visualize** the development process (prompts, responses, branches)
4. **Communicate UI designs** via the GUI designer

**Important**: 3CLI remains in control of building the project. Puffin is an orchestration and tracking tool, not a replacement for the CLI's capabilities.

## Coding Preferences

- **Programming Style**: HYBRID
- **Testing Approach**: BDD
- **Documentation Level**: STANDARD
- **Error Handling**: EXCEPTIONS
- **Naming Convention**: CAMEL
- **Comment Style**: JSDoc

## UX Style Guidelines

- **Alignment**: left
- **Font Family**: system-ui, -apple-system, sans-serif
- **Base Font Size**: 16px

### Color Palette

- **Primary**: #6c63ff
- **Secondary**: #16213e
- **Accent**: #48bb78
- **Background**: #ffffff
- **Text**: #1a1a2e
- **Error**: #f56565

## Architecture

Puffin follows an Electron architecture with clear separation between main and renderer processes, using the SAM (State-Action-Model) pattern for predictable state management.

### Process Structure

- **Main Process** (`src/main/`): Node.js runtime handling system operations
  - `main.js` - Window creation, menu, app lifecycle
  - `preload.js` - Secure IPC bridge via contextBridge
  - `ipc-handlers.js` - IPC communication handlers
  - `puffin-state.js` - `.puffin/` directory state persistence
  - `claude-service.js` - Claude Code CLI subprocess management
  - `developer-profile.js` - Developer profile with GitHub OAuth

- **Renderer Process** (`src/renderer/`): Browser runtime for UI
  - `app.js` - Application bootstrap and SAM setup
  - `sam/` - SAM pattern implementation (model, state, actions, instance)
  - `components/` - UI components (prompt-editor, response-viewer, gui-designer, etc.)

### Data Flow

```
User Intent → Action → Model (acceptors) → State → View → User Intent...
```

Two FSMs control application flow:
- **App FSM**: INITIALIZING → LOADING → READY ↔ PROCESSING → ERROR
- **Prompt FSM**: IDLE → COMPOSING → SUBMITTED → AWAITING → COMPLETED/FAILED

### State Persistence

All project state is stored in `.puffin/` within the target project:
- `config.json` - Project configuration and Claude options
- `history.json` - Branched conversation history
- `architecture.md` - Architecture documentation
- `user-stories.json` - User stories data
- `ui-guidelines.json` - Design system tokens and patterns
- `gui-definitions/` - Saved GUI layouts

### Technology Stack

- **Platform**: Electron 33+
- **Frontend**: Vanilla JavaScript (ES6+ modules)
- **State Management**: SAM Pattern (sam-pattern, sam-fsm)
- **Markdown**: marked for response rendering
- **CLI Integration**: Claude Code spawned as subprocess with JSON streaming
- **Storage**: File-based JSON in `.puffin/` directory


## UI Guidelines

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

### Typography Guidelines
# Typography Guidelines

## Font Selection
- Primary font for headings
- Secondary font for body text
- Monospace font for code

## Font Sizing
- Establish a type scale
- Use consistent line heights
- Maintain readable font sizes across devices

### Colors Guidelines
# Color Guidelines

## Color Palette
- Primary colors for branding
- Secondary colors for accents
- Neutral colors for text and backgrounds

## Accessibility
- Maintain adequate contrast ratios
- Consider color blindness
- Test in different lighting conditions

### Components Guidelines
# Component Guidelines

## Consistency
- Reusable component patterns
- Consistent interaction patterns
- Standard component variants

## States
- Default, hover, focus, disabled states
- Loading and error states
- Active and selected states

### Interactions Guidelines
# Interaction Guidelines

## User Feedback
- Provide clear feedback for user actions
- Use appropriate animations and transitions
- Indicate loading and processing states

## Accessibility
- Keyboard navigation support
- Screen reader compatibility
- Touch-friendly targets for mobile

## Design Tokens

### Colors
- **Primary**: #6c63ff (Main brand color)
- **Secondary**: #16213e (Secondary accent color)
- **Success**: #48bb78 (Success state color)
- **Warning**: #ecc94b (Warning state color)
- **Error**: #f56565 (Error state color)
- **Neutral**: #e6e6e6 (Neutral text color)

### Font Families
- **Primary**: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif (Main UI font)
- **Monospace**: "SF Mono", "Fira Code", Consolas, monospace (Code and technical content)

### Font Sizes
- **Small**: 0.875rem (Small text, captions)
- **Base**: 1rem (Body text default)
- **Large**: 1.125rem (Large body text)
- **H3**: 1.25rem (Heading 3)
- **H2**: 1.5rem (Heading 2)
- **H1**: 1.75rem (Heading 1)

### Spacing
- **XS**: 0.25rem (Extra small spacing)
- **SM**: 0.5rem (Small spacing)
- **MD**: 0.75rem (Medium spacing)
- **LG**: 1rem (Large spacing)
- **XL**: 1.5rem (Extra large spacing)
- **2XL**: 2rem (Double extra large spacing)

## Component Patterns

### Primary Button
Main call-to-action button with primary styling

**Guidelines:**
Use for primary actions like "Save", "Submit", "Create". Limit to one per page section.

**HTML Template:**
```html
<button class="btn btn-primary">Button Text</button>
```

**CSS Rules:**
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