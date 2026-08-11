// backend/services/claude.js
import Anthropic from '@anthropic-ai/sdk'

let client = null

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
  const claude = getClaudeClient()
  const msg = await claude.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = msg.content[0].text
  // Match JSON array [...] or object {...} — alternatives agent returns an array
  const match = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/)
  if (!match) throw new Error('No JSON in Claude response')
  return JSON.parse(match[1])
}

/**
 * Call Claude with timeout wrapper
 */
export async function claudeJsonWithTimeout(prompt, maxTokens = 800, timeoutMs = 10000) {
  return Promise.race([
    claudeJson(prompt, maxTokens),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Claude timeout')), timeoutMs)
    ),
  ])
}
