import * as vscode from 'vscode';

/**
 * Represents a paragraph extracted from markdown content
 */
export interface Paragraph {
    content: string;
    startLine: number;
    endLine: number;
    type: ParagraphType;
    id: string; // Unique identifier for tracking
    ignore: boolean; // Whether to skip AI enhancement (<!-- ai-ignore -->)
    noEnhance: boolean; // User kept/approved this paragraph (<!-- no-enhance -->)
    styleOverride?: EnhancementMode; // Override the default enhancement mode
}

export type ParagraphType = 'text' | 'heading' | 'list' | 'code' | 'quote' | 'empty' | 'html' | 'frontmatter' | 'mdx';

/**
 * AI Provider options
 */
export enum AIProvider {
    VSCodeLM = 'vscode-lm'
}

/**
 * Enhancement modes available
 */
export enum EnhancementMode {
    Expand = 'expand',
    Clarify = 'clarify',
    Professional = 'professional',
    Casual = 'casual',
    Technical = 'technical',
    ListExpand = 'list-expand'
}

/**
 * Request to enhance a paragraph
 */
export interface EnhancementRequest {
    paragraph: string;
    context: string;
    mode: EnhancementMode;
    documentTitle?: string;
    authorStyleSample?: string;
    audience?: string;
    paragraphType?: string;
}

/**
 * Response from AI enhancement
 */
export interface EnhancementResponse {
    original: string;
    enhanced: string;
    paragraphId: string;
    suggestions?: Suggestion[];
    metadata?: {
        tokensUsed?: number;
        processingTime: number;
        provider: AIProvider;
    };
}

/**
 * Document context for AI processing
 */
export interface DocumentContext {
    title: string;
    topic?: string;
    previousParagraphs: string[];
}

/**
 * Extension configuration settings
 */
export interface EnhancementSettings {
    enhancementMode: EnhancementMode;
    contextWindowSize: number;
    debounceDelay: number;
    autoEnhance: boolean;
    preferredModelFamily: string;
    authorStyleSample: string;
    audience: string;
    showConsiderPanel: boolean;
    fileExtensions: string[];
}

/**
 * Status of paragraph enhancement
 */
export enum EnhancementStatus {
    Pending = 'pending',
    Processing = 'processing',
    Complete = 'complete',
    Error = 'error'
}

/**
 * Enhanced paragraph with status
 */
export interface EnhancedParagraph {
    original: Paragraph;
    enhanced: string;
    status: EnhancementStatus;
    error?: string;
    appliedStyle?: EnhancementMode; // Track which style was applied
    kept?: boolean; // User has approved this paragraph - don't re-enhance
    suggestions?: Suggestion[]; // Inline suggestions for this paragraph
}

/**
 * Message types for WebView communication
 */
export type WebViewMessage =
    | { type: 'update'; content: EnhancedParagraph[] }
    | { type: 'status'; message: string; isError?: boolean }
    | { type: 'settings'; settings: Partial<EnhancementSettings> }
    | { type: 'refresh' }
    | { type: 'reenhance'; paragraphId: string; mode: EnhancementMode }
    | { type: 'keep'; paragraphId: string }
    | { type: 'apply'; paragraphId: string; suggestionIndex: number; exampleIndex: number }
    | { type: 'improveSelection'; paragraphId: string; selectedText: string; instruction: string };

/**
 * Helper function to get settings from VSCode configuration
 */
export function getSettings(): EnhancementSettings {
    const config = vscode.workspace.getConfiguration('marktwo');

    return {
        enhancementMode: config.get<string>('enhancementMode', 'expand') as EnhancementMode,
        contextWindowSize: config.get<number>('contextWindowSize', 2),
        debounceDelay: config.get<number>('debounceDelay', 20000),
        autoEnhance: config.get<boolean>('autoEnhance', true),
        preferredModelFamily: config.get<string>('preferredModelFamily', ''),
        authorStyleSample: config.get<string>('authorStyleSample', ''),
        audience: config.get<string>('audience', ''),
        showConsiderPanel: config.get<boolean>('showConsiderPanel', true),
        fileExtensions: config.get<string[]>('fileExtensions', ['md', 'mdx'])
    };
}

/**
 * Check if a document should be processed based on file extension
 */
export function isSupportedDocument(document: vscode.TextDocument): boolean {
    const settings = getSettings();
    const fileName = document.fileName.toLowerCase();

    // Check by file extension
    for (const ext of settings.fileExtensions) {
        if (fileName.endsWith(`.${ext.toLowerCase()}`)) {
            return true;
        }
    }

    // Also support markdown language ID for files without extension
    if (document.languageId === 'markdown' || document.languageId === 'mdx') {
        return true;
    }

    return false;
}

/**
 * Suggestion category for the Consider panel
 */
export type SuggestionCategory = 'improvement' | 'gap' | 'idea';

/**
 * A single suggestion for inline display
 */
export interface Suggestion {
    category: SuggestionCategory;
    title: string;
    description: string;
    examples?: string[]; // Concrete examples showing what this might look like
    paragraphIndex?: number; // Which paragraph this suggestion relates to (0-indexed)
}

/**
 * Response from suggestion generation
 */
export interface SuggestionResponse {
    suggestions: Suggestion[];
    processingTime: number;
}

/**
 * Mode descriptions for prompts
 */
export const MODE_DESCRIPTIONS: Record<EnhancementMode, string> = {
    [EnhancementMode.Expand]: 'more detailed with additional examples and explanations',
    [EnhancementMode.Clarify]: 'clearer and easier to understand with improved structure',
    [EnhancementMode.Professional]: 'more formal and professional in tone',
    [EnhancementMode.Casual]: 'more conversational and friendly',
    [EnhancementMode.Technical]: 'more technically precise with additional depth',
    [EnhancementMode.ListExpand]: 'transformed from bullet points into flowing prose paragraphs'
};
