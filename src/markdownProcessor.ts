import { Paragraph, ParagraphType, EnhancementMode } from './types';

/**
 * Processes markdown content into paragraphs for enhancement
 */
export class MarkdownProcessor {
    private idCounter: number = 0;

    // Pattern to detect ai-ignore comments (HTML or JSX style)
    private static readonly AI_IGNORE_PATTERN = /(?:<!--\s*ai-ignore\s*-->|\{\/\*\s*ai-ignore\s*\*\/\})/i;

    // Pattern to detect no-enhance comments (HTML or JSX style)
    private static readonly NO_ENHANCE_PATTERN = /(?:<!--\s*no-enhance\s*-->|\{\/\*\s*no-enhance\s*\*\/\})/i;

    // Pattern to detect style override (HTML or JSX style)
    private static readonly STYLE_PATTERN = /(?:<!--\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*-->|\{\/\*\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*\*\/\})/i;

    /**
     * Generate a unique ID for a paragraph
     */
    private generateId(): string {
        return `para_${Date.now()}_${this.idCounter++}`;
    }

    /**
     * Check if a line contains an ai-ignore comment
     */
    private hasAiIgnoreComment(line: string): boolean {
        return MarkdownProcessor.AI_IGNORE_PATTERN.test(line);
    }

    /**
     * Check if a line contains a no-enhance comment
     */
    private hasNoEnhanceComment(line: string): boolean {
        return MarkdownProcessor.NO_ENHANCE_PATTERN.test(line);
    }

    /**
     * Extract style override from text if present
     */
    private extractStyleOverride(text: string): EnhancementMode | undefined {
        const match = text.match(MarkdownProcessor.STYLE_PATTERN);
        if (match) {
            // match[1] is HTML style capture, match[2] is JSX style capture
            const mode = (match[1] || match[2]);
            if (mode) {
                return mode.toLowerCase() as EnhancementMode;
            }
        }
        return undefined;
    }

