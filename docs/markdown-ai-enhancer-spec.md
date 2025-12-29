# VSCode AI Markdown Enhancement Extension - Specification

## Quick Start Summary

**Best User Experience:** This extension uses the VSCode Language Model API by default, which means:
- ✅ **No API key setup** - just install and start using
- ✅ **Uses your existing GitHub Copilot subscription**
- ✅ **Better VSCode integration** and respects user's model preferences
- ✅ **Fallback to Claude API** available if you don't have Copilot

**Requirements:**
- VSCode 1.90.0 or later
- GitHub Copilot subscription (recommended), OR
- Claude API key (alternative)

## Project Overview

A VSCode extension that provides a side-by-side editing experience where markdown content is automatically enhanced with AI as you write. The original markdown remains editable on the left, while AI-enhanced content appears in a preview panel on the right.

## Core Features

### 1. Split Panel Interface
- **Left Panel**: Editable markdown document (standard VSCode editor)
- **Right Panel**: Read-only preview showing AI-enhanced content
- Toggle command to show/hide the enhancement panel
- Synchronized scrolling (optional)

### 2. Paragraph-Level Processing
- Automatically detect paragraph boundaries (double newline or markdown blocks)
- Process each paragraph independently while maintaining context
- Debounced processing (wait 1-2 seconds after user stops typing)
- Visual indicators showing which paragraphs are being processed

### 3. Context-Aware AI Enhancement
- Maintain document-level context (title, previous paragraphs)
- Configurable enhancement modes:
  - **Expand**: Add detail and examples
  - **Clarify**: Improve readability and structure
  - **Professional**: Make more formal
  - **Casual**: Make more conversational
  - **Technical**: Add technical depth
- Preserve markdown formatting (headers, lists, code blocks, etc.)

### 4. User Controls
- Settings for:
  - AI provider selection (VSCode LM or Claude API)
  - API key configuration (for Claude API)
  - Enhancement mode selection
  - Context window size (how many previous paragraphs to include)
  - Debounce delay
  - Enable/disable auto-enhancement
  - Preferred model family (for VSCode LM)
- Manual refresh button to re-process entire document
- Per-paragraph accept/reject controls (future enhancement)

## User Onboarding

### First-Time Setup

The extension should guide users through setup based on their available tools:

**Option 1: GitHub Copilot Users (Recommended)**
1. Extension activates with default `vscode-lm` provider
2. If Copilot is installed and authenticated, it just works
3. No configuration needed

**Option 2: Claude API Users**
1. Users without Copilot see a helpful message
2. Offered choice to:
   - Install GitHub Copilot (link to marketplace)
   - Use Claude API instead (link to get API key)
3. If choosing Claude API:
   - Change setting: `markdown-ai-enhancer.provider` to `claude-api`
   - Set `markdown-ai-enhancer.claudeApiKey`

### Error Messages

The extension should provide helpful, actionable error messages:

```
❌ "No language models available"
→ "To use this extension, either:
   1. Install and authenticate with GitHub Copilot (recommended), or
   2. Switch to Claude API in settings and add your API key"
   [Open Settings] [Get Copilot] [Get Claude API Key]

❌ "Claude API key not configured"
→ "You've selected Claude API but no API key is set.
   Get your API key from console.anthropic.com"
   [Open Settings] [Get API Key]
```

## Technical Architecture

### File Structure

```
markdown-ai-enhancer/
├── package.json                 # Extension manifest
├── tsconfig.json               # TypeScript configuration
├── .vscode/
│   └── launch.json            # Debug configuration
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── enhancementPanel.ts    # WebView panel manager
│   ├── markdownProcessor.ts   # Paragraph parsing logic
│   ├── aiService.ts           # Claude API integration
│   ├── contextManager.ts      # Document context tracking
│   └── types.ts               # TypeScript interfaces
├── media/
│   ├── styles.css             # Panel styling
│   └── script.js              # WebView client script
└── README.md
```

### Key Components

#### 1. Extension Activation (`extension.ts`)
```typescript
export function activate(context: vscode.ExtensionContext) {
    // Register commands
    // Initialize enhancement panel
    // Set up document change listeners
    // Register configuration change handlers
}
```

**Responsibilities:**
- Register command: `markdown-ai-enhancer.showPanel`
- Create and manage enhancement panel lifecycle
- Listen to active editor changes
- Handle configuration updates

