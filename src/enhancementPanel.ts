import * as vscode from 'vscode';
import { EnhancedParagraph, WebViewMessage } from './types';

/**
 * Manages the WebView panel for displaying enhanced content
 */
export class EnhancementPanel {
    public static currentPanel: EnhancementPanel | undefined;
    private static readonly viewType = 'markdownAiEnhancer';

    private readonly panel: vscode.WebviewPanel;
    private readonly extensionUri: vscode.Uri;
    private disposables: vscode.Disposable[] = [];
    private currentContent: EnhancedParagraph[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this.panel = panel;
        this.extensionUri = extensionUri;

        // Set initial HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Handle panel disposal
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            null,
            this.disposables
        );
    }

    /**
     * Create or show the enhancement panel
     */
    public static createOrShow(extensionUri: vscode.Uri): EnhancementPanel {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it
        if (EnhancementPanel.currentPanel) {
            EnhancementPanel.currentPanel.panel.reveal(column);
            return EnhancementPanel.currentPanel;
        }

        // Create a new panel
        const panel = vscode.window.createWebviewPanel(
            EnhancementPanel.viewType,
            'AI Enhanced Preview',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media')
                ]
            }
        );

        EnhancementPanel.currentPanel = new EnhancementPanel(panel, extensionUri);
        return EnhancementPanel.currentPanel;
    }

    /**
     * Update the panel with enhanced content
     */
    public update(paragraphs: EnhancedParagraph[]): void {
        this.currentContent = paragraphs;
        this.postMessage({
            type: 'update',
            content: paragraphs
        });
    }

    /**
     * Show status message in the panel
     */
    public showStatus(message: string, isError: boolean = false): void {
        this.postMessage({
            type: 'status',
            message,
            isError
        });
    }

    /**
     * Post message to webview
     */
    private postMessage(message: WebViewMessage): void {
        this.panel.webview.postMessage(message);
    }

    /**
     * Handle messages from webview
     */
    private handleMessage(message: { type: string; paragraphId?: string; mode?: string; suggestionIndex?: number; exampleIndex?: number; selectedText?: string; instruction?: string }): void {
        switch (message.type) {
            case 'refresh':
                // Trigger refresh - emit event for extension to handle
                vscode.commands.executeCommand('markdown-ai-enhancer.refreshPanel');
                break;
            case 'reenhance':
                // Re-enhance a specific paragraph with a new mode
                if (message.paragraphId && message.mode) {
                    vscode.commands.executeCommand(
                        'markdown-ai-enhancer.reenhanceParagraph',
                        message.paragraphId,
                        message.mode
                    );
                }
                break;
            case 'keep':
                // Mark paragraph as kept (user approved)
                if (message.paragraphId) {
                    vscode.commands.executeCommand(
                        'markdown-ai-enhancer.keepParagraph',
                        message.paragraphId
                    );
                }
                break;
            case 'apply':
                // Apply a suggestion example to the enhanced text
                if (message.paragraphId !== undefined && message.suggestionIndex !== undefined && message.exampleIndex !== undefined) {
                    vscode.commands.executeCommand(
                        'markdown-ai-enhancer.applySuggestion',
                        message.paragraphId,
                        message.suggestionIndex,
                        message.exampleIndex
                    );
                }
                break;
            case 'improveSelection':
                // Improve a selected portion of text based on user instruction
                if (message.paragraphId && message.selectedText && message.instruction) {
                    vscode.commands.executeCommand(
                        'markdown-ai-enhancer.improveSelection',
                        message.paragraphId,
                        message.selectedText,
                        message.instruction
                    );
                }
                break;
        }
    }

    /**
     * Get the HTML content for the webview
     */
    private getWebviewContent(): string {
        const styleUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css')
        );
        const scriptUri = this.panel.webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'script.js')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>AI Enhanced Preview</title>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>AI Enhanced Preview</h1>
            <div class="controls">
                <button id="copyBtn" class="btn" title="Copy all enhanced text">
                    <span class="icon">&#x2398;</span> Copy All
                </button>
                <button id="refreshBtn" class="btn" title="Refresh all paragraphs">
                    <span class="icon">&#x21bb;</span> Refresh
                </button>
            </div>
        </header>
        <div id="status" class="status hidden"></div>
        <main id="content" class="content">
            <div class="placeholder">
                <p>Start typing in your markdown document to see AI-enhanced content here.</p>
            </div>
        </main>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    /**
     * Generate a nonce for CSP
     */
    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Check if panel is visible
     */
    public get isVisible(): boolean {
        return this.panel.visible;
    }

    /**
     * Dispose of the panel
     */
    public dispose(): void {
        EnhancementPanel.currentPanel = undefined;

        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