    /**
     * Extract paragraphs from markdown content
     */
    public extractParagraphs(content: string): Paragraph[] {
        const lines = content.split('\n');
        const paragraphs: Paragraph[] = [];

        let currentParagraph: string[] = [];
        let startLine = 0;
        let inCodeBlock = false;
        let codeBlockDelimiter = '';
        let ignoreNextParagraph = false;
        let noEnhanceNextParagraph = false;
        let styleOverrideNext: EnhancementMode | undefined = undefined;
        let inFrontmatter = false;
        let frontmatterStart = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Handle YAML frontmatter (must start at line 0)
            if (i === 0 && trimmedLine === '---') {
                inFrontmatter = true;
                frontmatterStart = 0;
                currentParagraph = [line];
                continue;
            }

            // Check for frontmatter end
            if (inFrontmatter && trimmedLine === '---') {
                currentParagraph.push(line);
                paragraphs.push({
                    content: currentParagraph.join('\n'),
                    startLine: frontmatterStart,
                    endLine: i,
                    type: 'frontmatter',
                    id: this.generateId(),
                    ignore: true, // Frontmatter is always ignored
                    noEnhance: false
                });
                currentParagraph = [];
                inFrontmatter = false;
                frontmatterStart = -1;
                continue;
            }

            // Inside frontmatter - just accumulate
            if (inFrontmatter) {
                currentParagraph.push(line);
                continue;
            }

            // Check for ai-ignore comment (standalone, HTML or JSX) - also acts as paragraph boundary
            if (trimmedLine.match(/^(?:<!--\s*ai-ignore\s*-->|\{\/\*\s*ai-ignore\s*\*\/\})$/i)) {
                // Close any accumulated paragraph first
                if (currentParagraph.length > 0) {
                    const paraContent = currentParagraph.join('\n');
                    if (paraContent.trim()) {
                        const shouldIgnore = ignoreNextParagraph || this.hasAiIgnoreComment(paraContent);
                        const shouldNoEnhance = noEnhanceNextParagraph || this.hasNoEnhanceComment(paraContent);
                        const inlineStyle = this.extractStyleOverride(paraContent);
                        paragraphs.push({
                            content: paraContent,
                            startLine,
                            endLine: i - 1,
                            type: this.detectParagraphType(currentParagraph),
                            id: this.generateId(),
                            ignore: shouldIgnore,
                            noEnhance: shouldNoEnhance,
                            styleOverride: styleOverrideNext || inlineStyle
                        });
                    }
                    currentParagraph = [];
                    noEnhanceNextParagraph = false;
                    styleOverrideNext = undefined;
                }
                ignoreNextParagraph = true;
                continue;
            }

            // Check for no-enhance comment (standalone, HTML or JSX) - user kept/approved, also acts as paragraph boundary
            if (trimmedLine.match(/^(?:<!--\s*no-enhance\s*-->|\{\/\*\s*no-enhance\s*\*\/\})$/i)) {
                // Close any accumulated paragraph first
                if (currentParagraph.length > 0) {
                    const paraContent = currentParagraph.join('\n');
                    if (paraContent.trim()) {
                        const shouldIgnore = ignoreNextParagraph || this.hasAiIgnoreComment(paraContent);
                        const shouldNoEnhance = noEnhanceNextParagraph || this.hasNoEnhanceComment(paraContent);
                        const inlineStyle = this.extractStyleOverride(paraContent);
                        paragraphs.push({
                            content: paraContent,
                            startLine,
                            endLine: i - 1,
                            type: this.detectParagraphType(currentParagraph),
                            id: this.generateId(),
                            ignore: shouldIgnore,
                            noEnhance: shouldNoEnhance,
                            styleOverride: styleOverrideNext || inlineStyle
                        });
                    }
                    currentParagraph = [];
                    ignoreNextParagraph = false;
                    styleOverrideNext = undefined;
                }
                noEnhanceNextParagraph = true;
                continue;
            }

            // Check for style override comment (standalone, HTML or JSX)
            const standaloneStyleMatch = trimmedLine.match(/^(?:<!--\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*-->|\{\/\*\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*\*\/\})$/i);
            if (standaloneStyleMatch) {
                styleOverrideNext = (standaloneStyleMatch[1] || standaloneStyleMatch[2]).toLowerCase() as EnhancementMode;
                continue;
            }

            // Handle code blocks
            if (trimmedLine.startsWith('```') || trimmedLine.startsWith('~~~')) {
                if (!inCodeBlock) {
                    // Start of code block
                    // First, save any accumulated paragraph
                    if (currentParagraph.length > 0) {
                        const paraContent = currentParagraph.join('\n');
                        if (paraContent.trim()) {
                            const shouldIgnore = ignoreNextParagraph || this.hasAiIgnoreComment(paraContent);
                            const shouldNoEnhance = noEnhanceNextParagraph || this.hasNoEnhanceComment(paraContent);
                            const inlineStyle = this.extractStyleOverride(paraContent);
                            paragraphs.push({
                                content: paraContent,
                                startLine,
                                endLine: i - 1,
                                type: this.detectParagraphType(currentParagraph),
                                id: this.generateId(),
                                ignore: shouldIgnore,
                                noEnhance: shouldNoEnhance,
                                styleOverride: styleOverrideNext || inlineStyle
                            });
                            ignoreNextParagraph = false;
                            noEnhanceNextParagraph = false;
                            styleOverrideNext = undefined;
                        }
                        currentParagraph = [];
                    }

                    inCodeBlock = true;
                    codeBlockDelimiter = trimmedLine.startsWith('```') ? '```' : '~~~';
                    currentParagraph = [line];
                    startLine = i;
                } else if (trimmedLine.startsWith(codeBlockDelimiter)) {
                    // End of code block
                    currentParagraph.push(line);
                    paragraphs.push({
                        content: currentParagraph.join('\n'),
                        startLine,
                        endLine: i,
                        type: 'code',
                        id: this.generateId(),
                        ignore: true, // Code blocks are always ignored
                        noEnhance: false
                    });
                    currentParagraph = [];
                    inCodeBlock = false;
                    codeBlockDelimiter = '';
                    ignoreNextParagraph = false;
                    noEnhanceNextParagraph = false;
                    styleOverrideNext = undefined;
                } else {
                    currentParagraph.push(line);
                }
                continue;
            }

            // Inside code block
            if (inCodeBlock) {
                currentParagraph.push(line);
                continue;
            }

            // Empty line marks paragraph boundary
            if (trimmedLine === '') {
                if (currentParagraph.length > 0) {
                    const paraContent = currentParagraph.join('\n');
                    if (paraContent.trim()) {
                        const shouldIgnore = ignoreNextParagraph || this.hasAiIgnoreComment(paraContent);
                        const shouldNoEnhance = noEnhanceNextParagraph || this.hasNoEnhanceComment(paraContent);
                        const inlineStyle = this.extractStyleOverride(paraContent);
                        paragraphs.push({
                            content: paraContent,
                            startLine,
                            endLine: i - 1,
                            type: this.detectParagraphType(currentParagraph),
                            id: this.generateId(),
                            ignore: shouldIgnore,
                            noEnhance: shouldNoEnhance,
                            styleOverride: styleOverrideNext || inlineStyle
                        });
                        ignoreNextParagraph = false;
                        noEnhanceNextParagraph = false;
                        styleOverrideNext = undefined;
                    }
                    currentParagraph = [];
                }
                continue;
            }

            // Start of new paragraph
            if (currentParagraph.length === 0) {
                startLine = i;
            }

            currentParagraph.push(line);
        }

