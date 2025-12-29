import * as vscode from 'vscode';
import { EnhancementPanel } from './enhancementPanel';
import { MarkdownProcessor } from './markdownProcessor';
import { ContextManager } from './contextManager';
import { AIService } from './aiService';
import {
    EnhancedParagraph,
    EnhancementStatus,
    EnhancementMode,
    Paragraph,
    getSettings,
    isSupportedDocument
} from './types';

let outputChannel: vscode.OutputChannel;
let markdownProcessor: MarkdownProcessor;
let contextManager: ContextManager;
let aiService: AIService;

// Debounce timer
let debounceTimer: NodeJS.Timeout | undefined;

// Cache for enhanced paragraphs - keyed by content hash
const enhancedCache: Map<string, { enhanced: string; suggestions?: import('./types').Suggestion[] }> = new Map();

// Cache for applied styles (persists across refreshes) - keyed by content hash
const appliedStyleCache: Map<string, EnhancementMode> = new Map();

// Cache for kept paragraphs (user has approved) - keyed by content hash
const keptParagraphsCache: Map<string, boolean> = new Map();

/**
 * Simple hash function for content-based caching
 * Uses a fast, non-cryptographic hash that's good enough for cache keys
 */
function hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        const char = content.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // Include content length to reduce collisions
    return `h${hash.toString(16)}_${content.length}`;
}

// Current paragraphs being tracked
let currentParagraphs: Paragraph[] = [];

// Current enhanced paragraphs (for re-enhancement)
let currentEnhancedParagraphs: EnhancedParagraph[] = [];

// Track the current document URI we're enhancing (so we can find it even when panel has focus)
let currentDocumentUri: vscode.Uri | undefined;

// Cancellation token source for ongoing enhancements
let currentCancellationSource: vscode.CancellationTokenSource | undefined;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('MarkTwo');
    log('Extension activating...');

    // Initialize services
    markdownProcessor = new MarkdownProcessor();
    contextManager = new ContextManager();
    aiService = new AIService(outputChannel);

    // Register commands
    const showPanelCommand = vscode.commands.registerCommand(
        'marktwo.showPanel',
        () => showEnhancementPanel(context)
    );

    const hidePanelCommand = vscode.commands.registerCommand(
        'marktwo.hidePanel',
        () => hideEnhancementPanel()
    );

    const refreshPanelCommand = vscode.commands.registerCommand(
        'marktwo.refreshPanel',
        () => refreshEnhancement(context)
    );

    const reenhanceParagraphCommand = vscode.commands.registerCommand(
        'marktwo.reenhanceParagraph',
        (paragraphId: string, mode: string) => reenhanceParagraph(paragraphId, mode as EnhancementMode, context)
    );

    const keepParagraphCommand = vscode.commands.registerCommand(
        'marktwo.keepParagraph',
        (paragraphId: string) => keepParagraph(paragraphId)
    );

    const applySuggestionCommand = vscode.commands.registerCommand(
        'marktwo.applySuggestion',
        (paragraphId: string, suggestionIndex: number, exampleIndex: number) => applySuggestion(paragraphId, suggestionIndex, exampleIndex)
    );

    const improveSelectionCommand = vscode.commands.registerCommand(
        'marktwo.improveSelection',
        (paragraphId: string, selectedText: string, instruction: string) => improveSelection(paragraphId, selectedText, instruction)
    );

    context.subscriptions.push(showPanelCommand, hidePanelCommand, refreshPanelCommand, reenhanceParagraphCommand, keepParagraphCommand, applySuggestionCommand, improveSelectionCommand);

    // Listen for active editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isSupportedDocument(editor.document)) {
                onActiveEditorChanged(editor, context);
            }
        })
    );

    // Listen for document changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (isSupportedDocument(event.document)) {
                onDocumentChanged(event, context);
            }
        })
    );

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('markdown-ai-enhancer')) {
                onConfigurationChanged(context);
            }
        })
    );

    // Listen for document save - refresh panel on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(document => {
            if (isSupportedDocument(document) && EnhancementPanel.currentPanel?.isVisible) {
                log('Document saved, refreshing enhancement panel...');
                processDocument(document, context, true);
            }
        })
    );

    // Check if a supported file is already open
    if (vscode.window.activeTextEditor && isSupportedDocument(vscode.window.activeTextEditor.document)) {
        log('Supported markdown file already open');
    }

    log('Extension activated');
}

/**
 * Show the enhancement panel
 */
