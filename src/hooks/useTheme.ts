import { useState, useEffect, useCallback } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'portfolio.theme.v1'

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* storage can be blocked; fall through to the system preference */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/**
 * Charts paint with SVG attributes rather than classes, so they need the
 * theme as a value. Watching the root class keeps them in sync without
 * threading a prop through every page.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const root = document.documentElement
    const observer = new MutationObserver(() =>
      setIsDark(root.classList.contains('dark'))
    )
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    setIsDark(root.classList.contains('dark'))
    return () => observer.disconnect()
  }, [])

  return isDark
}

export function chartTheme(isDark: boolean) {
  return {
    grid: isDark ? '#1f2937' : '#f3f4f6',
    tick: isDark ? '#9ca3af' : '#6b7280',
    label: isDark ? '#e5e7eb' : '#374151',
    muted: isDark ? '#6b7280' : '#9ca3af',
    tooltip: {
      borderRadius: '8px',
      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
      backgroundColor: isDark ? '#111827' : '#ffffff',
      color: isDark ? '#f3f4f6' : '#111827',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    },
    // A pie series has no colour of its own, so Recharts writes its tooltip
    // rows in black: unreadable on the dark tooltip without this.
    tooltipItem: { color: isDark ? '#f3f4f6' : '#111827' },
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* nothing to do */
    }
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    []
  )

  return { theme, toggle, isDark: theme === 'dark' }
}
