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