async function showEnhancementPanel(context: vscode.ExtensionContext): Promise<void> {
    // Validate that language models are available
    const validation = await aiService.validateProvider();
    if (!validation.valid) {
        const action = await vscode.window.showErrorMessage(
            validation.message || 'No language models available',
            'Open Settings'
        );

        if (action === 'Open Settings') {
            vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'markdown-ai-enhancer'
            );
        }
        return;
    }

    const panel = EnhancementPanel.createOrShow(context.extensionUri);

    // Process current document if available
    const editor = vscode.window.activeTextEditor;
    if (editor && isSupportedDocument(editor.document)) {
        await processDocument(editor.document, context);
    }
}

/**
 * Hide the enhancement panel
 */
function hideEnhancementPanel(): void {
    if (EnhancementPanel.currentPanel) {
        EnhancementPanel.currentPanel.dispose();
    }
}

/**
 * Refresh enhancement for current document
 */
async function refreshEnhancement(context: vscode.ExtensionContext): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isSupportedDocument(editor.document)) {
        vscode.window.showWarningMessage('Please open a markdown or MDX file first.');
        return;
    }

    // Clear cache for this document
    enhancedCache.clear();

    // Reprocess document
    await processDocument(editor.document, context, true);
}

/**
 * Handle active editor change
 */
function onActiveEditorChanged(
    editor: vscode.TextEditor,
    context: vscode.ExtensionContext
): void {
    log(`Active editor changed to: ${editor.document.fileName}`);

    // Update context for new document
    contextManager.updateDocumentContext(editor.document);

    // Process if panel is visible
    if (EnhancementPanel.currentPanel?.isVisible) {
        processDocument(editor.document, context);
    }
}

/**
 * Handle document changes with debouncing
 */
function onDocumentChanged(
    event: vscode.TextDocumentChangeEvent,
    context: vscode.ExtensionContext
): void {
    const settings = getSettings();

    if (!settings.autoEnhance) {
        return;
    }

    if (!EnhancementPanel.currentPanel?.isVisible) {
        return;
    }

    // Clear existing timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    // Set new timer
    debounceTimer = setTimeout(() => {
        processDocument(event.document, context);
    }, settings.debounceDelay);
}

/**
 * Handle configuration changes
 */
function onConfigurationChanged(context: vscode.ExtensionContext): void {
    log('Configuration changed');

    // Clear cache when settings change
    enhancedCache.clear();

    // Refresh if panel is visible
    if (EnhancementPanel.currentPanel?.isVisible) {
        const editor = vscode.window.activeTextEditor;
        if (editor && isSupportedDocument(editor.document)) {
            processDocument(editor.document, context);
        }
    }
}

/**
 * Process a markdown document
 */
