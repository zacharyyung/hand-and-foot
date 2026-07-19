const AUTO_SORT_KEY = 'hand-and-foot-auto-sort'

export function loadAutoSortPreference(): boolean {
  try {
    return localStorage.getItem(AUTO_SORT_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveAutoSortPreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SORT_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore storage errors
  }
}

const AI_DEBUG_KEY = 'hand-and-foot-ai-debug'

export function loadAiDebugPreference(): boolean {
  try {
    return localStorage.getItem(AI_DEBUG_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveAiDebugPreference(enabled: boolean): void {
  try {
    localStorage.setItem(AI_DEBUG_KEY, enabled ? 'true' : 'false')
  } catch {
    // ignore storage errors
  }
}