#### 2. Enhancement Panel (`enhancementPanel.ts`)
```typescript
class EnhancementPanel {
    private panel: vscode.WebviewPanel;
    private documentUri: vscode.Uri;
    
    public static createOrShow(extensionUri: vscode.Uri): void
    public update(content: string): void
    private getWebviewContent(): string
}
```

**Responsibilities:**
- Create and manage WebView panel
- Render enhanced markdown as HTML
- Handle panel visibility and lifecycle
- Communicate with extension via messages

#### 3. Markdown Processor (`markdownProcessor.ts`)
```typescript
interface Paragraph {
    content: string;
    startLine: number;
    endLine: number;
    type: 'text' | 'heading' | 'list' | 'code' | 'quote';
}

class MarkdownProcessor {
    public extractParagraphs(document: string): Paragraph[]
    public buildContext(paragraphs: Paragraph[], currentIndex: number): string
}
```

**Responsibilities:**
- Parse markdown into paragraphs
- Identify paragraph types (text, code blocks, lists, headings)
- Build context for AI processing
- Maintain paragraph boundaries

#### 4. AI Service (`aiService.ts`)
```typescript
enum AIProvider {
    VSCodeLM = 'vscode-lm',
    ClaudeAPI = 'claude-api'
}

interface EnhancementRequest {
    paragraph: string;
    context: string;
    mode: EnhancementMode;
}

interface EnhancementResponse {
    original: string;
    enhanced: string;
    metadata?: {
        tokensUsed?: number;
        processingTime: number;
        provider: AIProvider;
    };
}

class AIService {
    private provider: AIProvider;
    private apiKey?: string;
    
    public async enhance(request: EnhancementRequest): Promise<EnhancementResponse>
    
    private async enhanceWithVSCodeLM(request: EnhancementRequest): Promise<string>
    private async enhanceWithClaudeAPI(request: EnhancementRequest): Promise<string>
    
    private buildPrompt(request: EnhancementRequest): string
    
    private async getAvailableModels(): Promise<vscode.LanguageModelChat[]>
    private validateProvider(): void
}
```

**Responsibilities:**
- Manage dual AI provider system (VSCode LM + Claude API)
- Route requests to appropriate provider
- Build enhancement prompts
- Handle API errors and provider fallback
- Validate provider configuration
- Cache responses (optional optimization)

#### 5. Context Manager (`contextManager.ts`)
```typescript
class ContextManager {
    private documentContext: Map<string, DocumentContext>;
    
    public getDocumentTitle(document: vscode.TextDocument): string
    public getPreviousParagraphs(paragraphs: Paragraph[], current: number, count: number): string
    public getEnhancementSettings(): EnhancementSettings
}
```

**Responsibilities:**
- Track document-level metadata
- Manage context window for AI processing
- Store and retrieve user preferences
- Handle document theme/topic extraction

## Data Flow

```
User Types in Editor
        ↓
Debounce Timer (1-2s)
        ↓
Extract Paragraphs
        ↓
For Each Changed Paragraph:
    ├─→ Build Context (previous paragraphs, title, mode)
    ├─→ Send to Claude API
    ├─→ Receive Enhanced Text
    └─→ Update Preview Panel
        ↓
Render Complete Document in Preview
```

## Configuration Schema

```json
{
    "markdown-ai-enhancer.provider": {
        "type": "string",
        "enum": ["vscode-lm", "claude-api"],
        "default": "vscode-lm",
        "description": "AI provider: 'vscode-lm' uses GitHub Copilot (recommended), 'claude-api' uses direct Claude API"
    },
    "markdown-ai-enhancer.claudeApiKey": {
        "type": "string",
        "description": "Anthropic API key (only required when using 'claude-api' provider)",
        "markdownDescription": "Get your API key from [Anthropic Console](https://console.anthropic.com/)"
    },
    "markdown-ai-enhancer.enhancementMode": {
        "type": "string",
        "enum": ["expand", "clarify", "professional", "casual", "technical"],
        "default": "expand",
        "description": "How to enhance the content"
    },
    "markdown-ai-enhancer.contextWindowSize": {
        "type": "number",
        "default": 2,
        "minimum": 0,
        "maximum": 5,
        "description": "Number of previous paragraphs to include as context"
    },
    "markdown-ai-enhancer.debounceDelay": {
        "type": "number",
        "default": 1500,
        "minimum": 500,
        "maximum": 5000,
        "description": "Milliseconds to wait after user stops typing before enhancing"
    },
    "markdown-ai-enhancer.autoEnhance": {
        "type": "boolean",
        "default": true,
        "description": "Automatically enhance as you type"
    },
    "markdown-ai-enhancer.preferredModel": {
        "type": "string",
        "enum": ["gpt-4o", "gpt-4", "gpt-3.5-turbo", "any"],
        "default": "any",
        "description": "Preferred Copilot model family (only applies when using vscode-lm provider)"
    }
}
```

