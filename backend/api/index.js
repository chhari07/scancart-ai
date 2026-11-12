// Vercel entry: every request is rewritten here (see vercel.json) and handled by the Express app.
import app, { ready } from '../server.js'

export default async function handler(req, res) {
  await ready
  return app(req, res)
}
