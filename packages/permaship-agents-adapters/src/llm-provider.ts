import type { LLMProvider } from '../../../src/adapters/interfaces/llm-provider.js';
import { DefaultLLMProvider } from '../../../src/adapters/default/llm-provider.js';

/**
 * Re-exports the Nexus DefaultLLMProvider, reading credentials from
 * PERMASHIP_LLM_API_KEY (preferred) or LLM_API_KEY (fallback).
 */
export function createLLMProvider(): LLMProvider {
  const apiKey = process.env.PERMASHIP_LLM_API_KEY ?? process.env.LLM_API_KEY ?? '';
  return new DefaultLLMProvider(apiKey);
}
