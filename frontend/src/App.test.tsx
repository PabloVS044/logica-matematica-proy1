import { render, screen, waitFor, within } from '@testing-library/react'
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
  it('muestra la fórmula y abre cada sección de la configuración en un modal', async () => {
    mockApi({ '/examples': [], '/language/validate': { ok: true, diagnostics: [] } })
    render(<App />)
    expect(screen.getByLabelText('Fórmula')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Configuración' })
    for (const [button, heading] of [
      ['Lenguaje', 'Lenguaje'],
      ['Interpretación', 'Interpretación ℐ'],
      ['Entorno', 'Entorno'],
    ]) {
      await userEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${button}`) }))
      const dialog = screen.getByRole('dialog', { name: 'Configuración' })
      expect(within(dialog).getByRole('heading', { name: heading })).toBeInTheDocument()
      expect(within(dialog).getByRole('tab', { name: new RegExp(`^${button}`) })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    }
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con el dominio vacío invita a cargar un ejemplo', async () => {
    mockApi({
      '/examples': [
        {
          id: 'e1',
          title: 'Ejemplo uno',
          description: 'Descripción.',
          project: { version: 1, formula: '∀x P(x)', interpretation: { domain: ['1', '2'] } },
        },
      ],
    })
    render(<App />)
    expect(screen.getByText('Tu universo está vacío')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Ejemplo uno/ }))
    expect(useProjectStore.getState().project.domain).toEqual(['1', '2'])
    expect(screen.getByRole('status')).toHaveTextContent('Se cargó el ejemplo "Ejemplo uno"')
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
