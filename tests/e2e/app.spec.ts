import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import type { OrchestratorApi } from '../../src/shared/contracts/ipc'
import type { CreateJobInput, JobDetail } from '../../src/shared/types/domain'

interface Harness {
  app: ElectronApplication
  page: Page
  dataDirectory: string
  projectDirectory: string
}

const harnesses: Harness[] = []

async function launch(dataDirectory?: string, projectDirectory?: string): Promise<Harness> {
  const data = dataDirectory ?? (await mkdtemp(join(tmpdir(), 'codex-orchestrator-e2e-data-')))
  const project =
    projectDirectory ?? (await mkdtemp(join(tmpdir(), 'codex-orchestrator-e2e-project-')))
  const app = await electron.launch({
    args: [resolve('.')],
    env: {
      ...process.env,
      CODEX_ORCHESTRATOR_DATA_DIR: data,
      CODEX_ORCHESTRATOR_E2E_FAKE_PROVIDER: '1',
      CODEX_ORCHESTRATOR_ENABLE_REAL_POWER_ACTIONS: 'DISABLED_IN_E2E'
    }
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  const harness = { app, page, dataDirectory: data, projectDirectory: project }
  harnesses.push(harness)
  return harness
}

async function closeHarness(harness: Harness, removeDirectories = true): Promise<void> {
  const index = harnesses.indexOf(harness)
  if (index >= 0) harnesses.splice(index, 1)
  await harness.app.close()
  if (removeDirectories) {
    await rm(harness.dataDirectory, { recursive: true, force: true })
    await rm(harness.projectDirectory, { recursive: true, force: true })
  }
}

async function createProject(page: Page, path: string): Promise<string> {
  return page.evaluate(async (projectPath) => {
    const api = (globalThis as unknown as { orchestrator: OrchestratorApi }).orchestrator
    const project = await api.createProject({ name: 'E2E workspace', path: projectPath })
    return project.id
  }, path)
}

function jobInput(
  projectId: string,
  objective: string,
  action: CreateJobInput['powerPolicy']['action'] = 'none'
): CreateJobInput {
  return {
    projectId,
    objective,
    provider: 'fake',
    retryPolicy: { maxAutomaticAttempts: 3, baseDelaySeconds: 5, maxDelaySeconds: 5 },
    verification: [],
    powerPolicy: { action, countdownSeconds: 60, preventSleepWhileActive: true },
    startImmediately: true
  }
}

async function createJob(page: Page, input: CreateJobInput): Promise<string> {
  return page.evaluate(async (job) => {
    const api = (globalThis as unknown as { orchestrator: OrchestratorApi }).orchestrator
    return (await api.createJob(job)).id
  }, input)
}

async function detail(page: Page, jobId: string): Promise<JobDetail> {
  return page.evaluate(async (id) => {
    const api = (globalThis as unknown as { orchestrator: OrchestratorApi }).orchestrator
    return api.getJobDetail(id)
  }, jobId)
}

test.afterEach(async () => {
  for (const harness of harnesses.splice(0)) {
    await harness.app.close()
    await rm(harness.dataDirectory, { recursive: true, force: true })
    await rm(harness.projectDirectory, { recursive: true, force: true })
  }
})

test('creates and completes a job through the desktop UI', async () => {
  const harness = await launch()
  const projectId = await createProject(harness.page, harness.projectDirectory)

  await harness.page.getByRole('button', { name: 'Jobs', exact: true }).click()
  await harness.page.getByRole('button', { name: 'New job' }).click()
  await harness.page.getByLabel('Project').selectOption(projectId)
  await harness.page.getByLabel('Provider').selectOption('fake')
  await harness.page.getByLabel('Objective').fill('Complete the Electron E2E workflow')
  await harness.page.getByRole('button', { name: 'Create and start job' }).click()

  await expect(harness.page.getByText('Completed', { exact: true })).toBeVisible({
    timeout: 10_000
  })
  await expect(harness.page.getByText('Provider completed; verification is running.')).toBeVisible()
  await expect(harness.page.getByText('passed', { exact: true })).toBeVisible()
})

test('surfaces an approval and resumes only after the user approves it', async () => {
  const harness = await launch()
  const projectId = await createProject(harness.page, harness.projectDirectory)
  const jobId = await createJob(
    harness.page,
    jobInput(projectId, '[approval] verify with user consent')
  )

  await expect
    .poll(async () => (await detail(harness.page, jobId)).job.state)
    .toBe('WAITING_FOR_APPROVAL')
  await harness.page.getByRole('button', { name: 'Jobs', exact: true }).click()
  await harness.page.getByText('[approval] verify with user consent', { exact: true }).click()
  await expect(harness.page.getByRole('heading', { name: 'Human decision required' })).toBeVisible()
  await harness.page.getByRole('button', { name: 'Approve once' }).click()
  await expect(harness.page.getByText('Completed', { exact: true })).toBeVisible({
    timeout: 10_000
  })
})

test('persists limit recovery across attempts and cancels simulated power safely', async () => {
  const harness = await launch()
  const projectId = await createProject(harness.page, harness.projectDirectory)
  const limitJobId = await createJob(
    harness.page,
    jobInput(projectId, '[limit] resume the same session')
  )

  await expect
    .poll(async () => (await detail(harness.page, limitJobId)).job.state)
    .toBe('COMPLETED')
  const recovered = await detail(harness.page, limitJobId)
  expect(recovered.attempts).toHaveLength(2)
  expect(new Set(recovered.sessions.map((session) => session.externalId)).size).toBe(1)

  const powerJobId = await createJob(
    harness.page,
    jobInput(projectId, 'Finish with a cancellable simulated shutdown', 'shutdown')
  )
  await expect
    .poll(async () => (await detail(harness.page, powerJobId)).job.state)
    .toBe('COMPLETED')
  await expect(harness.page.getByText('shutdown is scheduled')).toBeVisible()
  await harness.page.getByRole('button', { name: 'Cancel action' }).click()
  await expect(harness.page.getByText('shutdown is scheduled')).toBeHidden()
  expect(
    (await detail(harness.page, powerJobId)).schedules.find((entry) => entry.kind === 'power')
      ?.status
  ).toBe('cancelled')
})

test('reopens the durable database after an application restart', async () => {
  const first = await launch()
  const projectId = await createProject(first.page, first.projectDirectory)
  const jobId = await createJob(first.page, jobInput(projectId, 'Persist across desktop restart'))
  await expect.poll(async () => (await detail(first.page, jobId)).job.state).toBe('COMPLETED')
  const { dataDirectory, projectDirectory } = first
  await closeHarness(first, false)

  const second = await launch(dataDirectory, projectDirectory)
  await second.page.getByRole('button', { name: 'Jobs', exact: true }).click()
  await expect(
    second.page.getByText('Persist across desktop restart', { exact: true })
  ).toBeVisible()
  await expect(second.page.getByText('Completed', { exact: true })).toBeVisible()
})

test('browses fake Codex active and archived history without resuming a thread', async () => {
  const harness = await launch()
  await harness.page.getByRole('button', { name: 'History & sessions', exact: true }).click()

  await expect(harness.page.getByRole('heading', { name: 'Codex conversations' })).toBeVisible()
  await expect(harness.page.getByText('Simulated Codex session', { exact: true })).toBeVisible()
  await expect(harness.page.getByText('Archived simulated session', { exact: true })).toBeVisible()
  await harness.page.getByText('Simulated Codex session', { exact: true }).click()
  await expect(
    harness.page.getByText(
      'This fixture verifies the read-only history UI without contacting Codex.'
    )
  ).toBeVisible()

  await harness.page.getByRole('button', { name: 'Settings', exact: true }).click()
  await harness.page.getByRole('button', { name: 'Connect and refresh Codex data' }).click()
  await expect(harness.page.getByText('simulated', { exact: true }).first()).toBeVisible()
  await expect(harness.page.getByText('Usage lifetime tokens', { exact: true })).toBeVisible()
  await expect(harness.page.getByText('Simulated Codex window', { exact: true })).toBeVisible()
  await expect(harness.page.getByText('Primary: 25% used', { exact: true })).toBeVisible()
})

test('projects and jobs show connected Codex data and continue a saved conversation through the GUI', async () => {
  const harness = await launch()
  await expect(
    harness.page.getByRole('heading', { name: 'Connected Codex workspace' })
  ).toBeVisible()
  await expect(harness.page.getByText('2 conversations across 1 workspace')).toBeVisible()
  await harness.page.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(harness.page.getByRole('heading', { name: 'Codex workspaces' })).toBeVisible()
  await expect(harness.page.getByText('2 conversations')).toBeVisible()
  await harness.page.getByRole('button', { name: 'Register', exact: true }).click()
  await expect(harness.page.getByText('Registered', { exact: true })).toBeVisible()
  await harness.page.getByRole('button', { name: 'Jobs', exact: true }).click()
  await expect(
    harness.page.getByRole('heading', { name: 'Existing Codex conversations' })
  ).toBeVisible()
  await harness.page.getByRole('button', { name: 'Continue', exact: true }).click()
  await harness.page.getByLabel('Objective').fill('Continue the saved Codex session')
  await harness.page.getByRole('button', { name: 'Continue this conversation' }).click()
  await expect(harness.page.getByText('Completed', { exact: true })).toBeVisible({
    timeout: 10_000
  })
  const sessions = await harness.page.evaluate(async () => {
    const api = (globalThis as unknown as { orchestrator: OrchestratorApi }).orchestrator
    const jobs = await api.listJobs()
    return (await api.getJobDetail(jobs[0]!.id)).sessions.map((session) => session.externalId)
  })
  expect(sessions).toEqual(['fixture-codex-thread-active'])
  await harness.page.getByRole('button', { name: 'Activity', exact: true }).click()
  await expect(
    harness.page.getByRole('heading', { name: 'Recent Codex conversations' })
  ).toBeVisible()
})
