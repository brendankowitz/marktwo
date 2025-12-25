import * as vscode from 'vscode';
import { DocumentContext, Paragraph, EnhancementSettings, getSettings } from './types';
import { MarkdownProcessor } from './markdownProcessor';

/**
 * Manages document context for AI enhancement
 */
export class ContextManager {
    private documentContexts: Map<string, DocumentContext> = new Map();
    private processor: MarkdownProcessor;

    constructor() {
        this.processor = new MarkdownProcessor();
    }

    /**
     * Get or create context for a document
     */
    public getDocumentContext(document: vscode.TextDocument): DocumentContext {
        const uri = document.uri.toString();

        if (!this.documentContexts.has(uri)) {
            this.updateDocumentContext(document);
        }

        return this.documentContexts.get(uri) || {
            title: 'Untitled Document',
            previousParagraphs: []
        };
    }

    /**
     * Update context for a document
     */
    public updateDocumentContext(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        const content = document.getText();
        const paragraphs = this.processor.extractParagraphs(content);

        const context: DocumentContext = {
            title: this.extractTitle(document, paragraphs),
            topic: this.inferTopic(paragraphs),
            previousParagraphs: []
        };

        this.documentContexts.set(uri, context);
    }

    /**
     * Extract document title
     */
    private extractTitle(document: vscode.TextDocument, paragraphs: Paragraph[]): string {
        // First try to find a heading
        const title = this.processor.getDocumentTitle(paragraphs);
        if (title !== 'Untitled Document') {
            return title;
        }

        // Fall back to filename
        const filename = document.fileName.split(/[/\\]/).pop() || 'document';
        return filename.replace(/\.md$/, '');
    }

    /**
     * Infer document topic from content
     */
    private inferTopic(paragraphs: Paragraph[]): string | undefined {
        // Simple topic inference - just use first few words of first text paragraph
        const textParagraph = paragraphs.find(p => p.type === 'text');
        if (textParagraph) {
            const words = textParagraph.content.split(/\s+/).slice(0, 10);
            return words.join(' ') + '...';
        }
        return undefined;
    }

    /**
     * Build context string for a specific paragraph
     */
    public buildContextForParagraph(
        paragraphs: Paragraph[],
        currentIndex: number,
        settings: EnhancementSettings
    ): string {
        return this.processor.buildContext(
            paragraphs,
            currentIndex,
            settings.contextWindowSize
        );
    }

    /**
     * Get enhancement settings
     */
    public getEnhancementSettings(): EnhancementSettings {
        return getSettings();
    }

    /**
     * Clear context for a document
     */
    public clearDocumentContext(uri: string): void {
        this.documentContexts.delete(uri);
    }

    /**
     * Clear all contexts
     */
    public clearAllContexts(): void {
        this.documentContexts.clear();
    }

    /**
     * Get previous paragraphs for context
     */
    public getPreviousParagraphs(
        paragraphs: Paragraph[],
        currentIndex: number,
        count: number
    ): string[] {
        if (currentIndex <= 0 || count <= 0) {
            return [];
        }

        const startIndex = Math.max(0, currentIndex - count);
        return paragraphs
            .slice(startIndex, currentIndex)
            .map(p => p.content);
    }
}