async function processDocument(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext,
    forceRefresh: boolean = false
): Promise<void> {
    if (!EnhancementPanel.currentPanel) {
        return;
    }

    const panel = EnhancementPanel.currentPanel;
    const settings = getSettings();

    // Track the document we're working with (so we can find it even when panel has focus)
    currentDocumentUri = document.uri;

    try {
        // Cancel any ongoing enhancement
        if (currentCancellationSource) {
            currentCancellationSource.cancel();
        }
        currentCancellationSource = new vscode.CancellationTokenSource();
        const token = currentCancellationSource.token;

        // Extract paragraphs
        const content = document.getText();
        const newParagraphs = markdownProcessor.extractParagraphs(content);

        // Find what changed
        const changes = markdownProcessor.findChangedParagraphs(currentParagraphs, newParagraphs);
        currentParagraphs = newParagraphs;

        // Get document context
        const docContext = contextManager.getDocumentContext(document);

        // Build enhanced paragraphs list
        const enhancedParagraphs: EnhancedParagraph[] = newParagraphs.map((para, index) => {
            // Use content hash for stable caching (independent of line position)
            const contentHash = hashContent(para.content.trim());

            // Check for persisted style and kept status
            const persistedStyle = appliedStyleCache.get(contentHash);
            const isKept = keptParagraphsCache.get(contentHash) || false;

            // If paragraph is kept, don't re-process it
            if (isKept) {
                return {
                    original: para,
                    enhanced: para.content,
                    status: EnhancementStatus.Complete,
                    appliedStyle: persistedStyle,
                    kept: true
                };
            }

            // Check cache for previously enhanced content (unless force refresh)
            if (!forceRefresh && enhancedCache.has(contentHash)) {
                const cached = enhancedCache.get(contentHash)!;
                log(`Cache hit for paragraph: "${para.content.substring(0, 30)}..."`);
                return {
                    original: para,
                    enhanced: cached.enhanced,
                    status: EnhancementStatus.Complete,
                    appliedStyle: persistedStyle,
                    suggestions: cached.suggestions
                };
            }

            // Check if this paragraph needs processing
            const needsProcessing =
                forceRefresh ||
                changes.added.includes(para) ||
                changes.modified.some(m => m.startLine === para.startLine) ||
                !enhancedCache.has(contentHash); // Also process if never enhanced

            if (needsProcessing) {
                return {
                    original: para,
                    enhanced: para.content, // Start with original
                    status: EnhancementStatus.Pending,
                    appliedStyle: persistedStyle
                };
            }

            // Return original if no processing needed
            return {
                original: para,
                enhanced: para.content,
                status: EnhancementStatus.Complete,
                appliedStyle: persistedStyle
            };
        });

        // Update panel with initial state and store globally
        currentEnhancedParagraphs = enhancedParagraphs;
        panel.update(enhancedParagraphs);

        // Process pending paragraphs
        const pendingParagraphs = enhancedParagraphs.filter(
            p => p.status === EnhancementStatus.Pending
        );

        if (pendingParagraphs.length === 0) {
            return;
        }

        panel.showStatus(`Enhancing ${pendingParagraphs.length} paragraph(s)...`);

        // Enhance each pending paragraph
        for (let i = 0; i < enhancedParagraphs.length; i++) {
            if (token.isCancellationRequested) {
                log('Enhancement cancelled');
                break;
            }

            const enhanced = enhancedParagraphs[i];
            if (enhanced.status !== EnhancementStatus.Pending) {
                continue;
            }

            // Mark as processing
            enhanced.status = EnhancementStatus.Processing;
            panel.update(enhancedParagraphs);

            try {
                // Build context
                const contextStr = contextManager.buildContextForParagraph(
                    newParagraphs,
                    i,
                    settings
                );

                // Skip enhancement for code blocks and ignored paragraphs
                // (headings are now enhanced for spelling/grammar)
                if (enhanced.original.type === 'code' || enhanced.original.type === 'mdx' || enhanced.original.ignore || enhanced.original.noEnhance) {
                    enhanced.status = EnhancementStatus.Complete;
                    continue;
                }

                // Use paragraph's style override if set, otherwise use global setting
                const effectiveMode = enhanced.original.styleOverride || settings.enhancementMode as EnhancementMode;

                // Enhance the paragraph (with suggestions if enabled)
                const response = await aiService.enhance(
                    {
                        paragraph: enhanced.original.content,
                        context: contextStr,
                        mode: effectiveMode,
                        documentTitle: docContext.title,
                        authorStyleSample: settings.authorStyleSample || undefined,
                        audience: settings.audience || undefined,
                        paragraphType: enhanced.original.type
                    },
                    enhanced.original.id,
                    token,
                    settings.showConsiderPanel // Include suggestions in same call if enabled
                );

                enhanced.enhanced = response.enhanced;
                enhanced.status = EnhancementStatus.Complete;
                enhanced.appliedStyle = effectiveMode;

                // Attach suggestions if returned
                if (response.suggestions && response.suggestions.length > 0) {
                    enhanced.suggestions = response.suggestions;
                }

                // Cache the result using content hash (stable across line changes)
                const contentHash = hashContent(enhanced.original.content.trim());
                enhancedCache.set(contentHash, {
                    enhanced: response.enhanced,
                    suggestions: response.suggestions
                });

                // Persist the applied style
                appliedStyleCache.set(contentHash, effectiveMode);

                log(`Cached enhancement for: "${enhanced.original.content.substring(0, 30)}..." (hash: ${contentHash})`);

            } catch (error) {
                enhanced.status = EnhancementStatus.Error;
                enhanced.error = error instanceof Error ? error.message : 'Unknown error';
                log(`Error enhancing paragraph: ${enhanced.error}`);
            }

            // Update panel after each paragraph
            panel.update(enhancedParagraphs);
        }

        panel.showStatus('Enhancement complete');

        // Clear status after a delay
        setTimeout(() => {
            if (EnhancementPanel.currentPanel) {
                EnhancementPanel.currentPanel.showStatus('');
            }
        }, 2000);

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log(`Error processing document: ${message}`);
        panel.showStatus(`Error: ${message}`, true);
    }
}

/**
 * Get the editor for the current tracked document (works even when panel has focus)
 */
function getTrackedEditor(): vscode.TextEditor | undefined {
    if (!currentDocumentUri) {
        return undefined;
    }

    // First check if active editor matches
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.uri.toString() === currentDocumentUri.toString()) {
        return activeEditor;
    }

    // Otherwise search all visible editors
    for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document.uri.toString() === currentDocumentUri.toString()) {
            return editor;
        }
    }

    return undefined;
}

