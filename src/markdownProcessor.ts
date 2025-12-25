import { Paragraph, ParagraphType, EnhancementMode } from './types';

/**
 * Processes markdown content into paragraphs for enhancement
 */
export class MarkdownProcessor {
    private idCounter: number = 0;

    // Pattern to detect ai-ignore comments
    private static readonly AI_IGNORE_PATTERN = /<!--\s*ai-ignore\s*-->/i;

    // Pattern to detect no-enhance comments (user kept/approved)
    private static readonly NO_ENHANCE_PATTERN = /<!--\s*no-enhance\s*-->/i;

    // Pattern to detect style override: <!-- ai-style: expand|clarify|professional|casual|technical|list-expand -->
    private static readonly STYLE_PATTERN = /<!--\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*-->/i;

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
            return match[1].toLowerCase() as EnhancementMode;
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

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Check for ai-ignore comment (standalone) - also acts as paragraph boundary
            if (trimmedLine.match(/^<!--\s*ai-ignore\s*-->$/i)) {
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

            // Check for no-enhance comment (standalone) - user kept/approved, also acts as paragraph boundary
            if (trimmedLine.match(/^<!--\s*no-enhance\s*-->$/i)) {
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

            // Check for style override comment (standalone)
            const standaloneStyleMatch = trimmedLine.match(/^<!--\s*ai-style:\s*(expand|clarify|professional|casual|technical|list-expand)\s*-->$/i);
            if (standaloneStyleMatch) {
                styleOverrideNext = standaloneStyleMatch[1].toLowerCase() as EnhancementMode;
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

        return 'text';
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
