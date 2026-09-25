export function isTrustedRendererUrl(url: string, developmentUrl?: string): boolean {
  try {
    const candidate = new URL(url)
    if (candidate.protocol === 'app:' && candidate.hostname === '-') return true
    if (!developmentUrl) return false
    return candidate.origin === new URL(developmentUrl).origin
  } catch {
    return false
  }
}
