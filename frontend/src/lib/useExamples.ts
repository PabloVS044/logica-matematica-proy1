import { useEffect, useState } from 'react'

import { api, type Example } from '../api/client'

/** Ejemplos de las presentaciones del curso; vacío si el servidor no responde. */
export function useExamples(): Example[] {
  const [examples, setExamples] = useState<Example[]>([])
  useEffect(() => {
    api
      .examples()
      .then(setExamples)
      .catch(() => setExamples([]))
  }, [])
  return examples
}
