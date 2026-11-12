// backend/services/claude.js
import Anthropic from '@anthropic-ai/sdk'

let client = null

// Seven agents run in parallel on a 10 s budget each, so the default is the
// fast tier. Override with ANTHROPIC_MODEL (e.g. claude-sonnet-5-5) to trade speed for depth.
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'

export const hasClaudeKey = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim())

export function getClaudeClient() {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }
  return client
}

/**
 * Call Claude with a structured prompt, parse JSON response
 */
export async function claudeJson(prompt, maxTokens = 800) {
  // No key → fail at once with a plain reason; each agent then uses its backup rules.
  if (!hasClaudeKey()) throw new Error('ANTHROPIC_API_KEY not set — using backup rules')
  const claude = getClaudeClient()
  const msg = await claude.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content.find(b => b.type === 'text')?.text || ''
  // Match JSON array [...] or object {...} — alternatives agent returns an array
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
  if (!match) throw new Error('No JSON in Claude response')
  return JSON.parse(match[1])
}

/**
 * Call Claude with timeout wrapper
 */
export async function claudeJsonWithTimeout(prompt, maxTokens = 800, timeoutMs = 10000) {
  let timer
  return Promise.race([
    claudeJson(prompt, maxTokens),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Claude timeout')), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}
