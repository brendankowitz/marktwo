# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MarkTwo is a VS Code extension that provides AI-powered markdown and MDX enhancement with a side-by-side editing experience. It uses the VS Code Language Model API (GitHub Copilot) to enhance text while preserving the author's voice.

## Build Commands

```bash
npm run compile    # Compile TypeScript to JavaScript (outputs to out/)
npm run watch      # Watch mode for development
npm run lint       # Run ESLint on src/*.ts files
```

To test the extension: Press F5 in VS Code to launch the Extension Development Host.

## Architecture

### Core Components (src/)

- **extension.ts** - Main entry point. Registers commands (`marktwo.showPanel`, `marktwo.refreshPanel`, `marktwo.hidePanel`), manages document change listeners with debouncing, and orchestrates paragraph enhancement. Uses content-based hashing for caching to avoid re-processing unchanged paragraphs.

- **aiService.ts** - Handles all AI interactions via `vscode.lm` API. Builds prompts for different enhancement modes (expand, clarify, professional, casual, technical, list-expand) and paragraph types (text, heading, list, html, frontmatter, mdx). Parses JSON responses containing enhanced text and suggestions.

- **markdownProcessor.ts** - Parses markdown/MDX into paragraphs. Detects paragraph types, handles code blocks, YAML frontmatter, MDX imports/exports, and comment directives (`<!-- ai-ignore -->`, `<!-- no-enhance -->`, `<!-- ai-style: mode -->`). Also supports JSX-style comments for MDX (`{/* ai-ignore */}`).

- **enhancementPanel.ts** - WebView panel management. Renders the preview panel and handles bidirectional messaging with the webview (script.js).

- **contextManager.ts** - Builds context strings from previous paragraphs for AI enhancement.

- **types.ts** - TypeScript interfaces and the `getSettings()` helper for reading VS Code configuration.

### WebView (media/)

- **script.js** - Webview client code. Renders enhanced paragraphs, handles user interactions (style dropdown, keep button, apply suggestions, text selection for custom improvements). Includes a custom markdown renderer with HTML sanitization.

- **styles.css** - Webview styling.

## Key Patterns

### Comment Directives
Users can control enhancement behavior with HTML or JSX comments:
- `<!-- ai-ignore -->` / `{/* ai-ignore */}` - Skip enhancement for next paragraph
- `<!-- no-enhance -->` / `{/* no-enhance */}` - Mark paragraph as user-approved (won't re-enhance)
- `<!-- ai-style: expand -->` / `{/* ai-style: expand */}` - Override enhancement mode

### Paragraph Types
The processor identifies: `text`, `heading`, `list`, `code`, `quote`, `html`, `frontmatter`, `mdx`. Each type has specific handling - headings get light editing, code/frontmatter/mdx are ignored, html gets accessibility suggestions.

### Configuration Namespace
All settings use the `marktwo.*` prefix (e.g., `marktwo.enhancementMode`, `marktwo.debounceDelay`).
