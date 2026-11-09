import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'evaluador-semantico:tema'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* sin preferencias guardadas */
  }
  return 'light' // claro por defecto: se lee mejor en un proyector
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      /* sin preferencias guardadas */
    }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))]
}
