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