        // Handle any remaining content
        if (currentParagraph.length > 0) {
            const paraContent = currentParagraph.join('\n');
            if (paraContent.trim()) {
                const shouldIgnore = ignoreNextParagraph || this.hasAiIgnoreComment(paraContent);
                const shouldNoEnhance = noEnhanceNextParagraph || this.hasNoEnhanceComment(paraContent);
                const inlineStyle = this.extractStyleOverride(paraContent);
                paragraphs.push({
                    content: paraContent,
                    startLine,
                    endLine: lines.length - 1,
                    type: inCodeBlock ? 'code' : this.detectParagraphType(currentParagraph),
                    id: this.generateId(),
                    ignore: shouldIgnore,
                    noEnhance: shouldNoEnhance,
                    styleOverride: styleOverrideNext || inlineStyle
                });
            }
        }

        return paragraphs;
    }

    /**
     * Detect the type of paragraph based on its content
     */
    private detectParagraphType(lines: string[]): ParagraphType {
        if (lines.length === 0) {
            return 'empty';
        }

        const firstLine = lines[0].trim();
        const fullContent = lines.join('\n').trim();

        // MDX imports/exports (should be ignored)
        if (this.isMdxSyntax(fullContent)) {
            return 'mdx';
        }

        // Heading
        if (firstLine.startsWith('#')) {
            return 'heading';
        }

        // List (ordered or unordered)
        if (/^[\-\*\+]\s/.test(firstLine) || /^\d+\.\s/.test(firstLine)) {
            return 'list';
        }

        // Blockquote
        if (firstLine.startsWith('>')) {
            return 'quote';
        }

        // Code block (shouldn't reach here normally)
        if (firstLine.startsWith('```') || firstLine.startsWith('~~~')) {
            return 'code';
        }

        // HTML-only content (images, divs, etc. without surrounding text)
        if (this.isHtmlOnly(fullContent)) {
            return 'html';
        }

        return 'text';
    }

    /**
     * Check if content is MDX-specific syntax (imports, exports, JSX components)
     */
    private isMdxSyntax(content: string): boolean {
        const trimmed = content.trim();

        // Import statements: import X from 'path' or import 'path'
        if (/^import\s+/.test(trimmed)) {
            return true;
        }

        // Export statements: export const/let/var/function/default
        if (/^export\s+/.test(trimmed)) {
            return true;
        }

        // Standalone JSX component usage (PascalCase component on its own)
        // e.g., <Comments /> or <MyComponent attr="value" />
        // But NOT regular HTML like <div> or <img>
        if (/^<[A-Z][a-zA-Z0-9]*(\s|\/|>)/.test(trimmed)) {
            // Check if it's a self-closing component or component block
            if (/^<[A-Z][a-zA-Z0-9]*[^>]*\/>$/.test(trimmed) ||
                /^<[A-Z][a-zA-Z0-9]*[^>]*>.*<\/[A-Z][a-zA-Z0-9]*>$/s.test(trimmed)) {
                return true;
            }
        }

        // JSX expression blocks: {expression} (but not our directives)
        if (/^\{[^}]+\}$/.test(trimmed)) {
            // Don't treat our own directives as MDX to ignore
            if (!/\{\/\*\s*(ai-ignore|no-enhance|ai-style:)/i.test(trimmed)) {
                return true;
            }
        }

        // Standalone JSX comments (that aren't our directives)
        if (/^\{\/\*[\s\S]*\*\/\}$/.test(trimmed)) {
            // Don't treat our own directives as MDX to ignore
            if (!/\{\/\*\s*(ai-ignore|no-enhance|ai-style:)/i.test(trimmed)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if content is primarily HTML (not mixed with regular text)
     */
    private isHtmlOnly(content: string): boolean {
        // Remove HTML tags and see what's left
        const withoutTags = content.replace(/<[^>]+>/g, '').trim();

        // If removing HTML tags leaves nothing or just whitespace, it's HTML-only
        if (withoutTags.length === 0) {
            return true;
        }

        // Check if the content starts with an HTML tag
        const startsWithHtml = /^\s*<[a-zA-Z]/.test(content);

        // If it starts with HTML and the non-HTML content is minimal (like just attributes leaked)
        // Consider it HTML-only if the remaining text is less than 10% of original
        if (startsWithHtml && withoutTags.length < content.length * 0.1) {
            return true;
        }

        return false;
    }

    /**
     * Build context string from previous paragraphs
     */
    public buildContext(paragraphs: Paragraph[], currentIndex: number, windowSize: number): string {
        if (currentIndex <= 0 || windowSize <= 0) {
            return '';
        }

        const startIndex = Math.max(0, currentIndex - windowSize);
        const contextParagraphs = paragraphs.slice(startIndex, currentIndex);

        return contextParagraphs
            .map(p => p.content)
            .join('\n\n');
    }

    /**
     * Find changed paragraphs between two versions of content
     */
    public findChangedParagraphs(
        oldParagraphs: Paragraph[],
        newParagraphs: Paragraph[]
    ): { added: Paragraph[]; modified: Paragraph[]; removed: Paragraph[] } {
        const result = {
            added: [] as Paragraph[],
            modified: [] as Paragraph[],
            removed: [] as Paragraph[]
        };

        // Simple comparison based on content and position
        const oldContents = new Map<string, Paragraph>();
        for (const p of oldParagraphs) {
            oldContents.set(`${p.startLine}:${p.content}`, p);
        }

        const newContents = new Map<string, Paragraph>();
        for (const p of newParagraphs) {
            newContents.set(`${p.startLine}:${p.content}`, p);
        }

        // Find added and modified
        for (const p of newParagraphs) {
            const key = `${p.startLine}:${p.content}`;
            if (!oldContents.has(key)) {
                // Check if there was a paragraph at a similar position
                const oldAtPosition = oldParagraphs.find(
                    old => Math.abs(old.startLine - p.startLine) <= 2
                );

                if (oldAtPosition && oldAtPosition.content !== p.content) {
                    result.modified.push(p);
                } else {
                    result.added.push(p);
                }
            }
        }

        // Find removed
        for (const p of oldParagraphs) {
            const key = `${p.startLine}:${p.content}`;
            if (!newContents.has(key)) {
                const stillExists = newParagraphs.some(
                    np => Math.abs(np.startLine - p.startLine) <= 2
                );
                if (!stillExists) {
                    result.removed.push(p);
                }
            }
        }

        return result;
    }

    /**
     * Get the document title from paragraphs
     */
    public getDocumentTitle(paragraphs: Paragraph[]): string {
        const headingParagraph = paragraphs.find(p => p.type === 'heading');
        if (headingParagraph) {
            return headingParagraph.content.replace(/^#+\s*/, '').trim();
        }
        return 'Untitled Document';
    }
}
