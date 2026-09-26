import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, isAbsolute, join, basename } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export interface VerificationInvocation {
  executable: string
  args: string[]
}

async function available(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function windowsPathCandidates(name: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('where.exe', [name], {
      cwd: dirname(process.execPath),
      shell: false,
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: 20_000
    })
    return stdout
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(isAbsolute)
  } catch {
    return []
  }
}

/** npm's Windows shim is a batch file, not a native executable. Never concatenate a shell command. */
export async function resolveVerificationCommand(
  command: string,
  args: string[]
): Promise<VerificationInvocation> {
  if (process.platform !== 'win32') return { executable: command, args }
  const name = basename(command).toLowerCase()
  const manager = name.replace(/\.cmd$/, '')
  if (manager === 'npm' || manager === 'npx') {
    const shims = isAbsolute(command) ? [command] : await windowsPathCandidates(`${manager}.cmd`)
    const nodes = await windowsPathCandidates('node.exe')
    for (const shim of shims) {
      const directory = dirname(shim)
      const script = join(directory, 'node_modules', 'npm', 'bin', `${manager}-cli.js`)
      if (!(await available(script))) continue
      const siblingNode = join(directory, 'node.exe')
      const node = (await available(siblingNode)) ? siblingNode : nodes[0]
      if (node) return { executable: node, args: [script, ...args] }
    }
    throw new Error(
      `Cannot locate the installed Node.js and ${manager} CLI. Install Node.js with npm and restart Orchestrator, or configure a native executable with its script arguments.`
    )
  }
  if (/\.(cmd|bat)$/i.test(command) || ['pnpm', 'yarn'].includes(name)) {
    throw new Error(
      'Windows batch wrappers cannot be executed safely without a shell. Configure the native executable (for example node.exe) and its CLI script as separate arguments.'
    )
  }
  return { executable: command, args }
}
