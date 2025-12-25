// @ts-check

(function () {
    // @ts-ignore
    const vscode = acquireVsCodeApi();

    const contentElement = document.getElementById('content');
    const statusElement = document.getElementById('status');
    const refreshButton = document.getElementById('refreshBtn');
    const copyButton = document.getElementById('copyBtn');

    // Store current paragraphs for copy functionality
    let currentParagraphs = [];

    // Track current selection improver state
    let activeSelectionImprover = null;

    // Handle refresh button click
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            vscode.postMessage({ type: 'refresh' });
        });
    }

    // Handle copy button click
    if (copyButton) {
        copyButton.addEventListener('click', async () => {
            if (currentParagraphs.length === 0) {
                updateStatus('No content to copy', false);
                return;
            }

            // Build the full enhanced text
            const fullText = currentParagraphs
                .map(p => p.enhanced || p.original?.content || '')
                .join('\n\n');

            try {
                await navigator.clipboard.writeText(fullText);

                // Visual feedback
                const originalText = copyButton.innerHTML;
                copyButton.innerHTML = '<span class="icon">&#x2713;</span> Copied!';
                copyButton.classList.add('success');

                setTimeout(() => {
                    copyButton.innerHTML = originalText;
                    copyButton.classList.remove('success');
                }, 2000);
            } catch (err) {
                updateStatus('Failed to copy to clipboard', true);
            }
        });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
        const message = event.data;

        switch (message.type) {
            case 'update':
                updateContent(message.content);
                break;
            case 'status':
                updateStatus(message.message, message.isError);
                break;
        }
    });

    /**
     * Update the content display
     * @param {Array} paragraphs
     */
    function updateContent(paragraphs) {
        if (!contentElement) return;

        // Store for copy functionality
        currentParagraphs = paragraphs || [];

        if (!paragraphs || paragraphs.length === 0) {
            contentElement.innerHTML = `
                <div class="placeholder">
                    <p>Start typing in your markdown document to see AI-enhanced content here.</p>
                </div>
            `;
            return;
        }

        const html = paragraphs.map((para, index) => {
            const isIgnored = para.original?.ignore; // <!-- ai-ignore -->
            const isNoEnhance = para.original?.noEnhance; // <!-- no-enhance --> (user kept)
            const isCode = para.original?.type === 'code';
            const isKept = para.kept || isNoEnhance || false;
            const canEnhance = !isIgnored && !isNoEnhance && !isCode;
            const statusClass = isKept ? 'kept' : (isIgnored ? 'ignored' : (para.status || 'pending'));
            const typeLabel = getTypeLabel(para.original?.type || 'text');
            const statusIndicator = getStatusIndicator(para.status, para);
            const content = escapeHtml(para.enhanced || para.original?.content || '');
            const errorHtml = para.error
                ? `<div class="paragraph-error">${escapeHtml(para.error)}</div>`
                : '';
            const paragraphId = para.original?.id || '';
            const currentStyle = para.appliedStyle || para.original?.styleOverride || '';

            // Style dropdown (hidden if kept)
            const styleDropdown = canEnhance && !isKept ? `
                <select class="style-dropdown" data-paragraph-id="${paragraphId}" title="Change enhancement style">
                    <option value="" ${!currentStyle ? 'selected' : ''}>Style...</option>
                    <option value="expand" ${currentStyle === 'expand' ? 'selected' : ''}>Expand</option>
                    <option value="clarify" ${currentStyle === 'clarify' ? 'selected' : ''}>Clarify</option>
                    <option value="professional" ${currentStyle === 'professional' ? 'selected' : ''}>Professional</option>
                    <option value="casual" ${currentStyle === 'casual' ? 'selected' : ''}>Casual</option>
                    <option value="technical" ${currentStyle === 'technical' ? 'selected' : ''}>Technical</option>
                    <option value="list-expand" ${currentStyle === 'list-expand' ? 'selected' : ''}>List → Prose</option>
                </select>
            ` : '';

            // Keep button (shown when complete and not already kept)
            const keepButton = canEnhance && para.status === 'complete' && !isKept ? `
                <button class="keep-btn" data-paragraph-id="${paragraphId}" title="Keep this version">
                    ✓ Keep
                </button>
            ` : '';

            // Inline suggestions (hidden if kept)
            const suggestionsHtml = !isKept && para.suggestions && para.suggestions.length > 0
                ? renderInlineSuggestions(para.suggestions, paragraphId)
                : '';

            return `
                <div class="paragraph ${statusClass}" data-index="${index}" data-id="${paragraphId}">
                    <div class="paragraph-header">
                        <span class="paragraph-type">${typeLabel}</span>
                        <div class="paragraph-controls">
                            ${styleDropdown}
                            ${keepButton}
                            <span class="paragraph-status">${statusIndicator}</span>
                        </div>
                    </div>
                    <div class="paragraph-content">${renderMarkdown(content)}</div>
                    ${errorHtml}
                    ${suggestionsHtml}
                </div>
            `;
        }).join('');

        contentElement.innerHTML = html;

        // Add event listeners for style dropdowns
        document.querySelectorAll('.style-dropdown').forEach(dropdown => {
            dropdown.addEventListener('change', (e) => {
                const select = e.target;
                const paragraphId = select.dataset.paragraphId;
                const mode = select.value;

                if (mode && paragraphId) {
                    vscode.postMessage({
                        type: 'reenhance',
                        paragraphId: paragraphId,
                        mode: mode
                    });
                }
            });
        });

        // Add event listeners for keep buttons
        document.querySelectorAll('.keep-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const paragraphId = e.target.dataset.paragraphId;
                if (paragraphId) {
                    vscode.postMessage({
                        type: 'keep',
                        paragraphId: paragraphId
                    });
                }
            });
        });

        // Add event listeners for apply buttons
        document.querySelectorAll('.apply-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const button = e.target;
                const paragraphId = button.dataset.paragraphId;
                const suggestionIndex = parseInt(button.dataset.suggestionIndex, 10);
                const exampleIndex = parseInt(button.dataset.exampleIndex, 10);
                if (paragraphId && !isNaN(suggestionIndex) && !isNaN(exampleIndex)) {
                    // Disable button while processing
                    button.disabled = true;
                    button.textContent = 'Applying...';

                    vscode.postMessage({
                        type: 'apply',
                        paragraphId: paragraphId,
                        suggestionIndex: suggestionIndex,
                        exampleIndex: exampleIndex
                    });
                }
            });
        });

        // Add text selection listener for paragraph content
        document.querySelectorAll('.paragraph-content').forEach(content => {
            content.addEventListener('mouseup', (e) => {
                handleTextSelection(e.target.closest('.paragraph'));
            });
        });
    }

    /**
     * Handle text selection in a paragraph
     * @param {Element} paragraphElement
     */
    function handleTextSelection(paragraphElement) {
        if (!paragraphElement) return;

        const selection = window.getSelection();
        const selectedText = selection?.toString().trim();

        // Remove any existing selection improver
        removeSelectionImprover();

        if (!selectedText || selectedText.length < 3) {
            return;
        }

        const paragraphId = paragraphElement.dataset.id;
        if (!paragraphId) return;

        // Don't show for kept paragraphs
        if (paragraphElement.classList.contains('kept')) return;

        // Create and show the selection improver
        showSelectionImprover(paragraphElement, paragraphId, selectedText);
    }

    /**
     * Show the selection improver UI
     * @param {Element} paragraphElement
     * @param {string} paragraphId
     * @param {string} selectedText
     */
    function showSelectionImprover(paragraphElement, paragraphId, selectedText) {
        const improver = document.createElement('div');
        improver.className = 'selection-improver';
        improver.innerHTML = `
            <div class="selection-improver-header">
                <span class="selection-improver-label">Tell AI how to improve this</span>
                <button class="selection-improver-close" title="Close">×</button>
            </div>
            <div class="selection-improver-selected">"${escapeHtml(selectedText.length > 100 ? selectedText.substring(0, 100) + '...' : selectedText)}"</div>
            <div class="selection-improver-input">
                <input type="text" placeholder="e.g., make it more concise, add more detail, change tone..." autofocus>
                <button type="button">Improve</button>
            </div>
        `;

        // Add to paragraph
        paragraphElement.appendChild(improver);
        activeSelectionImprover = improver;

        // Focus input
        const input = improver.querySelector('input');
        input?.focus();

        // Handle close button
        improver.querySelector('.selection-improver-close')?.addEventListener('click', () => {
            removeSelectionImprover();
        });

        // Handle submit
        const submitBtn = improver.querySelector('.selection-improver-input button');
        const handleSubmit = () => {
            const instruction = input?.value.trim();
            if (instruction) {
                // Disable while processing
                input.disabled = true;
                submitBtn.disabled = true;
                submitBtn.textContent = 'Improving...';

                vscode.postMessage({
                    type: 'improveSelection',
                    paragraphId: paragraphId,
                    selectedText: selectedText,
                    instruction: instruction
                });
            }
        };

        submitBtn?.addEventListener('click', handleSubmit);
        input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });
    }

    /**
     * Remove any active selection improver
     */
    function removeSelectionImprover() {
        if (activeSelectionImprover) {
            activeSelectionImprover.remove();
            activeSelectionImprover = null;
        }
    }

    /**
     * Render inline suggestions for a paragraph
     * @param {Array} suggestions
     * @param {string} paragraphId
     */
    function renderInlineSuggestions(suggestions, paragraphId) {
        if (!suggestions || suggestions.length === 0) return '';

        const items = suggestions.map((s, suggestionIndex) => {
            const hasExamples = s.examples && s.examples.length > 0;
            const examplesHtml = hasExamples
                ? `<div class="inline-suggestion-examples">
                    ${s.examples.map((ex, exampleIndex) => `
                        <div class="inline-suggestion-example">
                            <span class="example-text">"${escapeHtml(ex)}"</span>
                            <button class="apply-btn"
                                data-paragraph-id="${paragraphId}"
                                data-suggestion-index="${suggestionIndex}"
                                data-example-index="${exampleIndex}"
                                title="Merge this into enhanced text">Apply</button>
                        </div>
                    `).join('')}
                   </div>`
                : '';

            return `
                <div class="inline-suggestion inline-suggestion-${s.category}">
                    <div class="inline-suggestion-header">
                        <span class="inline-suggestion-category">${s.category}</span>
                        <span class="inline-suggestion-title">${escapeHtml(s.title)}</span>
                    </div>
                    <div class="inline-suggestion-description">${escapeHtml(s.description)}</div>
                    ${examplesHtml}
                </div>
            `;
        }).join('');

        return `<div class="inline-suggestions">${items}</div>`;
    }

    /**
     * Get human-readable type label
     * @param {string} type
     */
    function getTypeLabel(type) {
        const labels = {
            'text': 'Paragraph',
            'heading': 'Heading',
            'list': 'List',
            'code': 'Code',
            'quote': 'Quote',
            'empty': 'Empty'
        };
        return labels[type] || type;
    }

    /**
     * Get status indicator HTML
     * @param {string} status
     * @param {object} para - paragraph object
     */
    function getStatusIndicator(status, para) {
        // Check if paragraph is kept (either via button or <!-- no-enhance --> comment)
        if (para?.kept || para?.original?.noEnhance) {
            return '<span class="kept-indicator">✓ Kept</span>';
        }

        // Check if paragraph is ignored (<!-- ai-ignore -->)
        if (para?.original?.ignore) {
            return '<span class="ignored">⊘ Ignored</span>';
        }

        switch (status) {
            case 'processing':
                return '<div class="spinner"></div> Enhancing...';
            case 'complete':
                return '✓ Enhanced';
            case 'error':
                return '✗ Error';
            case 'pending':
            default:
                return '○ Pending';
        }
    }

    /**
     * Update status message
     * @param {string} message
     * @param {boolean} isError
     */
    function updateStatus(message, isError = false) {
        if (!statusElement) return;

        if (!message) {
            statusElement.classList.add('hidden');
            return;
        }

        statusElement.textContent = message;
        statusElement.classList.remove('hidden');
        statusElement.classList.toggle('error', isError);
    }

    /**
     * Simple markdown rendering
     * @param {string} text
     */
    function renderMarkdown(text) {
        if (!text) return '';

        let html = text;

        // Code blocks (must be first to prevent other replacements inside)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^###### (.*$)/gm, '<h6>$1</h6>');
        html = html.replace(/^##### (.*$)/gm, '<h5>$1</h5>');
        html = html.replace(/^#### (.*$)/gm, '<h4>$1</h4>');
        html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
        html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

        // Bold and italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

        // Blockquotes
        html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');

        // Unordered lists
        html = html.replace(/^\s*[-*+] (.*$)/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        // Ordered lists
        html = html.replace(/^\s*\d+\. (.*$)/gm, '<li>$1</li>');

        // Line breaks
        html = html.replace(/\n\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');

        // Wrap in paragraph if not already wrapped
        if (!html.startsWith('<h') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<blockquote') && !html.startsWith('<pre')) {
            html = '<p>' + html + '</p>';
        }

        return html;
    }

    /**
     * Escape HTML special characters
     * @param {string} text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
