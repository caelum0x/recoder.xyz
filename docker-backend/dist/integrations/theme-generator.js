"use strict";
/**
 * AI Theme Generation
 * Generates design system themes from screenshots using vision-capable AI models.
 * Supports Anthropic, OpenAI, Google, and OpenRouter providers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateThemePrompt = generateThemePrompt;
// ── Meta-prompts ───────────────────────────────────────────────────
const INSPIRED_META_PROMPT = `You are a senior UI/UX designer creating design system themes for web applications.

Given the screenshot(s) and optional keywords, extract an ABSTRACT design system — NOT a pixel-perfect copy.

Analyze the visual design and extract:
1. Color palette (primary, secondary, accent, semantic colors)
2. Typography system (font sizes, weights, line heights)
3. Component styling patterns (border radius, shadows, borders, padding)
4. Motion/animation guidelines
5. Layout principles (spacing, grid, alignment)

Output a complete design system prompt wrapped in <theme></theme> tags that a developer AI can follow.
The theme should be framework-agnostic but reference Tailwind CSS utility classes.

IMPORTANT:
- Extract the DESIGN SYSTEM, not the layout or content
- The output should work for ANY type of application, not just replicate the screenshot
- Focus on the feeling, aesthetic, and design language
- Include specific color values (Tailwind color names + shades)
- Include component-level styling guidelines`;
const HIGH_FIDELITY_META_PROMPT = `You are a senior UI/UX designer creating a high-fidelity design system theme.

Given the screenshot(s) and optional keywords, create a design system that CLOSELY matches the visual style shown.

Carefully analyze and replicate:
1. Exact color palette — match colors as closely as possible using Tailwind shades
2. Typography — font sizes, weights, letter spacing, line heights
3. Component styles — exact border-radius, shadow styles, border treatments
4. Spacing and padding patterns
5. Any distinctive visual effects (gradients, glass-morphism, neumorphism, etc.)
6. Motion and interaction patterns visible in the design

Output a complete design system prompt wrapped in <theme></theme> tags.

IMPORTANT:
- Be as SPECIFIC as possible — use exact Tailwind utilities
- If you see a gradient, specify the exact gradient stops
- If you see shadows, specify the exact shadow utilities
- Match the visual density and whitespace patterns
- The goal is a developer AI following your theme should produce something visually similar`;
// ── Provider Calls ─────────────────────────────────────────────────
async function callAnthropic(apiKey, model, systemPrompt, userContent) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Anthropic API error (${res.status}): ${text}`);
    }
    const data = (await res.json());
    return {
        text: data.content?.find((c) => c.type === 'text')?.text || '',
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
    };
}
async function callOpenAI(apiKey, model, systemPrompt, userContent) {
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
    ];
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages,
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI API error (${res.status}): ${text}`);
    }
    const data = (await res.json());
    return {
        text: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
    };
}
async function callGoogle(apiKey, model, systemPrompt, userContent) {
    // Map to Gemini API format
    const parts = [];
    for (const item of userContent) {
        if (item.type === 'text') {
            parts.push({ text: item.text });
        }
        else if (item.type === 'image_url') {
            const url = item.image_url.url;
            // Extract base64 data from data URL
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
                parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
            }
        }
    }
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts }],
            generationConfig: { maxOutputTokens: 4096 },
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Google AI API error (${res.status}): ${text}`);
    }
    const data = (await res.json());
    return {
        text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
}
async function callOpenRouter(apiKey, model, systemPrompt, userContent) {
    // OpenRouter uses OpenAI-compatible format
    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
    ];
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://recoder.xyz',
            'X-Title': 'Recoder.xyz Theme Generator',
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages,
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenRouter API error (${res.status}): ${text}`);
    }
    const data = (await res.json());
    return {
        text: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
    };
}
// ── Main Generator ─────────────────────────────────────────────────
async function generateThemePrompt(params) {
    const { images, keywords, generationMode, model, apiKey, provider } = params;
    // Validate inputs
    if (!images.length || images.length > 5) {
        throw new Error('Provide between 1 and 5 images');
    }
    if (keywords && keywords.length > 500) {
        throw new Error('Keywords must be 500 characters or less');
    }
    for (const img of images) {
        // Rough base64 size check (base64 is ~4/3 of original)
        const sizeBytes = Math.ceil((img.length * 3) / 4);
        if (sizeBytes > 10 * 1024 * 1024) {
            throw new Error('Each image must be under 10MB');
        }
    }
    const metaPrompt = generationMode === 'high-fidelity' ? HIGH_FIDELITY_META_PROMPT : INSPIRED_META_PROMPT;
    // Build multimodal content array (OpenAI/Anthropic format)
    const userContent = [];
    if (keywords) {
        userContent.push({
            type: 'text',
            text: `Design keywords/reference: ${keywords}`,
        });
    }
    for (const img of images) {
        // Detect MIME type from base64 header or default to PNG
        let mimeType = 'image/png';
        if (img.startsWith('/9j/'))
            mimeType = 'image/jpeg';
        else if (img.startsWith('iVBOR'))
            mimeType = 'image/png';
        else if (img.startsWith('R0lGOD'))
            mimeType = 'image/gif';
        else if (img.startsWith('UklGR'))
            mimeType = 'image/webp';
        if (provider === 'anthropic') {
            userContent.push({
                type: 'image',
                source: { type: 'base64', media_type: mimeType, data: img },
            });
        }
        else {
            // OpenAI/OpenRouter/Google format
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${img}` },
            });
        }
    }
    userContent.push({
        type: 'text',
        text: 'Analyze the screenshot(s) above and generate a complete design system theme. Wrap the output in <theme></theme> tags.',
    });
    // Call the appropriate provider
    let callResult;
    switch (provider) {
        case 'anthropic':
            callResult = await callAnthropic(apiKey, model, metaPrompt, userContent);
            break;
        case 'openai':
            callResult = await callOpenAI(apiKey, model, metaPrompt, userContent);
            break;
        case 'google':
            callResult = await callGoogle(apiKey, model, metaPrompt, userContent);
            break;
        case 'openrouter':
            callResult = await callOpenRouter(apiKey, model, metaPrompt, userContent);
            break;
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
    // Extract <theme>...</theme> content if present, or wrap the result
    const themeMatch = callResult.text.match(/<theme>([\s\S]*?)<\/theme>/);
    const prompt = themeMatch
        ? `<theme>${themeMatch[1]}</theme>`
        : `<theme>\n${callResult.text.trim()}\n</theme>`;
    return { prompt, inputTokens: callResult.inputTokens, outputTokens: callResult.outputTokens };
}