## API Integration

### Provider Architecture

The extension supports two AI providers:

1. **VSCode Language Model API (Primary)** - Uses GitHub Copilot or other installed language models
2. **Claude API (Fallback)** - Direct API integration for users without Copilot

### VSCode Language Model API (Recommended)

```typescript
// Using the vscode.lm API
import * as vscode from 'vscode';

async function enhanceWithVSCodeLM(paragraph: string, context: string, mode: string): Promise<string> {
    // Select available models (prefers Copilot)
    const models = await vscode.lm.selectChatModels({
        vendor: 'copilot',  // Prefer GitHub Copilot models
        family: 'gpt-4o'     // Optional: specific model family
    });

    if (models.length === 0) {
        throw new Error('No language models available. Install GitHub Copilot or configure Claude API.');
    }

    const model = models[0];
    
    const messages = [
        vscode.LanguageModelChatMessage.User(
            buildPrompt(paragraph, context, mode)
        )
    ];

    const response = await model.sendRequest(
        messages, 
        {}, 
        new vscode.CancellationTokenSource().token
    );
    
    // Stream the response
    let enhanced = '';
    for await (const chunk of response.text) {
        enhanced += chunk;
    }
    
    return enhanced.trim();
}
```

**Benefits:**
- No API key setup required
- Uses user's existing Copilot subscription
- Better VSCode integration
- Automatic model selection

### Prompt Template (Both Providers)

```
You are an AI writing assistant helping to enhance markdown content. Your task is to rewrite the following paragraph to be [MODE].

DOCUMENT CONTEXT:
Title: {document_title}
Topic: {document_topic}

PREVIOUS PARAGRAPHS:
{previous_paragraphs}

CURRENT PARAGRAPH TO ENHANCE:
{current_paragraph}

Guidelines:
1. Maintain the core message and intent
2. Preserve markdown formatting (lists, emphasis, links, code)
3. Keep the paragraph length proportional (aim for {expansion_ratio}x)
4. Ensure smooth flow with previous content
5. Use the same tone as established in the document

OUTPUT ONLY THE ENHANCED PARAGRAPH, NO PREAMBLE OR EXPLANATION.
```

### Claude API Integration (Fallback)

```typescript
async function enhanceWithClaudeAPI(paragraph: string, context: string, mode: string): Promise<string> {
    const apiKey = getConfiguration('claudeApiKey');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: buildPrompt(paragraph, context, mode)
            }]
        })
    });

    const data = await response.json();
    return data.content[0].text.trim();
}
```

## Development Workflow

### Initial Setup

```bash
# Install prerequisites
npm install -g yo generator-code

# Generate extension scaffold
yo code

# Select:
# - New Extension (TypeScript)
# - Name: markdown-ai-enhancer
# - Description: AI-powered markdown enhancement with side-by-side editing
# - Initialize git: Yes
# - Package manager: npm

cd markdown-ai-enhancer
npm install

# Install dependencies
npm install --save-dev @types/vscode @types/node

# Optional: Only needed if using Claude API fallback
npm install @anthropic-ai/sdk
```

### Update package.json

Add the Language Model API proposal:

