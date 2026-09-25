import readline from 'node:readline'
import { appendFileSync } from 'node:fs'

const input = readline.createInterface({ input: process.stdin })
const callLog = process.argv[2]
const calledMethods = []
const resumedThreads = new Set()
let threadNumber = 0
let turnNumber = 0

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

input.on('line', (line) => {
  const message = JSON.parse(line)
  const { id, method, params = {} } = message
  if (method) {
    calledMethods.push(method)
    if (callLog) appendFileSync(callLog, `${method}\n`)
  }

  if (method === 'initialize') {
    send({ id, result: { serverInfo: { name: 'fixture', version: '1.0.0' } } })
    return
  }
  if (method === 'initialized') return
  if (method === 'account/read') {
    send({
      id,
      result: {
        account: { type: 'chatgpt', planType: 'pro', email: 'must-not-be-exposed@example.test' },
        requiresOpenaiAuth: true
      }
    })
    return
  }
  if (method === 'account/rateLimits/read') {
    send({
      id,
      result: {
        rateLimitsByLimitId: {
          codex: {
            limitId: 'codex',
            limitName: 'Codex',
            primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1_900_000_000 },
            secondary: null,
            rateLimitReachedType: null
          }
        },
        rateLimitResetCredits: { availableCount: 2 }
      }
    })
    return
  }
  if (method === 'account/usage/read') {
    send({
      id,
      result: {
        summary: {
          lifetimeTokens: 1234,
          peakDailyTokens: 456,
          longestRunningTurnSec: 80,
          currentStreakDays: 2,
          longestStreakDays: 5
        },
        dailyUsageBuckets: [{ startDate: '2026-09-24', tokens: 321 }]
      }
    })
    return
  }
  if (method === 'thread/list') {
    if (params.useStateDbOnly !== true) {
      send({
        id,
        error: { code: -32602, message: 'History reads must not request scan-and-repair.' }
      })
      return
    }
    const archived = params.archived === true
    const cursor = params.cursor ?? null
    const pages = archived
      ? [
          [
            {
              id: 'fixture-archived',
              name: 'Archived fixture',
              preview: 'Old work',
              createdAt: 100,
              updatedAt: 200,
              cwd: process.cwd(),
              projectId: 'fixture-project',
              source: 'cli',
              model: 'fixture-model',
              status: { type: 'notLoaded' }
            }
          ]
        ]
      : cursor
        ? [
            [
              {
                id: 'fixture-active-2',
                name: 'Second active',
                preview: 'Page two',
                createdAt: 300,
                updatedAt: 400,
                cwd: process.cwd(),
                projectId: 'fixture-project',
                source: 'appServer',
                model: 'fixture-model',
                status: { type: 'notLoaded' }
              }
            ]
          ]
        : [
            [
              {
                id: 'fixture-active-1',
                name: 'First active',
                preview: 'Page one',
                createdAt: 200,
                updatedAt: 500,
                cwd: process.cwd(),
                projectId: 'fixture-project',
                source: 'vscode',
                model: 'fixture-model',
                status: { type: 'notLoaded' }
              }
            ]
          ]
    const data = pages[0]
    send({
      id,
      result: {
        data,
        nextCursor: !archived && !cursor ? 'active-page-two' : null
      }
    })
    return
  }
  if (method === 'thread/read') {
    const turns =
      params.threadId === 'fixture-large'
        ? Array.from({ length: 1_001 }, (_, index) => ({
            id: `fixture-turn-${index}`,
            status: 'completed',
            items: [{ id: `fixture-item-${index}`, type: 'agentMessage', text: `Turn ${index}` }]
          }))
        : [
            {
              id: 'fixture-turn',
              status: 'completed',
              items: [
                {
                  id: 'fixture-user',
                  type: 'userMessage',
                  content: [{ type: 'text', text: 'Read this session.' }]
                },
                {
                  id: 'fixture-agent',
                  type: 'agentMessage',
                  text: 'This transcript is read without resuming.'
                },
                {
                  id: 'fixture-reasoning',
                  type: 'reasoning',
                  content: ['private raw reasoning'],
                  summary: 'Reviewed stored context.'
                }
              ]
            }
          ]
    send({
      id,
      result: {
        thread: {
          id: params.threadId,
          name: 'Read-only fixture transcript',
          ephemeral: false,
          status: { type: 'notLoaded' },
          cwd: process.cwd(),
          projectId: 'fixture-project',
          source: 'vscode',
          model: 'fixture-model',
          turns: params.includeTurns === false ? [] : turns
        }
      }
    })
    return
  }
  if (method === 'thread/loaded/list') {
    send({
      id,
      result: {
        data: [...resumedThreads].map((threadId) => ({ id: threadId, status: { type: 'active' } }))
      }
    })
    return
  }
  if (method === 'thread/start') {
    threadNumber += 1
    send({ id, result: { thread: { id: `fixture-thread-${threadNumber}` } } })
    return
  }
  if (method === 'thread/resume') {
    resumedThreads.add(params.threadId)
    send({ id, result: { thread: { id: params.threadId } } })
    return
  }
  if (method === 'turn/start') {
    turnNumber += 1
    const turnId = `fixture-turn-${turnNumber}`
    send({ id, result: { turn: { id: turnId } } })
    send({ method: 'turn/started', params: { threadId: params.threadId, turn: { id: turnId } } })
    const text = params.input?.[0]?.text ?? ''
    if (text.includes('approval')) {
      send({
        id: 'fixture-approval',
        method: 'item/commandExecution/requestApproval',
        params: { command: 'npm test', reason: 'Fixture approval' }
      })
    } else {
      send({
        method: 'turn/completed',
        params: { threadId: params.threadId, turn: { id: turnId, status: 'completed' } }
      })
    }
    return
  }
  if (method === 'turn/interrupt') {
    send({ id, result: {} })
    return
  }
  if (id === 'fixture-approval' && message.result) {
    send({ method: 'serverRequest/resolved', params: { requestId: 'fixture-approval' } })
    send({
      method: 'turn/completed',
      params: {
        threadId: `fixture-thread-${threadNumber}`,
        turn: { id: `fixture-turn-${turnNumber}`, status: 'completed' }
      }
    })
    return
  }
  if (id !== undefined)
    send({ id, error: { code: -32601, message: `Unsupported method: ${method}` } })
})
