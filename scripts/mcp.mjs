#!/usr/bin/env node
// Read-only MCP servers on demand: the registrar (Webhuset) and the Cloudflare
// API. Attached to every session (.mcp.json), Webhuset's instructions and 50
// tool names cost ~1.5k tokens of context each time, for a few look-ups a
// year; a script costs nothing until it runs. Both keys are read-only:
// changes go through PRs and the workflows, never through these.
//
//   node scripts/mcp.mjs <server> list [filter]    the tools, one line each
//   node scripts/mcp.mjs <server> <tool> ['<json arguments>']
//
// Cloud sessions: the environment's network secret for the server's host
// authenticates — the agent proxy injects it, which is why this goes through
// curl (it honours HTTPS_PROXY; Node's fetch doesn't). Elsewhere: the key in
// the server's variable below.
import { execFileSync } from 'node:child_process'

const SERVERS = {
  webhuset: { endpoint: 'https://mcp.webhuset.no/mcp/v1', keyVar: 'WEBHUSET_API_KEY' },
  cloudflare: { endpoint: 'https://mcp.cloudflare.com/mcp', keyVar: 'CLOUDFLARE_READ_TOKEN' },
}

// One JSON-RPC message. The headers go in on stdin, so a key never shows in
// the process list; the body holds no secret.
function send({ endpoint, keyVar }, message, session, method = 'POST') {
  const headers = [
    'content-type: application/json',
    'accept: application/json, text/event-stream',
    ...(process.env[keyVar] ? [`authorization: Bearer ${process.env[keyVar]}`] : []),
    ...(session ? [`mcp-session-id: ${session}`] : []),
  ]
  const args = ['-sS', '--max-time', '60', '-X', method, '-D', '-', '-H', '@-']
  if (message) args.push('--data-raw', JSON.stringify({ jsonrpc: '2.0', ...message }))
  let rest = execFileSync('curl', [...args, endpoint], {
    input: `${headers.join('\n')}\n`,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  // Header blocks first: the proxy's "200 Connection Established", then the
  // server's own.
  let head = ''
  while (/^HTTP\/\S+ \d{3}/.test(rest)) {
    const end = rest.search(/\r?\n\r?\n/)
    head = end < 0 ? rest : rest.slice(0, end)
    rest = end < 0 ? '' : rest.slice(end).replace(/^(\r?\n){2}/, '')
  }
  const status = Number(head.match(/^HTTP\/\S+ (\d{3})/)?.[1])
  if (status === 401 || status === 403) {
    throw new Error(
      `HTTP ${status}: no key — set ${keyVar} (a cloud session takes it from the environment's network secret)`,
    )
  }
  // The body is JSON, or an event stream with the JSON in its data lines.
  const payloads = /^data:/m.test(rest)
    ? rest
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5))
    : [rest]
  const replies = payloads.filter((p) => p.trim()).map((p) => JSON.parse(p))
  const reply = replies.find((r) => r.id === message?.id) ?? replies.find((r) => r.error)
  if (reply?.error) throw new Error(`${reply.error.code}: ${reply.error.message}`)
  if (message?.id !== undefined && !reply) throw new Error(`HTTP ${status}: no reply to ${message.method}`)
  return { result: reply?.result, session: head.match(/^mcp-session-id:\s*(\S+)/im)?.[1] }
}

function main([name, tool = 'list', arg]) {
  const server = SERVERS[name]
  if (!server) {
    console.error(`usage: node scripts/mcp.mjs <${Object.keys(SERVERS).join('|')}> list [filter] | <tool> ['<json>']`)
    return 2
  }
  const { session } = send(server, {
    id: 0,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-cli', version: '1' } },
  })
  try {
    send(server, { method: 'notifications/initialized' }, session)
    if (tool === 'list') {
      const filter = (arg ?? '').toLowerCase()
      for (let cursor, page = 1; page === 1 || cursor; page++) {
        const { result } = send(server, { id: page, method: 'tools/list', params: cursor ? { cursor } : {} }, session)
        for (const t of result.tools) {
          if (!`${t.name} ${t.description}`.toLowerCase().includes(filter)) continue
          const required = new Set(t.inputSchema?.required ?? [])
          const params = Object.keys(t.inputSchema?.properties ?? {}).map((k) => (required.has(k) ? k : `${k}?`))
          console.log(`${t.name}(${params.join(', ')}) — ${(t.description ?? '').split(/(?<=\.)\s|\n/)[0]}`)
        }
        cursor = result.nextCursor
      }
      return 0
    }
    const { result } = send(
      server,
      { id: 1, method: 'tools/call', params: { name: tool, arguments: arg ? JSON.parse(arg) : {} } },
      session,
    )
    for (const part of result.content ?? []) console.log(part.type === 'text' ? part.text : JSON.stringify(part))
    return result.isError ? 1 : 0
  } finally {
    try {
      send(server, null, session, 'DELETE')
    } catch {
      // Ending the server-side session is a courtesy; nothing depends on it.
    }
  }
}

try {
  process.exitCode = main(process.argv.slice(2))
} catch (err) {
  // The agent proxy refuses the tunnel when the environment has no network
  // secret (or allowlist entry) for the host.
  const host = SERVERS[process.argv[2]]?.endpoint.split('/')[2]
  if (host && /CONNECT tunnel failed, response 403/.test(err.message)) {
    err.message = `${host} is blocked by the environment's network: add its network secret (cloud) or the key variable (locally)`
  }
  console.error(`mcp: ${err.message}`)
  process.exitCode = 1
}