/**
 * Mark a paragraph as "kept" - writes enhanced text back to source with no-enhance comment
 */
async function keepParagraph(paragraphId: string): Promise<void> {
    const index = currentEnhancedParagraphs.findIndex(p => p.original.id === paragraphId);
    if (index === -1) {
        log(`Paragraph not found for keep: ${paragraphId}`);
        return;
    }

    const para = currentEnhancedParagraphs[index];
    const editor = getTrackedEditor();

    if (!editor) {
        log('No tracked markdown editor for keep');
        return;
    }

    try {
        // Build the replacement text: add no-enhance comment before each paragraph
        const enhancedText = para.enhanced || para.original.content;

        // Determine comment style based on file extension (MDX uses JSX comments)
        const fileName = editor.document.fileName.toLowerCase();
        const isMdxFile = fileName.endsWith('.mdx');
        const noEnhanceComment = isMdxFile ? '{/* no-enhance */}' : '<!-- no-enhance -->';

        // Split by double newlines to find paragraph boundaries
        const paragraphs = enhancedText.split(/\n\n+/);

        // Add no-enhance comment before each paragraph (comment acts as separator, no blank line needed)
        const replacementText = paragraphs
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => `${noEnhanceComment}\n${p}`)
            .join('\n');

        // Calculate the range to replace in the source document
        const startLine = para.original.startLine;
        const endLine = para.original.endLine;
        const range = new vscode.Range(
            new vscode.Position(startLine, 0),
            new vscode.Position(endLine, editor.document.lineAt(endLine).text.length)
        );

        // Apply the edit
        await editor.edit(editBuilder => {
            editBuilder.replace(range, replacementText);
        });

        // Mark as kept in memory
        para.kept = true;
        para.suggestions = [];

        // Persist to cache using content hash
        const contentHash = hashContent(para.original.content.trim());
        keptParagraphsCache.set(contentHash, true);

        // Update panel
        if (EnhancementPanel.currentPanel) {
            EnhancementPanel.currentPanel.update(currentEnhancedParagraphs);
        }

        log(`Paragraph kept and written to source: ${paragraphId}`);
    } catch (error) {
        log(`Error keeping paragraph: ${error}`);
        vscode.window.showErrorMessage('Failed to write kept paragraph to source');
    }
}

/**
 * Apply a suggestion by merging example text into the enhanced paragraph
 */
async function applySuggestion(paragraphId: string, suggestionIndex: number, exampleIndex: number): Promise<void> {
    const paraIndex = currentEnhancedParagraphs.findIndex(p => p.original.id === paragraphId);
    if (paraIndex === -1) {
        log(`Paragraph not found for apply suggestion: ${paragraphId}`);
        return;
    }

    const para = currentEnhancedParagraphs[paraIndex];
    const suggestion = para.suggestions?.[suggestionIndex];

    if (!suggestion || !suggestion.examples || suggestion.examples.length === 0) {
        log('No examples to apply');
        return;
    }

    const exampleText = suggestion.examples[exampleIndex];
    if (!exampleText) {
        log(`Example index ${exampleIndex} not found`);
        return;
    }

    if (!EnhancementPanel.currentPanel) {
        return;
    }

    const panel = EnhancementPanel.currentPanel;

    try {
        // Show processing state
        para.status = EnhancementStatus.Processing;
        panel.update(currentEnhancedParagraphs);
        panel.showStatus('Merging suggestion into text...');

        // Use AI to seamlessly merge the example into the enhanced text
        const suggestionContext = `${suggestion.title}: ${suggestion.description}`;
        const mergedText = await aiService.mergeExample(
            para.enhanced || para.original.content,
            exampleText,
            suggestionContext
        );

        // Update the enhanced text
        para.enhanced = mergedText;
        para.status = EnhancementStatus.Complete;

        // Remove this specific example from the suggestion (it's been applied)
        if (suggestion.examples.length === 1) {
            // Remove the whole suggestion if this was the only example
            para.suggestions?.splice(suggestionIndex, 1);
        } else {
            // Just remove this example
            suggestion.examples.splice(exampleIndex, 1);
        }

        // Update panel
        panel.update(currentEnhancedParagraphs);
        panel.showStatus('Suggestion applied');

        setTimeout(() => {
            if (EnhancementPanel.currentPanel) {
                EnhancementPanel.currentPanel.showStatus('');
            }
        }, 2000);

        log(`Suggestion merged into paragraph: ${paragraphId}`);
    } catch (error) {
        para.status = EnhancementStatus.Complete; // Restore state
        panel.update(currentEnhancedParagraphs);
        log(`Error applying suggestion: ${error}`);
        panel.showStatus('Failed to merge suggestion', true);
    }
}

