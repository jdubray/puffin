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

---

## Deployment Working Principles

### 1. Think Before Shipping
- Know the blast radius: who/what is affected if this deploy fails?
- Read the current CI config, build scripts, and electron-builder setup before changing them.
- Identify the rollback path before pushing forward.

### 2. Simplicity First
- Prefer one linear pipeline over a matrix of conditionals.
- Reuse existing build steps and platform configs. Platform-specific quirks belong in platform blocks, not new scripts.
- No secrets in code; no environment-specific logic that isn't clearly env-gated.

### 3. Surgical Changes
- CI/CD changes affect every future deploy. Scope tightly and commit separately from feature changes.
- Don't "upgrade while you're here" — version bumps belong in dedicated commits.

### 4. Verify the Build
- Build locally where possible before pushing. A failing CI build is a slower feedback loop.
- Confirm signing, notarization, and platform-specific packaging still work for all target OSes.
- Smoke-test the produced artifact, not just the build success.

<!-- puffin:generated-end -->
