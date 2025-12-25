import * as vscode from 'vscode';
import {
    AIProvider,
    EnhancementMode,
    EnhancementRequest,
    EnhancementResponse,
    EnhancementSettings,
    MODE_DESCRIPTIONS,
    Suggestion,
    SuggestionResponse,
    getSettings
} from './types';

/**
 * Service for AI-powered text enhancement
 * Uses VSCode Language Model API (GitHub Copilot, etc.)
 */
export class AIService {
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Enhance a paragraph using VSCode Language Model API
     * Optionally includes suggestions in the same call for efficiency
     */
    public async enhance(
        request: EnhancementRequest,
        paragraphId: string,
        cancellationToken?: vscode.CancellationToken,
        includeSuggestions: boolean = false
    ): Promise<EnhancementResponse> {
        const settings = getSettings();
        const startTime = Date.now();

        this.log(`Enhancing ${request.paragraphType || 'paragraph'}${includeSuggestions ? ' with suggestions' : ''}`);

        try {
            const result = await this.enhanceWithVSCodeLM(request, settings, cancellationToken, includeSuggestions);

            return {
                original: request.paragraph,
                enhanced: result.enhanced,
                paragraphId,
                suggestions: result.suggestions,
                metadata: {
                    processingTime: Date.now() - startTime,
                    provider: AIProvider.VSCodeLM
                }
            };
        } catch (error) {
            this.log(`Enhancement error: ${error}`);
            throw error;
        }
    }

    /**
     * Enhance using VSCode Language Model API (GitHub Copilot, Claude, Gemini, etc.)
     */
    private async enhanceWithVSCodeLM(
        request: EnhancementRequest,
        settings: EnhancementSettings,
        cancellationToken?: vscode.CancellationToken,
        includeSuggestions: boolean = false
    ): Promise<{ enhanced: string; suggestions?: Suggestion[] }> {
        // Build model selector based on family preference
        const modelSelector: vscode.LanguageModelChatSelector = {};

        if (settings.preferredModelFamily) {
            modelSelector.family = settings.preferredModelFamily;
        }

        this.log(`Selecting models with family: ${settings.preferredModelFamily || 'any'}`);

        let models = await vscode.lm.selectChatModels(modelSelector);

        // If no models found with family preference, try without restrictions
        if (models.length === 0 && settings.preferredModelFamily) {
            this.log('No models found with family preference, trying all available...');
            models = await vscode.lm.selectChatModels({});
        }

        if (models.length === 0) {
            throw new Error(
                'No language models available. Please install GitHub Copilot, Claude for VSCode, or another LM extension.'
            );
        }

        // Log all available models for debugging
        this.log(`Available models: ${models.map(m => `${m.vendor}/${m.family}/${m.name}`).join(', ')}`);
        this.log(`Using model: ${models[0].name} (${models[0].vendor}/${models[0].family})`);
        return this.sendRequestToModel(models[0], request, cancellationToken, includeSuggestions);
    }

    /**
     * Send request to a language model
     */
    private async sendRequestToModel(
        model: vscode.LanguageModelChat,
        request: EnhancementRequest,
        cancellationToken?: vscode.CancellationToken,
        includeSuggestions: boolean = false
    ): Promise<{ enhanced: string; suggestions?: Suggestion[] }> {
        const prompt = includeSuggestions
            ? this.buildCombinedPrompt(request)
            : this.buildPrompt(request);

        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
        ];

        const token = cancellationToken || new vscode.CancellationTokenSource().token;

        const response = await model.sendRequest(messages, {}, token);

        // Stream the response
        let responseText = '';
        for await (const chunk of response.text) {
            responseText += chunk;
        }

        if (includeSuggestions) {
            return this.parseCombinedResponse(responseText);
        }

