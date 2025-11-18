# Contributing to Microservices Trading Platform

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Table of Contents

- [Git Workflow](#git-workflow)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Quality Standards](#code-quality-standards)
- [Testing Requirements](#testing-requirements)

## Git Workflow

This project follows the **Git Flow** branching model.

### Branch Structure

- **`main`**: Production-ready code
  - Always stable and deployable
  - Only receives merges from `develop` for releases
  - Protected branch (requires PR reviews)
  - Tagged with version numbers (e.g., `v1.0.0`)

- **`develop`**: Integration branch for active development
  - Main development branch
  - Base branch for all feature branches
  - Should be stable but may contain unreleased features

- **`feature/*`**: Feature branches
  - Created from `develop`
  - One feature per branch
  - Merged back into `develop` via Pull Request

### Starting a New Feature

```bash
# 1. Switch to develop and get latest changes
git checkout develop
git pull origin develop

# 2. Create a new feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes and commit
git add .
git commit -m "feat(scope): your commit message"

# 4. Push your branch
git push -u origin feature/your-feature-name

# 5. Create a Pull Request targeting develop
gh pr create --base develop --title "Your feature title" --body "Description"
```

## Branch Naming

Use descriptive, kebab-case names with the `feature/` prefix:

### Good Examples
- `feature/add-grpc-service`
- `feature/implement-rate-limiting`
- `feature/redis-sorted-sets`
- `feature/add-prometheus-metrics`

### Bad Examples
- `my-feature` (missing prefix)
- `feature/fix` (too vague)
- `feature/AddGrpcService` (wrong case)
- `update` (missing prefix and too vague)

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **refactor**: Code refactoring (no functional changes)
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, config)
- **perf**: Performance improvements
- **style**: Code style changes (formatting, not CSS)

### Scopes

Common scopes in this project:
- `service-a`: Changes to Service A
- `service-b`: Changes to Service B
- `docker`: Docker configuration changes
- `redis`: Redis-related changes
- `rabbitmq`: RabbitMQ-related changes
- `tests`: Test-related changes

### Examples

```bash
# Feature additions
feat(service-a): add signal validation logic
feat(service-b): implement trade risk calculator
feat(redis): add sorted sets for time-series data

# Bug fixes
fix(service-b): resolve Redis connection timeout
fix(service-a): fix signal timestamp format

# Documentation
docs: update CLAUDE.md with branching model
docs(readme): add testing instructions

# Refactoring
refactor(service-a): extract signal generation to separate module
refactor(service-b): simplify trade processing logic

# Tests
test(service-a): add unit tests for signal generation
test(service-b): add integration tests for Redis caching

# Chores
chore: update dependencies to latest versions
chore(docker): optimize Dockerfile for faster builds
```

### Atomic Commits

Keep commits small and focused:

- ✅ **Good**: `feat(service-a): add signal validation`
- ✅ **Good**: `test(service-a): add tests for signal validation`
- ❌ **Bad**: `feat(service-a): add signal validation, update tests, fix bug, update docs`

## Pull Request Process

### Before Creating a PR

1. **Ensure your branch is up to date**:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout feature/your-feature
   git rebase develop
   ```

2. **Run all quality checks**:
   ```bash
   cd service-a  # or service-b
   npm run type-check    # TypeScript compilation
   npm run lint:fix      # Fix linting issues
   npm run format        # Format code
   npm test              # Run all tests
   ```

3. **Ensure tests pass**:
   - All unit tests pass
   - All integration tests pass
   - Coverage thresholds met (80%)

### Creating a PR

1. **Push your branch**:
   ```bash
   git push -u origin feature/your-feature
   ```

2. **Create PR targeting `develop`** (not `main`):
   ```bash
   gh pr create --base develop --title "Brief title" --body "$(cat <<'EOF'
   ## Summary
   Brief description of changes

   ## Changes
   - Change 1
   - Change 2

   ## Testing
   How to test these changes

   ## Notes
   Any additional context
   EOF
   )"
   ```

### PR Template

Use this template for your PR description:

```markdown
## Summary
Brief description of what this PR does and why.

## Changes
- List of specific changes made
- Use bullet points for clarity
- Include file paths when relevant

## Testing
- Describe how to test these changes
- Include relevant test commands
- Note any manual testing performed

## Screenshots (if applicable)
Add screenshots for UI changes

## Notes
Any additional context, considerations, or follow-up items
```

### PR Review Process

1. Wait for CI/CD checks to pass (when implemented)
2. Address review feedback
3. Keep PR focused and reasonably sized (< 500 lines ideal)
4. Respond to comments and update code as needed
5. Once approved, merge using GitHub UI

## Code Quality Standards

### TypeScript

- **Strict mode**: Always enabled
- **Type annotations**: Required for function signatures
- **No `any`**: Avoid using `any` type (lint warning)
- **Async/await**: Use async/await instead of callbacks

### ESLint Rules

All code must pass ESLint checks:

```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix issues
```

Key rules enforced:
- No unused variables (except prefixed with `_`)
- Explicit return types on functions
- No floating promises
- No explicit `any` types (warning)

### Prettier Formatting

All code must be formatted with Prettier:

```bash
npm run format:check    # Check formatting
npm run format          # Auto-format
```

Configuration:
- Single quotes
- 2-space indentation
- 100 character line width
- Semicolons required
- ES5 trailing commas

### Code Organization

- **Separation of concerns**: Business logic separate from infrastructure
- **Testability**: Functions should be pure and easily testable
- **Modularity**: Extract reusable logic into separate modules
- **Type safety**: Export types from modules that define them

## Testing Requirements

### Test Coverage

- **Minimum coverage**: 80% for lines, functions, branches, statements
- **Unit tests**: Test individual functions in isolation
- **Integration tests**: Test real service interactions

### Writing Tests

1. **Unit Tests** (`tests/unit/`):
   ```typescript
   import { describe, it, expect } from 'vitest';
   import { myFunction } from '../../src/module';

   describe('myFunction', () => {
     it('should do something specific', () => {
       const result = myFunction('input');
       expect(result).toBe('expected');
     });
   });
   ```

2. **Integration Tests** (`tests/integration/`):
   ```typescript
   import { describe, it, expect, beforeAll, afterAll } from 'vitest';
   import { GenericContainer } from 'testcontainers';

   describe('Integration Test', () => {
     let container;

     beforeAll(async () => {
       container = await new GenericContainer('redis:7-alpine')
         .withExposedPorts(6379)
         .start();
     });

     afterAll(async () => {
       await container.stop();
     });

     it('should test real integration', async () => {
       // Test with real service
     });
   });
   ```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# UI mode for debugging
npm run test:ui
```

## Development Environment Setup

### Prerequisites

- Node.js 18+
- Docker Desktop
- Git

### Initial Setup

```bash
# Clone repository
git clone https://github.com/CreateWithLevi/microservices-trading-platform.git
cd microservices-trading-platform

# Checkout develop branch
git checkout develop

# Install dependencies for both services
cd service-a && npm install && cd ..
cd service-b && npm install && cd ..

# Start infrastructure with Docker
docker compose up -d rabbitmq redis
```

### IDE Configuration

**Recommended VS Code extensions**:
- ESLint
- Prettier - Code formatter
- EditorConfig for VS Code
- TypeScript + JavaScript Language Features

**Settings** (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Questions or Issues?

- Open an issue on GitHub for bugs or feature requests
- Check existing issues before creating new ones
- Provide clear reproduction steps for bugs

## Code of Conduct

- Be respectful and professional
- Focus on constructive feedback
- Help create a welcoming environment for all contributors

---

Thank you for contributing to the Microservices Trading Platform!
