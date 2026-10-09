#!/usr/bin/env node
/**
 * Keep-alive behaviour check for the "proxy idle timeout vs server keep-alive" 502 race
 * (lb-keepalive skill). Language-agnostic: it speaks raw HTTP/1.1 over a socket, so it measures
 * any server — Node, Gunicorn/Uvicorn, Go, Tomcat, Kestrel, Puma, nginx, Apache.
 *
 * Zero dependencies (Node ≥ 18), so the same script runs against a local production build, a
 * Docker container, or a URL behind a load balancer (http or https):
 *
 *   node check-keepalive.mjs http://localhost:3000 --expect=65             # server direct
 *   node check-keepalive.mjs http://localhost:3000 --expect=65 --slack=2    # Node ≥ 22.9 (+1 s buffer)
 *   node check-keepalive.mjs https://dev.example.jp                         # behind the LB: report only
 *
 * Options:
 *   --expect=N        expected server idle keep-alive timeout in SECONDS (proxy idle + 5) →
 *                     PASS/FAIL per check and a non-zero exit on any FAIL. Omit to just report.
 *   --slack=S         how much later than N the server may close an idle socket (default 1).
 *                     Node ≥ 22.9 / 20.18 arms its timer at keepAliveTimeout + 1 s → use 2.
 *   --path=/health    request path (any route works — keep-alive is server-wide).
 *   --idle=10,30,62,70  idle gaps (s) for the socket-reuse check.
 *   --checks=header,idle-close,reuse  subset to run (default). Add headers-timeout for Node.
 *   --headers-timeout=S  expected Node headersTimeout in seconds (default expect + 1).
 *   --max-wait=S      give up waiting for a server-side close after S seconds
 *                     (default max(180, expect + 45)).
 *
 * The checks run in PARALLEL, so the total runtime is about the longest wait (~1.5–2.5 min):
 *   idle-close       raw socket: one keep-alive request, then time until the SERVER closes it.
 *                    This is the check that matters: it must be > the proxy idle timeout.
 *   header           two requests on one pooled connection: the second must reuse the socket.
 *                    The Keep-Alive response header is optional in HTTP/1.1 (Node and Apache send
 *                    it, most servers do not) — asserted only when present: timeout=N.
 *   reuse            http.Agent({ keepAlive: true, maxSockets: 1 }): request, idle X s, request
 *                    again → same socket below N, a clean new socket above N, never an error.
 *                    Node's agent drops a pooled socket ~1 s before a Keep-Alive hint, so
 *                    "closed by" shows who ended the first socket; (N-1, N] is a race → SKIP.
 *   headers-timeout  (Node only, opt-in) send half a request head and time until the server gives
 *                    up. Node only checks every connectionsCheckingInterval (30 s), so the close
 *                    lands anywhere in [headersTimeout, headersTimeout + 30 s].
 *
 * Behind a load balancer the numbers describe the client↔LB hop (the LB's own idle timeout; ALB
 * does not forward the server's Keep-Alive header) — use it there to report, not with --expect.
 */
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { setTimeout as sleep } from 'node:timers/promises'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const base = args.find((a) => !a.startsWith('--'))
if (!base) {
  console.error('usage: node check-keepalive.mjs <baseUrl> [--expect=65] [--slack=1] [--path=/health] [--idle=10,30,62,70] [--checks=…] [--headers-timeout=S] [--max-wait=S]')
  process.exit(2)
}
const url = new URL(flag('path', '/health'), base)
const isHttps = url.protocol === 'https:'
const port = Number(url.port) || (isHttps ? 443 : 80)
const expect = flag('expect') ? Number(flag('expect')) : undefined
const slack = Number(flag('slack', '1'))
const idles = flag('idle', '10,30,62,70').split(',').map(Number)
const checks = flag('checks', 'header,idle-close,reuse').split(',')
const expectedHeadersTimeout = Number(flag('headers-timeout', (expect ?? 0) + 1))
const maxWait = Number(flag('max-wait', Math.max(180, (expect ?? 0) + 45)))

const t0 = Date.now()
const elapsed = (from) => ((Date.now() - from) / 1000).toFixed(1)
const log = (msg) => console.log(`[${elapsed(t0).padStart(6)}s] ${msg}`)
const failures = []
const verdict = (name, ok, detail) => {
  if (expect === undefined) return detail
  if (!ok) failures.push(name)
  return `${ok ? 'PASS' : 'FAIL'}  ${detail}`
}

function openRawSocket() {
  return new Promise((resolve, reject) => {
    const socket = isHttps
      ? tls.connect({ host: url.hostname, port, servername: url.hostname }, () => resolve(socket))
      : net.connect({ host: url.hostname, port }, () => resolve(socket))
    socket.once('error', reject)
  })
}

// Resolves with the close time (ms) or null if the server kept the socket open past maxWait.
function waitForClose(socket) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.destroy()
      resolve(null)
    }, maxWait * 1000)
    socket.once('close', () => {
      clearTimeout(timer)
      resolve(Date.now())
    })
  })
}

const requestHead = `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.host}\r\nConnection: keep-alive\r\nUser-Agent: check-keepalive\r\n`

function get(agent) {
  return new Promise((resolve, reject) => {
    const req = (isHttps ? https : http).get(url, { agent, headers: { 'User-Agent': 'check-keepalive' } }, (res) => {
      // Grab the socket now — by 'end' the agent has already detached it (res.socket === null).
      const { socket } = res
      const { localPort } = socket
      res.resume()
      res.on('end', () => resolve({
        status: res.statusCode,
        keepAlive: res.headers['keep-alive'] ?? '(none)',
        localPort,
        reused: req.reusedSocket,
        socket,
      }))
    })
    req.once('error', reject)
  })
}