        return { enhanced: responseText.trim() };
    }

    /**
     * Get audience-specific guidance for the prompt
     */
    private getAudienceGuidance(audience?: string): string {
        if (!audience) {
            return '';
        }

        const audienceMap: Record<string, string> = {
            'blog-post': `
TARGET AUDIENCE: Blog post readers
- Use engaging, conversational tone
- Break up content for easy scanning
- Include hooks and transitions that keep readers engaged
- Web-friendly formatting`,
            'email': `
TARGET AUDIENCE: Email recipients
- Be clear and concise
- Lead with the main point
- Use action-oriented language
- Keep paragraphs short`,
            'office-note': `
TARGET AUDIENCE: Office memo/note
- Professional but brief
- Get to the point quickly
- Use clear, direct language
- Avoid unnecessary elaboration`,
            'technical-doc': `
TARGET AUDIENCE: Technical documentation
- Precise and unambiguous language
- Structured for reference
- Define terms when needed
- Focus on accuracy over style`,
            'academic': `
TARGET AUDIENCE: Academic writing
- Formal, scholarly tone
- Careful word choice
- Well-structured arguments
- Objective perspective`,
            'social-media': `
TARGET AUDIENCE: Social media
- Punchy and attention-grabbing
- Conversational and relatable
- Easy to share and engage with
- Concise but impactful`
        };

        return audienceMap[audience] || '';
    }

    /**
     * Build the prompt for enhancement
     */
    private buildPrompt(request: EnhancementRequest): string {
        // Special handling for headings - only correct spelling/grammar
        if (request.paragraphType === 'heading') {
            return this.buildHeadingPrompt(request);
        }

        // Special handling for list-expand mode
        if (request.mode === EnhancementMode.ListExpand) {
            return this.buildListExpandPrompt(request);
        }

        const modeDescription = MODE_DESCRIPTIONS[request.mode];
        const audienceGuidance = this.getAudienceGuidance(request.audience);

        let prompt = `You are an AI writing assistant. Your role is to subtly enhance the author's writing while PRESERVING their unique voice, style, and personality. The enhancement should make the text ${modeDescription}.

CRITICAL: The author's original voice must remain dominant. You are enhancing, not rewriting. Think of yourself as a skilled editor who polishes while respecting the author's distinct style.
${audienceGuidance}
`;

        if (request.authorStyleSample) {
            prompt += `AUTHOR'S WRITING STYLE REFERENCE:
The following is a sample of the author's writing. Study it carefully to understand their voice, tone, sentence structure, word choices, and personality:

${request.authorStyleSample}

---

`;
        }

        if (request.documentTitle) {
            prompt += `DOCUMENT CONTEXT:
Title: ${request.documentTitle}

`;
        }

        if (request.context) {
            prompt += `PREVIOUS PARAGRAPHS (additional style reference):
${request.context}

`;
        }

        prompt += `CURRENT PARAGRAPH TO ENHANCE:
${request.paragraph}

Guidelines:
1. PRESERVE the author's unique voice, word choices, and writing patterns
2. Correct any spelling mistakes and improve grammar
3. Only enhance clarity, flow, or depth - never replace the author's style with generic AI prose
4. Maintain the core message and intent exactly
5. Preserve markdown formatting where appropriate (emphasis, links, code)
6. You MAY restructure sentences or reorder points if it improves readability
7. Match the tone and personality established by the author
8. If the writing has distinctive quirks or stylistic choices, keep them

OUTPUT ONLY THE ENHANCED PARAGRAPH, NO PREAMBLE OR EXPLANATION.`;

        return prompt;
    }

    /**
     * Build a prompt for heading enhancement - only spelling/grammar corrections
     */
    private buildHeadingPrompt(request: EnhancementRequest): string {
        const audienceGuidance = this.getAudienceGuidance(request.audience);

        let prompt = `You are an AI editor. Your task is to review a heading and ONLY make minimal corrections.
${audienceGuidance}
HEADING TO REVIEW:
${request.paragraph}

RULES:
1. Fix any spelling mistakes
2. Fix any grammar issues
3. You may slightly improve clarity or word choice IF it fits the target audience
4. Keep the heading concise - do NOT expand it into a longer phrase
5. Preserve the original markdown heading syntax (# ## ### etc.)
6. Do NOT change the meaning or intent
7. If no corrections are needed, return the heading exactly as-is

OUTPUT ONLY THE CORRECTED HEADING, NO EXPLANATION.`;

        return prompt;
    }

    /**
     * Build a special prompt for list-expand mode
     */
    private buildListExpandPrompt(request: EnhancementRequest): string {
        let prompt = `You are an AI writing assistant. Your task is to transform the author's bullet points or list into flowing, well-structured prose paragraphs.

CRITICAL RULES:
1. Use the information provided in the bullet points as your source of truth
2. You MAY make logical inferences and connections between the points
3. You MAY clarify implicit meanings and draw reasonable conclusions from the content
4. DO NOT invent experiences, anecdotes, or stories the author didn't mention
5. DO NOT fabricate specific examples, statistics, or details not in the original
6. DO NOT add hypothetical scenarios or "for example" illustrations unless they're in the bullets
7. Preserve the author's voice and word choices as much as possible

The distinction: Inferring "this implies X" from stated facts is OK. Inventing "for example, when I did Y" is NOT OK.

`;

        if (request.authorStyleSample) {
            prompt += `AUTHOR'S WRITING STYLE REFERENCE:
${request.authorStyleSample}

---

`;
        }

        if (request.documentTitle) {
            prompt += `DOCUMENT CONTEXT:
Title: ${request.documentTitle}

`;
        }

        if (request.context) {
            prompt += `PREVIOUS PARAGRAPHS (for flow and context):
${request.context}

`;
        }

        prompt += `BULLET POINTS TO TRANSFORM:
${request.paragraph}

Guidelines:
1. Transform bullet points into flowing prose
2. Correct any spelling mistakes and improve grammar
3. You MAY reorder, combine, or restructure points for better flow and readability
4. Group related ideas into logical paragraphs
5. Keep the author's terminology and phrasing
6. Make logical inferences to connect ideas coherently
7. Never invent experiences, examples, or anecdotes the author didn't provide

OUTPUT ONLY THE PROSE PARAGRAPHS, NO PREAMBLE OR EXPLANATION.`;

        return prompt;
    }

    /**
     * Build a combined prompt that returns both enhanced text and suggestions
     */
    private buildCombinedPrompt(request: EnhancementRequest): string {
        const modeDescription = MODE_DESCRIPTIONS[request.mode];
        const audienceGuidance = this.getAudienceGuidance(request.audience);

        let prompt = `You are an AI writing assistant. Your role is to:
1. Subtly enhance the author's writing while PRESERVING their unique voice
2. Provide actionable suggestions for further improvement

The enhancement should make the text ${modeDescription}.

CRITICAL: The author's original voice must remain dominant. You are enhancing, not rewriting.
${audienceGuidance}
`;

        if (request.authorStyleSample) {
            prompt += `\nAUTHOR'S WRITING STYLE REFERENCE:\n${request.authorStyleSample}\n\n---\n`;
        }

        if (request.documentTitle) {
            prompt += `\nDOCUMENT CONTEXT:\nTitle: ${request.documentTitle}\n`;
        }

        if (request.context) {
            prompt += `\nPREVIOUS PARAGRAPHS:\n${request.context}\n`;
        }

        prompt += `
CURRENT PARAGRAPH TO ENHANCE:
${request.paragraph}

RESPOND WITH A JSON OBJECT containing exactly these fields:
{
  "enhanced": "The enhanced paragraph text here",
  "suggestions": [
    {
      "category": "improvement|gap|idea",
      "title": "Short title",
      "description": "What to improve",
      "examples": ["Concrete example 1", "Concrete example 2"]
    }
  ]
}

ENHANCEMENT RULES:
1. PRESERVE the author's unique voice and writing patterns
2. Correct spelling and improve grammar
3. Only enhance clarity, flow, or depth - never replace style with generic AI prose
4. Maintain the core message and intent
5. Preserve markdown formatting

SUGGESTION RULES:
1. 0-2 suggestions maximum (quality over quantity)
2. Skip if the paragraph is already strong
3. Categories: "improvement" (structure/impact), "gap" (missing examples/evidence), "idea" (creative additions)
4. Each suggestion MUST include 1-2 concrete examples the author could use
5. Focus on substance, not grammar (that's already fixed in the enhanced text)

OUTPUT ONLY THE JSON OBJECT, NO MARKDOWN FENCES OR EXPLANATION.`;

        return prompt;
    }

    /**
     * Parse the combined response containing enhanced text and suggestions
     */
    private parseCombinedResponse(responseText: string): { enhanced: string; suggestions?: Suggestion[] } {
        try {
            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                this.log('No JSON found in combined response, using as plain enhanced text');
                return { enhanced: responseText.trim() };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            const enhanced = typeof parsed.enhanced === 'string' ? parsed.enhanced : responseText.trim();
            let suggestions: Suggestion[] | undefined;

            if (Array.isArray(parsed.suggestions)) {
                const parsedSuggestions = parsed.suggestions
                    .filter((s: unknown) => {
                        if (typeof s !== 'object' || s === null) return false;
                        const obj = s as Record<string, unknown>;
                        return (
                            typeof obj.category === 'string' &&
                            typeof obj.title === 'string' &&
                            typeof obj.description === 'string' &&
                            ['improvement', 'gap', 'idea'].includes(obj.category)
                        );
                    })
                    .map((s: Record<string, unknown>) => ({
                        category: s.category as 'improvement' | 'gap' | 'idea',
                        title: String(s.title),
                        description: String(s.description),
                        examples: Array.isArray(s.examples)
                            ? s.examples.filter((e): e is string => typeof e === 'string')
                            : undefined
                    }));

                if (parsedSuggestions.length > 0) {
                    suggestions = parsedSuggestions;
                }
            }

            return { enhanced, suggestions };
        } catch (error) {
            this.log(`Failed to parse combined response: ${error}`);
            return { enhanced: responseText.trim() };
        }
    }

    /**
     * Validate that language models are available
     */
    public async validateProvider(): Promise<{ valid: boolean; message?: string }> {
        try {
            const models = await vscode.lm.selectChatModels({});
            if (models.length === 0) {
                return {
                    valid: false,
                    message: 'No language models available. Please install GitHub Copilot or another LM extension.'
                };
            }
            return { valid: true };
        } catch {
            return {
                valid: false,
                message: 'Could not access language models. Please check your VSCode installation.'
            };
        }
    }

    /**
     * Get available models for VSCode LM
     */
    public async getAvailableModels(): Promise<string[]> {
        try {
            const models = await vscode.lm.selectChatModels({});
            return models.map(m => m.name);
        } catch {
            return [];
        }
    }

    /**
     * Generate per-paragraph suggestions
     */
    public async generateSuggestions(
        paragraphs: Array<{ index: number; original: string; enhanced: string; type: string }>,
        documentTitle: string,
        audience: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<SuggestionResponse> {
        const settings = getSettings();
        const startTime = Date.now();

        this.log('Generating per-paragraph suggestions');

        try {
            const prompt = this.buildSuggestionsPrompt(paragraphs, documentTitle, audience);

            // Get model
            const modelSelector: vscode.LanguageModelChatSelector = {};
            if (settings.preferredModelFamily) {
                modelSelector.family = settings.preferredModelFamily;
            }

            let models = await vscode.lm.selectChatModels(modelSelector);
            if (models.length === 0 && settings.preferredModelFamily) {
                models = await vscode.lm.selectChatModels({});
            }

            if (models.length === 0) {
                throw new Error('No language models available');
            }

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const token = cancellationToken || new vscode.CancellationTokenSource().token;
            const response = await models[0].sendRequest(messages, {}, token);

            let responseText = '';
            for await (const chunk of response.text) {
                responseText += chunk;
            }

            // Parse the JSON response
            const suggestions = this.parseSuggestionsResponse(responseText);

            return {
                suggestions,
                processingTime: Date.now() - startTime
            };
        } catch (error) {
            this.log(`Suggestions error: ${error}`);
            throw error;
        }
    }

    /**
     * Build prompt for generating per-paragraph suggestions
     */
    private buildSuggestionsPrompt(
        paragraphs: Array<{ index: number; original: string; enhanced: string; type: string }>,
        title: string,
        audience: string
    ): string {
        const audienceContext = this.getAudienceContextForSuggestions(audience);

        // Build numbered paragraph list
        const paragraphList = paragraphs
            .map(p => `[${p.index}] (${p.type})\nOriginal: ${p.original}\nEnhanced: ${p.enhanced}`)
            .join('\n\n');

        return `You are an expert writing coach. Analyze each paragraph and provide targeted suggestions to help the author elevate their content.
${audienceContext}
DOCUMENT TITLE: ${title || 'Untitled'}

PARAGRAPHS (numbered for reference):
${paragraphList}

NOTE: The "Enhanced" version has ALREADY fixed spelling, grammar, and phrasing. Do NOT suggest mechanical fixes.

For each paragraph that could be improved, provide a suggestion. Not every paragraph needs one - skip paragraphs that are already strong.

Categories:
- "improvement": Strengthen structure, argument, or impact
- "gap": Missing examples, evidence, or context
- "idea": Creative additions or new angles

IMPORTANT RULES:
1. Include "paragraphIndex" to link each suggestion to its paragraph number
2. Skip paragraphs that don't need suggestions (headings often don't)
3. Be specific and actionable
4. Tailor to the audience${audience ? ` (${audience})` : ''}
5. Include 1-2 concrete examples the author could adapt
6. Aim for 1-4 total suggestions (quality over quantity)

Respond with a JSON array:
[
  {"paragraphIndex": 0, "category": "improvement", "title": "Stronger opening hook", "description": "Lead with the key benefit.", "examples": ["What if your first draft was already polished?"]},
  {"paragraphIndex": 2, "category": "gap", "title": "Add a concrete example", "description": "Show a before/after.", "examples": ["For instance, 'quick brown fox' becomes 'nimble fox leapt gracefully'..."]}
]

OUTPUT ONLY THE JSON ARRAY.`;
    }

    /**
     * Get audience-specific context for suggestions
     */
    private getAudienceContextForSuggestions(audience: string): string {
        if (!audience) {
            return '';
        }

        const audienceMap: Record<string, string> = {
            'blog-post': `
TARGET AUDIENCE: Blog post readers
Consider: engagement, shareability, scanability, SEO-friendly structure, compelling headlines, reader retention`,
            'email': `
TARGET AUDIENCE: Email recipients
Consider: clarity, brevity, clear call-to-action, subject line effectiveness, mobile readability`,
            'office-note': `
TARGET AUDIENCE: Office memo/note
Consider: professionalism, brevity, actionable items, clear next steps, appropriate tone for workplace`,
            'technical-doc': `
TARGET AUDIENCE: Technical documentation
Consider: accuracy, completeness, code examples, troubleshooting guidance, logical organization`,
            'academic': `
TARGET AUDIENCE: Academic writing
Consider: thesis strength, argument structure, evidence quality, citation needs, scholarly tone`,
            'social-media': `
TARGET AUDIENCE: Social media
Consider: hook strength, emotional resonance, shareability, hashtag potential, visual pairing opportunities`
        };

        return audienceMap[audience] || '';
    }

    /**
     * Parse the AI response into structured suggestions
     */
    private parseSuggestionsResponse(responseText: string): Suggestion[] {
        try {
            // Try to extract JSON from the response
            const jsonMatch = responseText.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                this.log('No JSON array found in suggestions response');
                return [];
            }

            const parsed = JSON.parse(jsonMatch[0]);

            if (!Array.isArray(parsed)) {
                return [];
            }

            // Validate and clean up each suggestion
            return parsed
                .filter((item: unknown) => {
                    if (typeof item !== 'object' || item === null) return false;
                    const obj = item as Record<string, unknown>;
                    return (
                        typeof obj.category === 'string' &&
                        typeof obj.title === 'string' &&
                        typeof obj.description === 'string' &&
                        ['improvement', 'gap', 'idea'].includes(obj.category)
                    );
                })
                .map((item: Record<string, unknown>) => ({
                    category: item.category as 'improvement' | 'gap' | 'idea',
                    title: String(item.title),
                    description: String(item.description),
                    examples: Array.isArray(item.examples)
                        ? item.examples.filter((e): e is string => typeof e === 'string')
                        : undefined,
                    paragraphIndex: typeof item.paragraphIndex === 'number' ? item.paragraphIndex : undefined
                }));
        } catch (error) {
            this.log(`Failed to parse suggestions: ${error}`);
            return [];
        }
    }

    /**
     * Improve a selected portion of text based on user instruction
     */
    public async improveSelection(
        fullText: string,
        selectedText: string,
        instruction: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<string> {
        const settings = getSettings();

        this.log(`Improving selection: "${selectedText.substring(0, 50)}..." with instruction: ${instruction}`);

        try {
            const modelSelector: vscode.LanguageModelChatSelector = {};
            if (settings.preferredModelFamily) {
                modelSelector.family = settings.preferredModelFamily;
            }

            let models = await vscode.lm.selectChatModels(modelSelector);
            if (models.length === 0 && settings.preferredModelFamily) {
                models = await vscode.lm.selectChatModels({});
            }

            if (models.length === 0) {
                throw new Error('No language models available');
            }

            const prompt = `You are an expert editor. The user has selected a specific portion of text and wants you to improve it according to their instruction.

FULL TEXT:
${fullText}

SELECTED PORTION TO IMPROVE:
"${selectedText}"

USER'S INSTRUCTION:
${instruction}

RULES:
1. Return the FULL TEXT with the selected portion improved according to the instruction
2. Only modify the selected portion - keep everything else exactly the same
3. Make the improvement seamless - it should flow naturally with the surrounding text
4. Follow the user's instruction precisely
5. Preserve the author's voice and style

OUTPUT ONLY THE FULL IMPROVED TEXT, NO EXPLANATION.`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const token = cancellationToken || new vscode.CancellationTokenSource().token;
            const response = await models[0].sendRequest(messages, {}, token);

            let improved = '';
            for await (const chunk of response.text) {
                improved += chunk;
            }

            return improved.trim();
        } catch (error) {
            this.log(`Improve selection error: ${error}`);
            throw error;
        }
    }

    /**
     * Merge an example/suggestion into existing enhanced text seamlessly
     */
    public async mergeExample(
        enhancedText: string,
        exampleText: string,
        suggestionContext: string,
        cancellationToken?: vscode.CancellationToken
    ): Promise<string> {
        const settings = getSettings();

        this.log('Merging example into enhanced text');

        try {
            const modelSelector: vscode.LanguageModelChatSelector = {};
            if (settings.preferredModelFamily) {
                modelSelector.family = settings.preferredModelFamily;
            }

            let models = await vscode.lm.selectChatModels(modelSelector);
            if (models.length === 0 && settings.preferredModelFamily) {
                models = await vscode.lm.selectChatModels({});
            }

            if (models.length === 0) {
                throw new Error('No language models available');
            }

            const prompt = `You are an expert editor. Your task is to seamlessly integrate a suggested addition into existing text.

CURRENT TEXT:
${enhancedText}

SUGGESTION CONTEXT: ${suggestionContext}

EXAMPLE TO INTEGRATE:
${exampleText}

RULES:
1. Integrate the example naturally into the text - it should flow seamlessly
2. You may adapt the example's wording slightly to match the text's voice and style
3. Place it where it makes the most sense contextually
4. Do NOT add any preamble or explanation
5. Do NOT add phrases like "For example" unless it genuinely fits
6. The result should read as if it was written this way originally
7. Preserve all existing content - you're adding, not replacing

OUTPUT ONLY THE MERGED TEXT.`;

            const messages = [
                vscode.LanguageModelChatMessage.User(prompt)
            ];

            const token = cancellationToken || new vscode.CancellationTokenSource().token;
            const response = await models[0].sendRequest(messages, {}, token);

            let merged = '';
            for await (const chunk of response.text) {
                merged += chunk;
            }

            return merged.trim();
        } catch (error) {
            this.log(`Merge error: ${error}`);
            throw error;
        }
    }

    private log(message: string): void {
        this.outputChannel.appendLine(`[AIService] ${message}`);
    }
}
