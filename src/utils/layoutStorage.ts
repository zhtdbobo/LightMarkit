const LAYOUT_STORAGE_KEY = 'lightmarkit.layout.v1'

export type LayoutPreferences = {
  sidebarWidth: number
  outlineWidth: number
  leftWidth: number
}

const DEFAULT_LAYOUT: LayoutPreferences = {
  sidebarWidth: 250,
  outlineWidth: 260,
  leftWidth: 50,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function loadLayoutPreferences(): LayoutPreferences {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_LAYOUT }
  }

  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_LAYOUT }
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) {
      return { ...DEFAULT_LAYOUT }
    }

    return {
      sidebarWidth: clamp(
        typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULT_LAYOUT.sidebarWidth,
        180,
        520
      ),
      outlineWidth: clamp(
        typeof parsed.outlineWidth === 'number' ? parsed.outlineWidth : DEFAULT_LAYOUT.outlineWidth,
        180,
        480
      ),
      leftWidth: clamp(
        typeof parsed.leftWidth === 'number' ? parsed.leftWidth : DEFAULT_LAYOUT.leftWidth,
        20,
        80
      ),
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

export function saveLayoutPreferences(preferences: LayoutPreferences): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        sidebarWidth: clamp(preferences.sidebarWidth, 180, 520),
        outlineWidth: clamp(preferences.outlineWidth, 180, 480),
        leftWidth: clamp(preferences.leftWidth, 20, 80),
      })
    )
  } catch {
    // ignore quota / private mode errors
  }
}