async function checkHeader() {
  const agent = new (isHttps ? https : http).Agent({ keepAlive: true, maxSockets: 1 })
  const first = await get(agent)
  const second = await get(agent)
  agent.destroy()
  // Keep-Alive is optional; when sent it is "timeout=N" or "timeout=N, max=M" (Apache).
  const timeoutOf = (value) => /timeout=(\d+)/.exec(value)?.[1]
  const advertised = [first.keepAlive, second.keepAlive].filter((v) => v !== '(none)')
  const headerOk = advertised.every((v) => timeoutOf(v) === String(expect))
  const note = advertised.length ? '' : ' — no Keep-Alive header (optional, not asserted)'
  return verdict('header', second.reused && headerOk,
    `#1 ${first.status} Keep-Alive: ${first.keepAlive} | #2 ${second.status} Keep-Alive: ${second.keepAlive} (reused=${second.reused}, port ${first.localPort}→${second.localPort})${note}`)
}

async function checkIdleClose() {
  const socket = await openRawSocket()
  let lastData = 0
  let head = ''
  socket.on('data', (chunk) => {
    lastData = Date.now()
    if (head.length < 2048) head += chunk.toString('latin1')
  })
  socket.on('error', () => {})
  socket.write(`${requestHead}\r\n`)
  const closedAt = await waitForClose(socket)
  const status = head.split('\r\n')[0]
  const keepAlive = /^keep-alive:\s*(.*)$/im.exec(head)?.[1] ?? '(none)'
  if (closedAt === null) {
    return verdict('idle-close', false, `${status} | Keep-Alive: ${keepAlive} | still open after ${maxWait}s`)
  }
  const idle = (closedAt - lastData) / 1000
  const ok = expect !== undefined && idle >= expect - 0.5 && idle <= expect + slack
  return verdict('idle-close', ok, `${status} | Keep-Alive: ${keepAlive} | server closed the idle socket after ${idle.toFixed(2)}s (allowed ${expect ?? '?'}-0.5…+${slack}s)`)
}

async function checkReuse(idle) {
  const agent = new (isHttps ? https : http).Agent({ keepAlive: true, maxSockets: 1 })
  const first = await get(agent)
  const sock = first.socket
  const doneAt = Date.now()
  let closedBy = 'still open'
  sock.once('timeout', () => { if (closedBy === 'still open') closedBy = `client agent (Keep-Alive hint) @${elapsed(doneAt)}s` })
  sock.once('end', () => { if (closedBy === 'still open') closedBy = `server FIN @${elapsed(doneAt)}s` })
  await sleep(idle * 1000)
  let second
  try {
    second = await get(agent)
  } catch (err) {
    second = { error: err.code || err.message }
  }
  agent.destroy()
  const name = `reuse ${idle}s`
  const detail = second.error
    ? `#2 ERROR ${second.error} | first socket closed by: ${closedBy}`
    : `#1 ${first.status} → idle ${idle}s → #2 ${second.status} reused=${second.reused} port ${first.localPort}→${second.localPort} | first socket closed by: ${closedBy}`
  if (expect === undefined) return detail
  // Agent hint buffer is ~1s, so (expect-1, expect] is a race window — report it, don't judge it.
  if (idle > expect - 1 && idle <= expect) return `SKIP  ${detail} (inside the ±1s race window)`
  const shouldReuse = idle < expect - 1
  const ok = !second.error && second.status === first.status
    && second.reused === shouldReuse && (second.localPort === first.localPort) === shouldReuse
  return verdict(name, ok, detail)
}

async function checkHeadersTimeout() {
  const socket = await openRawSocket()
  let head = ''
  socket.on('data', (chunk) => { head += chunk.toString('latin1') })
  socket.on('error', () => {})
  const start = Date.now()
  socket.write(requestHead) // no terminating blank line → request head never completes
  const closedAt = await waitForClose(socket)
  const reply = head.split('\r\n')[0] || '(no response bytes)'
  if (closedAt === null) {
    return verdict('headers-timeout', false, `still open after ${maxWait}s`)
  }
  const secs = (closedAt - start) / 1000
  const headersTimeout = expectedHeadersTimeout
  const ok = expect !== undefined && secs >= headersTimeout - 0.5 && secs <= headersTimeout + 32
  return verdict('headers-timeout', ok, `incomplete head held ${secs.toFixed(2)}s before close | server replied: ${reply}`)
}

log(`target ${url.href}${expect !== undefined ? ` | expect idle keep-alive=${expect}s (+${slack}s slack)${checks.includes('headers-timeout') ? ` headersTimeout=${expectedHeadersTimeout}s` : ''}` : ''} | max wait ${maxWait}s`)
const tasks = []
const run = (name, fn) => tasks.push(fn().then(
  (res) => log(`${name.padEnd(16)} ${res}`),
  (err) => {
    failures.push(name)
    log(`${name.padEnd(16)} ERROR ${err.code || err.message}`)
  },
))
if (checks.includes('header')) run('header', checkHeader)
if (checks.includes('idle-close')) run('idle-close', checkIdleClose)
if (checks.includes('reuse')) for (const idle of idles) run(`reuse ${idle}s`, () => checkReuse(idle))
if (checks.includes('headers-timeout')) run('headers-timeout', checkHeadersTimeout)
log(`running ${tasks.length} check(s) in parallel…`)
await Promise.all(tasks)

if (expect !== undefined || failures.length) {
  log(failures.length ? `FAILED: ${failures.join(', ')}` : 'ALL PASS')
}
process.exit(failures.length ? 1 : 0)
