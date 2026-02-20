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

- GitHub release workflow uses tag format 'release/v*' (e.g., release/v3.0.0) with version extraction step that strips 'release/v' prefix before patching package.json via 'npm version --no-git-tag-version'. Version must be extracted and patched before npm run package to generate platform-specific artifacts with correct version numbers (Puffin-3.0.0.exe, Puffin-3.0.0.AppImage, etc.).
- Documentation organization: docs/ root contains only critical architecture/process documents (ARCHITECTURE.md, DATABASE_SCHEMA.md, SPRINT_PROCESS.md, etc.); other docs organized into subdirectories: docs/summaries/ (plugin/feature summaries), docs/plans/ (implementation plans), docs/specifications/ (feature specs), docs/design/ (design docs), docs/reference/ (reference material), docs/research/ (research topics). README links updated to reflect new structure.
- Plugin inventory: Puffin v3.0 includes 12 active plugins (Excalidraw, Document Editor, RLM Documents, Context, Docs, h-DSL Viewer, Stats, Calendar, Memory, Outcome Lifecycle, Prompt Templates, Toast History). Designer plugin deprecated/replaced by Excalidraw. Each plugin documented in USER_MANUAL.md with use cases and workflow integration.
- Release documentation structure: CHANGELOG.md entry format includes major features section, changes & fixes section, documentation section, technical/breaking changes section, and credits. v3.0.0 represents major architectural shift with Central Reasoning Engine (CRE) as primary new feature.
- Documentation structure for v3.0.0 release includes: CHANGELOG.md (release notes), README.md (project overview with features and quick start), USER_MANUAL.md (comprehensive user guide with CRE, Excalidraw, Memory Plugin sections), GETTING_STARTED.md (5-minute quickstart focused on new user workflow).
- Plugin inventory must be kept accurate in README.md, including all built-in plugins (Stats, Designer, Context, Docs, Editor) and v3.0 additions (Excalidraw, h-DSL Viewer, Memory, Outcome Lifecycle, Calendar, Prompt Templates, RLM Documents, Toast History). Deprecated plugins should be explicitly noted.
- User-facing documentation hierarchy: GETTING_STARTED.md for quick onboarding with time estimates, README.md for feature overview and system requirements, USER_MANUAL.md for comprehensive reference including plugin details and CRE workflows, with cross-links between documents.

### Architectural Decisions
- Documentation strategy for releases: Maintain layered documentation (README for marketing/overview, USER_MANUAL.md for feature documentation, GETTING_STARTED.md for quick onboarding, CHANGELOG.md for version history). GETTING_STARTED.md optimized for new users without requiring full manual knowledge. README includes comparison table contrasting traditional AI coding vs. structured Puffin workflow.
- Release versioning uses git tags as the source of truth with format 'release/v<version>'. The CI/CD workflow extracts the version from the tag and patches package.json dynamically during build, eliminating manual version management and ensuring binaries match the tagged release.
- CRE workflow is two-stage: Plan generation (implementation plan) followed by RIS generation (ready-to-implement specifications per story), with assertion generation deriving from RIS content rather than plan items.
- Documentation is organized into docs root (critical architecture/process documents used as implementation context) and subdirectories by type (docs/plans/, docs/research/, docs/specifications/, docs/design/, docs/summaries/, docs/reference/). This supports clear separation between reference materials and supplementary documentation.
- Release versioning is driven by git tags rather than hardcoded in package.json. CI workflow automatically extracts version from tag, patches package.json, and builds all platform artifacts in parallel. This decouples version management from code commits and enables reproducible, platform-consistent releases.
