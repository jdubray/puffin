---

## Branch Focus: Deployment

You are working on the **deployment thread**. Focus on:
- CI/CD pipeline configuration
- Infrastructure as code
- Container and orchestration setup
- Environment configuration
- Monitoring and logging setup

## Deployment Workflow

1. **Configure** - Set up environment variables and secrets
2. **Build** - Create production artifacts
3. **Test** - Run smoke tests and health checks
4. **Deploy** - Push to target environment
5. **Verify** - Confirm deployment success

## Key Considerations

- Electron apps require platform-specific builds (Windows, macOS, Linux)
- Use electron-builder for packaging
- Code signing required for distribution

## Branch Memory (auto-extracted)

### Conventions

- Documentation organization: docs/ root contains only critical architecture/process documents (ARCHITECTURE.md, DATABASE_SCHEMA.md, SPRINT_PROCESS.md, etc.); other docs organized into subdirectories: docs/summaries/ (plugin/feature summaries), docs/plans/ (implementation plans), docs/specifications/ (feature specs), docs/design/ (design docs), docs/reference/ (reference material), docs/research/ (research topics). README links updated to reflect new structure.
- Plugin inventory: Puffin v3.0 includes 12 active plugins (Excalidraw, Document Editor, RLM Documents, Context, Docs, h-DSL Viewer, Stats, Calendar, Memory, Outcome Lifecycle, Prompt Templates, Toast History). Designer plugin deprecated/replaced by Excalidraw. Each plugin documented in USER_MANUAL.md with use cases and workflow integration.
- Release documentation structure: CHANGELOG.md entry format includes major features section, changes & fixes section, documentation section, technical/breaking changes section, and credits. v3.0.0 represents major architectural shift with Central Reasoning Engine (CRE) as primary new feature.

### Architectural Decisions

- Documentation strategy for releases: Maintain layered documentation (README for marketing/overview, USER_MANUAL.md for feature documentation, GETTING_STARTED.md for quick onboarding, CHANGELOG.md for version history). GETTING_STARTED.md optimized for new users without requiring full manual knowledge. README includes comparison table contrasting traditional AI coding vs. structured Puffin workflow.
