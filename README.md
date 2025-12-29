# MarkTwo

A VS Code extension that helps you write better, faster, and with more intention. MarkTwo is a **human-in-the-loop** writing assistant that keeps you in control while offering AI-powered enhancements.

> Read the announcement: [MarkTwo: A Writing Assistant That Keeps You in the Loop](https://kowitz.net/blog/marktwo-writing-assistant/)

## Why MarkTwo?

Most AI writing tools take over completely—generating large blocks of text that diverge from your voice and often hallucinate or over-polish. MarkTwo takes a different approach:

- **You stay in control** - Editable previews let you accept, modify, or reject suggestions
- **Paragraph-by-paragraph** - Keeps context tight and style consistent with truly iterative refinement
- **Sounds like you** - Provide a writing sample and MarkTwo matches your unique tone and style
- **Works everywhere** - Technical docs, emails, blog posts, and more

## Features

- **Side-by-side editing** - Your markdown on the left, AI-enhanced preview on the right
- **Multiple enhancement modes** - Expand, clarify, professional, casual, technical, or list-to-prose
- **Per-paragraph control** - Different styles for different sections using comment directives
- **Inline suggestions** - Get improvement ideas with one-click apply
- **Selection improvements** - Highlight text and tell the AI exactly how to improve it
- **MDX support** - Works with MDX files, ignoring imports and JSX components
- **Smart caching** - Unchanged paragraphs aren't re-processed

## Installation

### From VS Code Marketplace
*(Coming soon)*

### From Source
```bash
git clone https://github.com/brendankowitz/marktwo.git
cd marktwo
npm install
npm run compile
```

Then press `F5` in VS Code to launch the Extension Development Host.

## Requirements

- VS Code 1.90.0 or later
- GitHub Copilot subscription (uses VS Code Language Model API)

## Usage

1. Open a markdown or MDX file
2. Run `MarkTwo: Show Enhancement Panel` from the Command Palette (`Ctrl+Shift+P`)
3. Start writing - enhanced content appears in the preview panel after you pause typing
4. Use the style dropdown to try different enhancement modes
5. Click **Keep** to write the enhanced version back to your document

### Comment Directives

Control enhancement behavior with comments in your markdown:

```markdown
<!-- ai-ignore -->
This paragraph will be skipped entirely.

<!-- ai-style: professional -->
This paragraph will use the professional tone regardless of global setting.

<!-- no-enhance -->
This paragraph has been approved and won't be re-enhanced.
```

For MDX files, use JSX-style comments:
```mdx
{/* ai-ignore */}
{/* ai-style: casual */}
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `marktwo.enhancementMode` | `expand` | Default enhancement style |
| `marktwo.debounceDelay` | `20000` | Milliseconds to wait after typing before enhancing |
| `marktwo.autoEnhance` | `true` | Automatically enhance as you type |
| `marktwo.authorStyleSample` | `""` | Paste your writing to match your voice |
| `marktwo.audience` | `""` | Target audience (blog-post, email, technical-doc, etc.) |
| `marktwo.fileExtensions` | `["md", "mdx"]` | File extensions to process |
| `marktwo.showConsiderPanel` | `true` | Show inline suggestions for improvements |

## License

MIT

## Links

- [Announcement Blog Post](https://kowitz.net/blog/marktwo-writing-assistant/)
- [GitHub Repository](https://github.com/brendankowitz/marktwo)
