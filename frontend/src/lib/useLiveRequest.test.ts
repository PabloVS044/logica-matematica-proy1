import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useLiveRequest } from './useLiveRequest'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

/** Servidor falso: cada petición queda abierta hasta que la prueba la responde. */
function server() {
  const open = new Map<string, (value: string) => void>()
  const fetcher = (input: string) =>
    new Promise<string>((resolve) => open.set(input, (value) => resolve(value)))
  const answer = async (input: string) => {
    await act(async () => {
      open.get(input)?.(`respuesta a ${input}`)
    })
  }
  return { fetcher, answer }
}

describe('useLiveRequest', () => {
  it('nunca presenta la respuesta de una entrada anterior como actual', async () => {
    const { fetcher, answer } = server()
    const { result, rerender } = renderHook(({ input }) => useLiveRequest(input, fetcher, 300), {
      initialProps: { input: 'a' },
    })
    act(() => vi.advanceTimersByTime(300))
    await answer('a')
    expect(result.current).toMatchObject({ data: 'respuesta a a', pending: false })

    rerender({ input: 'b' })
    expect(result.current.pending).toBe(true)
    // Terminó la espera y salió la petición nueva, pero aún no responde.
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toMatchObject({ data: 'respuesta a a', pending: true })
    await answer('b')
    expect(result.current).toMatchObject({ data: 'respuesta a b', pending: false })
  })

  it('desactivada no queda pendiente', () => {
    const { result } = renderHook(() => useLiveRequest('a', server().fetcher, 300, false))
    expect(result.current.pending).toBe(false)
  })
})
