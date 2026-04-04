import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

type RecordedCall = {
  method: string
  pathname: string
  body: unknown
}

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../../../..')
const scripts = [
  {
    name: 'root MCP server',
    file: path.join(root, 'mcp/recoder-a2a-server.js'),
  },
  {
    name: 'CLI MCP server',
    file: path.join(root, 'packages/recoder-code/packages/cli/mcp/recoder-a2a-server.js'),
  },
] as const

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length) {
    await cleanups.pop()?.()
  }
})

async function startTaskServer() {
  const calls: RecordedCall[] = []
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const bodyText = await readBody(req)
    const body = bodyText ? JSON.parse(bodyText) : null
    const pathname = req.url ? new URL(req.url, 'http://127.0.0.1').pathname : ''

    calls.push({
      method: req.method || 'GET',
      pathname,
      body,
    })

    if (req.method === 'POST' && pathname === '/api/a2a/tasks/task-123/claim') {
      return json(res, { success: true, data: { state: 'submitted' } })
    }

    if (req.method === 'PATCH' && pathname === '/api/a2a/tasks/task-123/transition') {
      const payload = body as { target_state?: string }
      return json(res, { success: true, data: { state: payload.target_state || 'unknown' } })
    }

    res.statusCode = 404
    res.end('not found')
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('failed to bind test server')

  cleanups.push(async () => {
    server.close()
    await once(server, 'close')
  })

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
  }
}

function startMcp(file: string, dockerUrl: string) {
  const child = spawn(process.execPath, [file], {
    cwd: root,
    env: {
      ...process.env,
      RECODER_DOCKER_URL: dockerUrl,
      RECODER_API_URL: dockerUrl,
      RECODER_A2A_URL: 'ws://127.0.0.1:1/agent-bridge',
      RECODER_AGENT_ID: 'claude_code',
      RECODER_SESSION_ID: 'test-session',
      RECODER_API_TOKEN: '',
      RECODER_SESSION_TOKEN: '',
      DAYTONA_API_KEY: '',
      NO_COLOR: '1',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stdout = ''
  let stderr = ''
  let buffer = ''
  const messages: any[] = []

  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  child.stdout.on('data', (chunk: string) => {
    stdout += chunk
    buffer += chunk
    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line) messages.push(JSON.parse(line))
      idx = buffer.indexOf('\n')
    }
  })

  child.stderr.on('data', (chunk: string) => {
    stderr += chunk
  })

  cleanups.push(async () => {
    if (child.killed) return
    child.kill('SIGTERM')
    await once(child, 'exit').catch(() => undefined)
  })

  const waitFor = async (predicate: (msg: any) => boolean, timeoutMs = 10_000) => {
    const started = Date.now()
    for (;;) {
      const found = messages.find(predicate)
      if (found) return found
      if (child.exitCode !== null) {
        throw new Error(`MCP process exited early (${child.exitCode})\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`)
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`Timed out waiting for MCP response\nSTDERR:\n${stderr}\nSTDOUT:\n${stdout}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  const send = (msg: unknown) => {
    child.stdin.write(`${JSON.stringify(msg)}\n`)
  }

  return { child: child as ChildProcessWithoutNullStreams, send, waitFor, getStderr: () => stderr }
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function json(res: ServerResponse, body: unknown) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

describe('recoder_task_respond', () => {
  it.each(scripts)('transitions submitted -> working -> completed in %s', async ({ file }) => {
    const server = await startTaskServer()
    const mcp = startMcp(file, server.baseUrl)

    mcp.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    await mcp.waitFor((msg) => msg.id === 1)

    mcp.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
    mcp.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'recoder_task_respond',
        arguments: {
          task_id: 'task-123',
          result: 'done',
        },
      },
    })

    const response = await mcp.waitFor((msg) => msg.id === 2)
    const text = response.result?.content?.[0]?.text

    expect(text).toContain('Task task-123 → completed.')
    expect(text).toContain('State: completed')
    expect(mcp.getStderr()).not.toContain('Invalid state transition')

    expect(server.calls).toEqual([
      {
        method: 'POST',
        pathname: '/api/a2a/tasks/task-123/claim',
        body: {
          session_id: 'test-session',
          agent_id: 'claude_code',
        },
      },
      {
        method: 'PATCH',
        pathname: '/api/a2a/tasks/task-123/transition',
        body: {
          target_state: 'working',
          triggered_by: 'claude_code:test-session',
          reason: 'Task claimed and started',
        },
      },
      {
        method: 'PATCH',
        pathname: '/api/a2a/tasks/task-123/transition',
        body: {
          target_state: 'completed',
          triggered_by: 'claude_code:test-session',
          result: { output: 'done' },
          reason: 'Task completed',
        },
      },
    ])
  })
})
