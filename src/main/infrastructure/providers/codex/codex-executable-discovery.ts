import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import { basename, join, resolve, win32 } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ExecutableLocator = (command: string, args: string[]) => Promise<string>

export interface ExecutableDiscoveryOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  locate?: ExecutableLocator
}

async function locateOnPath(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    timeout: 5_000,
    windowsHide: true
  })
  return stdout
}

export function isSupportedCodexExecutable(
  candidate: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const fileName = (
    platform === 'win32' ? win32.basename(candidate) : basename(candidate)
  ).toLowerCase()
  return platform === 'win32' ? fileName === 'codex.exe' : fileName === 'codex'
}

async function isRegularFile(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isFile()
  } catch {
    return false
  }
}

async function windowsInstallCandidates(localAppData: string | undefined): Promise<string[]> {
  if (!localAppData) return []
  const root = join(localAppData, 'OpenAI', 'Codex', 'bin')
  const candidates = [join(root, 'codex.exe')]
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    const modified = await Promise.all(
      folders.map(async (folder) => {
        const folderPath = join(root, folder)
        let changedAt = 0
        try {
          changedAt = (await stat(folderPath)).mtimeMs
        } catch {
          // The folder may be removed while discovery is running.
        }
        return { folderPath, changedAt }
      })
    )
    modified.sort((left, right) => right.changedAt - left.changedAt)
    candidates.push(...modified.map(({ folderPath }) => join(folderPath, 'codex.exe')))
  } catch {
    // A missing app installation is expected when only the CLI is installed on PATH.
  }
  const existing = await Promise.all(
    candidates.map(async (candidate) => ((await isRegularFile(candidate)) ? candidate : null))
  )
  return existing.filter((candidate): candidate is string => candidate !== null)
}

export async function discoverCodexExecutableCandidates(
  options: ExecutableDiscoveryOptions = {}
): Promise<string[]> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const locate = options.locate ?? locateOnPath
  const candidates = platform === 'win32' ? await windowsInstallCandidates(env.LOCALAPPDATA) : []
  const locator = platform === 'win32' ? 'where.exe' : 'which'
  const commandName = platform === 'win32' ? 'codex.exe' : 'codex'

  try {
    const located = await locate(locator, [commandName])
    candidates.push(
      ...located
        .split(/\r?\n/)
        .map((candidate) => candidate.trim())
        .filter(Boolean)
    )
  } catch {
    // A missing PATH entry is expected; callers present an actionable status instead.
  }

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (!isSupportedCodexExecutable(candidate, platform)) return false
    const normalized = resolve(candidate).toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