```json
{
    "name": "markdown-ai-enhancer",
    "displayName": "Markdown AI Enhancer",
    "description": "AI-powered markdown enhancement with side-by-side editing",
    "version": "0.0.1",
    "engines": {
        "vscode": "^1.90.0"
    },
    "enabledApiProposals": [
        "languageModels"
    ],
    "categories": [
        "Other"
    ],
    "activationEvents": [
        "onLanguage:markdown"
    ],
    "main": "./out/extension.js",
    "contributes": {
        "commands": [
            {
                "command": "markdown-ai-enhancer.showPanel",
                "title": "Markdown AI: Show Enhancement Panel"
            },
            {
                "command": "markdown-ai-enhancer.refreshPanel",
                "title": "Markdown AI: Refresh Enhancement"
            }
        ],
        "configuration": {
            "title": "Markdown AI Enhancer",
            "properties": {
                "markdown-ai-enhancer.provider": {
                    "type": "string",
                    "enum": ["vscode-lm", "claude-api"],
                    "default": "vscode-lm",
                    "description": "AI provider to use"
                }
                // ... other config properties
            }
        }
    },
    "scripts": {
        "vscode:prepublish": "npm run compile",
        "compile": "tsc -p ./",
        "watch": "tsc -watch -p ./"
    },
    "devDependencies": {
        "@types/node": "^20.x",
        "@types/vscode": "^1.90.0",
        "typescript": "^5.3.0"
    }
}
```

### Development & Testing

#### 1. Local Development

```bash
# Open in VSCode
code .

# The extension comes with a launch configuration
# Press F5 to launch Extension Development Host
```

This opens a new VSCode window with your extension loaded. Any `.md` file you open there will have the extension active.

#### 2. Development Iteration Loop

1. **Make code changes** in your main VSCode window
2. **Reload the Extension Development Host**: 
   - Press `Ctrl+R` (Windows/Linux) or `Cmd+R` (Mac) in the Extension Development Host window
   - Or use Developer Command: "Developer: Reload Window"
3. **Test your changes** immediately

#### 3. Debugging

The extension scaffold includes a `launch.json` with debug configuration:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": [
                "--extensionDevelopmentPath=${workspaceFolder}"
            ],
            "outFiles": [
                "${workspaceFolder}/out/**/*.js"
            ],
            "preLaunchTask": "${defaultBuildTask}"
        }
    ]
}
```

**To debug:**
1. Set breakpoints in your TypeScript code
2. Press F5 to launch with debugger attached
3. Breakpoints will hit in your main VSCode window

#### 4. Viewing Logs

```typescript
// In your extension code
const outputChannel = vscode.window.createOutputChannel('Markdown AI Enhancer');
outputChannel.appendLine('Debug message here');
outputChannel.show(); // Opens the output panel
```

View logs in Extension Development Host:
- View → Output
- Select "Markdown AI Enhancer" from dropdown

#### 5. Testing the WebView

For the preview panel:
- Right-click in the WebView panel → "Open WebView Developer Tools"
- This opens Chrome DevTools for the WebView
- Inspect HTML, debug JavaScript, view console logs

### Testing Checklist

#### Manual Testing Scenarios

1. **Basic Functionality**
   - [ ] Open a markdown file
   - [ ] Run command "Show AI Enhancement Panel"
   - [ ] Panel appears on the right side
   - [ ] Type a paragraph and wait
   - [ ] Enhanced content appears in preview

2. **Provider Testing**
   - [ ] Default VSCode LM provider works (requires GitHub Copilot)
   - [ ] Switch to Claude API provider
   - [ ] Configure Claude API key
   - [ ] Enhancement works with Claude API
   - [ ] Handle case where no Copilot and no API key
   - [ ] Graceful error messages for missing credentials

3. **Paragraph Detection**
   - [ ] Single paragraph
   - [ ] Multiple paragraphs separated by blank lines
   - [ ] Code blocks (should be preserved)
   - [ ] Lists (should be enhanced but maintain structure)
   - [ ] Headings (should be enhanced)

4. **Context Handling**
   - [ ] First paragraph (no prior context)
   - [ ] Subsequent paragraphs (includes context)
   - [ ] Change enhancement mode
   - [ ] Verify tone consistency

5. **Edge Cases**
   - [ ] Empty document
   - [ ] Very long paragraph (>500 words)
   - [ ] Rapid typing (debouncing works)
   - [ ] Network error handling (both providers)
   - [ ] Invalid API key (Claude)
   - [ ] No language models available (VSCode LM)
   - [ ] Switch between multiple markdown files

6. **Configuration**
   - [ ] Change AI provider
   - [ ] Change Claude API key
   - [ ] Change enhancement mode
   - [ ] Adjust context window size
   - [ ] Toggle auto-enhance on/off
   - [ ] Settings persist between sessions
   - [ ] Model preference (when using VSCode LM)

### Automated Testing (Optional)

Create `src/test/extension.test.ts`:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { MarkdownProcessor } from '../markdownProcessor';

suite('Markdown Processor Tests', () => {
    test('Extract paragraphs from simple markdown', () => {
        const markdown = `# Title\n\nParagraph 1\n\nParagraph 2`;
        const processor = new MarkdownProcessor();
        const paragraphs = processor.extractParagraphs(markdown);
        
        assert.strictEqual(paragraphs.length, 3);
        assert.strictEqual(paragraphs[0].type, 'heading');
        assert.strictEqual(paragraphs[1].type, 'text');
    });
});
```

Run tests:
```bash
npm test
```

## Performance Considerations

### 1. API Rate Limiting
- Implement request queuing
- Batch multiple paragraph changes
- Cache unchanged paragraphs

### 2. Debouncing Strategy
```typescript
let debounceTimer: NodeJS.Timeout | undefined;

