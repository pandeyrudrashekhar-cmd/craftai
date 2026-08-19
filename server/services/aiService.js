import { env } from '../config/env.js';
import { AppError } from '../utils/appError.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 60_000;
const REACT_SOURCE_REQUIREMENTS = 'When returning a change for src/App.jsx, its content must be complete valid React JSX: export default function App() { return (...); }. Never return raw HTML or a complete HTML document outside that component. HTML comments (<!-- -->) are invalid JSX and are forbidden; use JSX comments ({/* comment */}) only. Use className, never class. Tailwind is not installed: use inline styles or also update src/index.css for styling, never Tailwind utility classes. Do not modify src/main.jsx or package.json for normal website generation.';

function validateConfiguration() {
  if (!env.openRouterApiKey || !env.openRouterModel) {
    throw new AppError('AI service is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL on the server.', 503);
  }
}

export function parseStructuredAiResponse(content) {
  const fenced = content.match(/^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  return JSON.parse((fenced ? fenced[1] : content).trim());
}

function contentToText(content) {
  if (typeof content === 'string') return content.trim() || null;
  if (Array.isArray(content)) {
    const text = content.map((part) => contentToText(part?.text ?? part?.content ?? part?.value)).filter(Boolean).join('\n').trim();
    return text || null;
  }
  if (content && typeof content === 'object') return typeof content.text === 'string' ? contentToText(content.text) : null;
  return null;
}

export function extractProviderResponse(payload) {
  const choice = payload?.choices?.[0];
  const message = choice?.message;
  if (message?.parsed && typeof message.parsed === 'object') return message.parsed;
  const text = contentToText(message?.content) ?? contentToText(choice?.text) ?? contentToText(payload?.output_text) ?? contentToText(payload?.response?.output_text);
  return text;
}

export async function generateChatResponse(messages) {
  validateConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${env.openRouterApiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': env.clientUrls[0], 'X-Title': 'CraftAI Website Builder' },
      body: JSON.stringify({ model: env.openRouterModel, messages: [{ role: 'system', content: REACT_SOURCE_REQUIREMENTS }, ...messages], temperature: 0.4, response_format: { type: 'json_object' } })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error('OpenRouter request failed:', response.status, payload?.error?.message ?? 'Unknown provider error');
      throw new AppError('The AI provider is unavailable. Please try again.', 502);
    }
    const providerResponse = extractProviderResponse(payload);
    if (!providerResponse) {
      console.error('OpenRouter returned no assistant content:', {
        status: response.status,
        error: payload?.error ?? null,
        id: payload?.id ?? null,
        model: payload?.model ?? null,
        choices: payload?.choices ?? null,
        firstChoiceMessage: payload?.choices?.[0]?.message ?? null,
        finishReason: payload?.choices?.[0]?.finish_reason ?? null,
        nativeFinishReason: payload?.choices?.[0]?.native_finish_reason ?? null,
        usage: payload?.usage ?? null
      });
      throw new AppError('The AI provider returned an empty response. Please try again.', 502);
    }
    if (typeof providerResponse === 'object') return providerResponse;
    try { return parseStructuredAiResponse(providerResponse); } catch {
      console.error('OpenRouter returned invalid JSON:', providerResponse.slice(0, 500));
      throw new AppError('The AI provider returned an invalid response. Please try again.', 502);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error.name === 'AbortError') throw new AppError('The AI request timed out. Please try again.', 504);
    console.error('OpenRouter network error:', error);
    throw new AppError('Unable to reach the AI provider. Please try again.', 502);
  } finally { clearTimeout(timeout); }
}