/**
 * Improve a selected portion of text based on user instruction
 */
async function improveSelection(paragraphId: string, selectedText: string, instruction: string): Promise<void> {
    const paraIndex = currentEnhancedParagraphs.findIndex(p => p.original.id === paragraphId);
    if (paraIndex === -1) {
        log(`Paragraph not found for improve selection: ${paragraphId}`);
        return;
    }

    const para = currentEnhancedParagraphs[paraIndex];

    if (!EnhancementPanel.currentPanel) {
        return;
    }

    const panel = EnhancementPanel.currentPanel;

    try {
        // Show processing state
        para.status = EnhancementStatus.Processing;
        panel.update(currentEnhancedParagraphs);
        panel.showStatus('Improving selected text...');

        // Use AI to improve the selection
        const currentText = para.enhanced || para.original.content;
        const improvedText = await aiService.improveSelection(
            currentText,
            selectedText,
            instruction
        );

        // Update the enhanced text
        para.enhanced = improvedText;
        para.status = EnhancementStatus.Complete;

        // Update panel
        panel.update(currentEnhancedParagraphs);
        panel.showStatus('Selection improved');

        setTimeout(() => {
            if (EnhancementPanel.currentPanel) {
                EnhancementPanel.currentPanel.showStatus('');
            }
        }, 2000);

        log(`Selection improved in paragraph: ${paragraphId}`);
    } catch (error) {
        para.status = EnhancementStatus.Complete; // Restore state
        panel.update(currentEnhancedParagraphs);
        log(`Error improving selection: ${error}`);
        panel.showStatus('Failed to improve selection', true);
    }
}

/**
 * Re-enhance a specific paragraph with a different mode
 */
async function reenhanceParagraph(
    paragraphId: string,
    mode: EnhancementMode,
    context: vscode.ExtensionContext
): Promise<void> {
    if (!EnhancementPanel.currentPanel) {
        return;
    }

    const panel = EnhancementPanel.currentPanel;
    const settings = getSettings();

    // Find the paragraph to re-enhance
    const index = currentEnhancedParagraphs.findIndex(p => p.original.id === paragraphId);
    if (index === -1) {
        log(`Paragraph not found: ${paragraphId}`);
        return;
    }

    const enhanced = currentEnhancedParagraphs[index];

    // Skip if it's ignored
    if (enhanced.original.ignore || enhanced.original.noEnhance) {
        return;
    }

    try {
        // Mark as processing
        enhanced.status = EnhancementStatus.Processing;
        panel.update(currentEnhancedParagraphs);
        panel.showStatus(`Re-enhancing paragraph with "${mode}" style...`);

        // Get document context
        const editor = getTrackedEditor();
        const docContext = editor
            ? contextManager.getDocumentContext(editor.document)
            : { title: 'Untitled', previousParagraphs: [] };

        // Build context
        const contextStr = contextManager.buildContextForParagraph(
            currentParagraphs,
            index,
            settings
        );

        // Re-enhance with the new mode
        const response = await aiService.enhance(
            {
                paragraph: enhanced.original.content,
                context: contextStr,
                mode: mode,
                documentTitle: docContext.title,
                authorStyleSample: settings.authorStyleSample || undefined,
                audience: settings.audience || undefined,
                paragraphType: enhanced.original.type
            },
            enhanced.original.id
        );

        enhanced.enhanced = response.enhanced;
        enhanced.status = EnhancementStatus.Complete;
        enhanced.appliedStyle = mode;

        // Update cache using content hash
        const contentHash = hashContent(enhanced.original.content.trim());
        enhancedCache.set(contentHash, {
            enhanced: response.enhanced,
            suggestions: response.suggestions
        });

        // Persist the applied style
        appliedStyleCache.set(contentHash, mode);

        panel.update(currentEnhancedParagraphs);
        panel.showStatus('Re-enhancement complete');

        setTimeout(() => {
            if (EnhancementPanel.currentPanel) {
                EnhancementPanel.currentPanel.showStatus('');
            }
        }, 2000);

    } catch (error) {
        enhanced.status = EnhancementStatus.Error;
        enhanced.error = error instanceof Error ? error.message : 'Unknown error';
        panel.update(currentEnhancedParagraphs);
        panel.showStatus(`Error: ${enhanced.error}`, true);
    }
}

function log(message: string): void {
    outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function deactivate(): void {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    if (currentCancellationSource) {
        currentCancellationSource.cancel();
    }
    outputChannel.dispose();
}
