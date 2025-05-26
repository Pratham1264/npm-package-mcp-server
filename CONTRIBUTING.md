# Contributing to NPM Package MCP Server

Thank you for your interest in contributing to the NPM Package MCP Server! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Git

### Development Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/your-username/npm-package-mcp-server.git
   cd npm-package-mcp-server
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run in Development Mode**
   ```bash
   npm run dev
   ```

### Project Structure

```
├── src/
│   └── server.ts          # Main MCP server implementation
├── dist/                  # Compiled JavaScript output
├── package.json           # Project dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── README.md              # Project documentation
└── CONTRIBUTING.md        # This file
```

## 🛠️ Development Workflow

### Making Changes

1. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**
   - Write your code following our coding standards
   - Add tests for new functionality
   - Update documentation as needed

3. **Test Your Changes**
   ```bash
   npm run build
   npm run type-check
   ```

4. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

### Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

Examples:
```
feat: add package version filtering
fix: resolve tarball extraction timeout
docs: update API reference for new tool
refactor: improve error handling in package fetcher
```

## 🧪 Testing

### Running Tests

Currently, the project uses manual testing. We welcome contributions to add automated testing:

```bash
npm test  # Currently shows "no test specified"
```

### Manual Testing

Test your changes with a real MCP client:

1. Build the project: `npm run build`
2. Test with Claude Desktop or another MCP client
3. Verify all tools work correctly:
   - `get_npm_package_code`
   - `list_package_files`
   - `get_package_info`
   - `search_npm_packages`

## 📝 Code Style Guidelines

### TypeScript Standards

- Use TypeScript strict mode
- Provide proper type annotations
- Use interfaces for complex objects
- Follow existing naming conventions

### Code Organization

- Keep functions focused and single-purpose
- Use meaningful variable and function names
- Add JSDoc comments for public methods
- Handle errors appropriately with McpError

### Example Code Style

```typescript
/**
 * Fetches package information from NPM registry
 * @param packageName - The name of the package
 * @param version - Optional specific version
 * @returns Promise resolving to package information
 */
private async fetchPackageInfo(packageName: string, version?: string): Promise<PackageInfo> {
  // Implementation here
}
```

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Description**: Clear description of the issue
2. **Steps to Reproduce**: Exact steps to reproduce the problem
3. **Expected Behavior**: What you expected to happen
4. **Actual Behavior**: What actually happened
5. **Environment**: Node.js version, OS, MCP client used
6. **Package Details**: NPM package name and version if relevant

### Bug Report Template

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Run command '...'
2. Use package '...'
3. See error

**Expected behavior**
A clear description of what you expected to happen.

**Environment:**
- Node.js version: [e.g. 18.0.0]
- OS: [e.g. macOS 14.0]
- MCP Client: [e.g. Claude Desktop]

**Additional context**
Add any other context about the problem here.
```

## 💡 Feature Requests

We welcome feature requests! Please:

1. Check existing issues to avoid duplicates
2. Describe the use case and benefit
3. Provide implementation details if possible
4. Consider backwards compatibility

## 🚀 Pull Request Process

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review of the code
- [ ] Corresponding changes to documentation
- [ ] Manual testing completed
- [ ] No breaking changes (or properly documented)

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Manual testing completed
- [ ] All existing functionality still works
- [ ] New functionality works as expected

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated documentation accordingly
```

## 🏷️ Release Process

Releases are managed by maintainers:

1. Version bump in `package.json`
2. Update CHANGELOG.md
3. Create GitHub release
4. Publish to NPM registry

## 📚 Additional Resources

- [Model Context Protocol Documentation](https://spec.modelcontextprotocol.io/)
- [NPM Registry API](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Node.js Documentation](https://nodejs.org/docs/)

## 🤝 Community Guidelines

### Be Respectful

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what is best for the community

### Be Collaborative

- Help others learn and grow
- Share knowledge and resources
- Provide constructive feedback
- Support fellow contributors

## ❓ Getting Help

- **Issues**: Create a GitHub issue for bugs or feature requests
- **Discussions**: Use GitHub Discussions for general questions
- **Documentation**: Check the README.md for usage information

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to NPM Package MCP Server! 🎉