function onDocumentChange() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    
    debounceTimer = setTimeout(() => {
        processChanges();
    }, config.debounceDelay);
}
```

### 3. Incremental Updates
- Track which paragraphs changed
- Only re-process modified paragraphs
- Preserve cached enhancements

### 4. Background Processing
- Use VSCode progress API for long operations
- Allow user to continue editing while processing
- Queue system for multiple pending enhancements

## Future Enhancements

1. **Accept/Reject UI**: Allow users to accept or reject individual paragraph enhancements
2. **History**: Track enhancement history with undo/redo
3. **Diff View**: Show what changed between original and enhanced
4. **Export**: Export enhanced version to new file
5. **Batch Mode**: Process entire document at once
6. **Custom Prompts**: Allow users to define custom enhancement prompts
7. **Additional AI Providers**: 
   - Ollama for local models
   - Azure OpenAI
   - Google Gemini (when VSCode LM supports it)
8. **Collaborative Features**: Share enhancement settings across team
9. **Smart Caching**: Cache enhancements to reduce API calls
10. **Model Selection UI**: Let users pick specific models in VSCode LM

## Security Considerations

1. **API Key Storage**: 
   - Use VSCode's `secrets` API for secure Claude API key storage
   - Never commit API keys to version control
   - Provide clear instructions for key management
   - VSCode LM provider requires no key storage (uses Copilot auth)

2. **Content Privacy**:
   - Warn users their content is sent to external AI services
   - Provide option to disable for sensitive documents
   - Respect workspace trust settings
   - VSCode LM: Uses GitHub's privacy terms
   - Claude API: Uses Anthropic's privacy terms

3. **Provider Validation**:
   - Validate provider configuration before sending requests
   - Clear error messages if Copilot not installed
   - Graceful fallback suggestions
   - Rate limit handling for both providers

4. **Error Handling**:
   - Graceful degradation if AI unavailable
   - Clear error messages
   - Retry logic with exponential backoff
   - Don't expose API keys in error messages or logs

## Success Metrics

- Extension activation time < 500ms
- Paragraph enhancement < 3 seconds
- No UI blocking during processing
- Support documents up to 10,000 lines
- Handle 50+ paragraphs without performance issues

## Documentation Requirements

1. **README.md**: Installation, configuration, usage examples
2. **CHANGELOG.md**: Version history
3. **In-editor help**: Command palette descriptions
4. **Configuration documentation**: Explain all settings
5. **API key setup guide**: Step-by-step instructions

## Deployment

### Packaging

```bash
# Install packaging tool
npm install -g @vscode/vsce

# Package extension
vsce package

# Output: markdown-ai-enhancer-1.0.0.vsix
```

### Local Installation

```bash
# Install from VSIX
code --install-extension markdown-ai-enhancer-1.0.0.vsix
```

### Publishing (Future)

```bash
# Create publisher account at https://marketplace.visualstudio.com/

# Publish
vsce publish
```

## Acceptance Criteria

- [ ] Extension activates when markdown file is opened
- [ ] Panel command creates side-by-side view
- [ ] Typing triggers AI enhancement after debounce
- [ ] Enhanced content maintains markdown formatting
- [ ] Multiple paragraphs process independently with context
- [ ] All enhancement modes work correctly
- [ ] Configuration changes apply immediately
- [ ] Error handling provides clear user feedback
- [ ] No memory leaks over extended use
- [ ] Performance acceptable with 1000+ line documents
