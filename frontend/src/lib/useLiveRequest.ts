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
  // `answered` es la entrada a la que corresponden `data` y `error`: mientras no sea la
  // actual, el resultado está pendiente aunque la petición nueva aún no haya salido.
  const [state, setState] = useState<{ data: T | null; error: string | null; answered: string | null }>(
    { data: null, error: null, answered: null },
  )

  useEffect(() => {
    // Solo se pide la entrada ya asentada: si siguió cambiando, se espera a la próxima.
    if (!enabled || debouncedKey !== key) return
    const controller = new AbortController()
    fetcher(JSON.parse(debouncedKey) as I, controller.signal)
      .then((data) => setState({ data, error: null, answered: debouncedKey }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof ApiError ? error.message : 'Error inesperado.'
        setState({ data: null, error: message, answered: debouncedKey })
      })
    return () => controller.abort()
    // fetcher se define fuera del componente; solo importa el contenido de la entrada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKey, key, enabled])

  return { data: state.data, error: state.error, pending: enabled && state.answered !== key }
}
