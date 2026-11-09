import { useEffect, useState } from 'react'

import { ApiError } from '../api/client'
import { useDebounced } from './useDebounced'

export interface LiveResult<T> {
  data: T | null
  error: string | null
  pending: boolean
}

/**
 * Llama a `fetcher` cada vez que `input` cambia (con espera de `delay` ms) y cancela
 * la petición anterior. `input` debe ser serializable: se compara como JSON.
 */
export function useLiveRequest<I, T>(
  input: I,
  fetcher: (input: I, signal: AbortSignal) => Promise<T>,
  delay = 300,
  enabled = true,
): LiveResult<T> {
  const key = JSON.stringify(input)
  const debouncedKey = useDebounced(key, delay)
  const [state, setState] = useState<LiveResult<T>>({ data: null, error: null, pending: false })

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState((s) => ({ ...s, pending: true }))
    fetcher(JSON.parse(debouncedKey) as I, controller.signal)
      .then((data) => setState({ data, error: null, pending: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError ? error.message : 'Error inesperado.'
        setState({ data: null, error: message, pending: false })
      })
    return () => controller.abort()
    // fetcher se define fuera del componente; solo importa el contenido de la entrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, enabled])

  return { ...state, pending: state.pending || key !== debouncedKey }
}
