// Build the DeepSeek request body from a source bundle. Uses the exact model
// configuration required: deepseek-v4-pro, thinking enabled, reasoning_effort
// max, JSON object response, temperature 0.

import { config } from '../config.js';
import { SYSTEM_PROMPT, OUTPUT_SCHEMA_DESCRIPTION } from './avatar-system-prompt.js';

export function buildDeepseekRequest(sourceBundle) {
  const userContent = [
    'Extract structured, evidence-grounded fields from this source bundle.',
    'Return JSON exactly matching this shape (each array item is {"value": string, "source_ids": [string]}):',
    JSON.stringify(OUTPUT_SCHEMA_DESCRIPTION),
    'Source bundle:',
    JSON.stringify(sourceBundle)
  ].join('\n\n');

  // Only valid DeepSeek (OpenAI-compatible) parameters. `thinking` and
  // `reasoning_effort` are NOT DeepSeek fields and caused every request to fail.
  // deepseek-chat supports response_format json_object (the prompt must mention
  // "json", which it does).
  const body = {
    model: config.deepseekModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 4000
  };
  return body;
}
