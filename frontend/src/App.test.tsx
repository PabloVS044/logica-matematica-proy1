import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useProjectStore } from './store/projectStore'

function mockApi(responses: Record<string, unknown>) {
  const fetchMock = vi.fn((url: string) => {
    const path = url.replace('/api', '')
    return Promise.resolve({ ok: true, json: () => Promise.resolve(responses[path] ?? {}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  useProjectStore.getState().reset()
})

describe('App', () => {
  it('muestra las secciones principales', () => {
    mockApi({ '/examples': [], '/language/validate': { ok: true, diagnostics: [] } })
    render(<App />)
    for (const name of ['Lenguaje', 'Interpretación ℐ', 'Fórmula', 'Entorno', 'Resultado']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('envía el proyecto al evaluar y muestra el resultado', async () => {
    const fetchMock = mockApi({
      '/examples': [],
      '/evaluate': {
        ok: false,
        value: null,
        diagnostics: [
          {
            code: 'E-DOM-001',
            severity: 'error',
            message: 'El dominio 𝒟 no puede ser vacío.',
            location: { kind: 'domain', start: null, end: null, path: [] },
          },
        ],
      },
    })
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Evaluar' }))
    await waitFor(() => expect(screen.getByText(/No se puede evaluar/)).toBeInTheDocument())
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/evaluate') as unknown as [
      string,
      RequestInit,
    ]
    expect(JSON.parse(call[1].body as string)).toMatchObject({ version: 1, formula: '' })
  })
})
