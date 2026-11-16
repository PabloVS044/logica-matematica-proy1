import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSpeaker } from '../lib/useSpeaker'
import { FakeRecognition, installRecognition, installSynthesis } from '../test/fakeSpeech'
import { FormulaEditor } from './FormulaEditor'

const language = { constants: [], functions: [], predicates: [{ name: 'P', arity: 1 }] }

/** Respuestas del backend según lo dictado. */
function mockApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {}
      let data: unknown = {}
      if (url === '/api/speech/command') {
        const commands: Record<string, string> = { listo: 'aceptar', 'borra eso': 'borrar' }
        data = { command: commands[body.utterance.toLowerCase()] ?? null }
      } else if (url === '/api/speech/translate') {
        const ok = body.transcript === 'para todo x P de x'
        data = ok
          ? {
              ok: true,
              diagnostics: [],
              formula: '∀x P(x)',
              parenthesized: '∀x P(x)',
              spoken: 'para todo equis pe de equis',
              marks: [
                { text: 'para todo', start: 0, end: 9, role: 'palabra clave', meaning: '∀' },
                { text: 'x', start: 10, end: 11, role: 'variable', meaning: 'x' },
              ],
            }
          : {
              ok: false,
              diagnostics: [
                {
                  code: 'E-SPK-002',
                  severity: 'error',
                  message: 'La fórmula quedó incompleta.',
                  location: { kind: 'speech', start: 0, end: 1, path: [] },
                },
              ],
              formula: null,
              parenthesized: null,
              spoken: null,
              marks: [],
            }
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }),
  )
}

function Harness({ onEvaluate = () => {} }: { onEvaluate?: () => void }) {
  const [value, setValue] = useState('')
  const speaker = useSpeaker()
  return (
    <FormulaEditor
      value={value}
      onChange={setValue}
      analysis={null}
      analysisError={null}
      onSubmit={() => {}}
      voice={{ language, speaker, onEvaluate }}
    />
  )
}

let spoken: string[]
beforeEach(() => {
  installRecognition()
  spoken = installSynthesis()
  mockApi()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function dictate(...phrases: string[]) {
  for (const phrase of phrases) {
    act(() => FakeRecognition.last!.say(phrase))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('dictado por voz', () => {
  it('escucha, muestra la fórmula entendida y la inserta con «listo»', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    expect(screen.getByText('Escuchando… di la fórmula')).toBeInTheDocument()
    expect(FakeRecognition.last!.listening).toBe(true)

    await dictate('para todo x P de x')
    await waitFor(() => expect(screen.getByText('∀x P(x)')).toBeInTheDocument())

    await dictate('listo')
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLTextAreaElement>('Fórmula').value).toBe('∀x P(x)'),
    )
    expect(screen.queryByRole('region', { name: 'Dictado por voz' })).not.toBeInTheDocument()
    expect(spoken).toContain('Entendí: para todo equis pe de equis')
    expect(screen.getByText('Se insertó la fórmula dictada.')).toBeInTheDocument()
  })

  it('«borra eso» quita la última frase', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('para todo x P de x', 'R de', 'borra eso')
    await waitFor(() => expect(screen.getByText('Se borró la última frase.')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('∀x P(x)')).toBeInTheDocument())
  })

  it('muestra el error y no deja insertar una fórmula inválida', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('P de')
    await waitFor(() =>
      expect(screen.getByText('La fórmula quedó incompleta.')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'Insertar fórmula' })).toBeDisabled()
  })

  it('el botón Deshacer recupera la fórmula anterior', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('para todo x P de x', 'listo')
    await waitFor(() => screen.getByText('Se insertó la fórmula dictada.'))
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>('Fórmula').value).toBe('')
  })

  it('explica los errores del micrófono', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    act(() => FakeRecognition.last!.fail('not-allowed'))
    expect(screen.getByText(/no tiene permiso para usar el micrófono/)).toBeInTheDocument()
  })

  it('Escape cancela sin insertar', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('para todo x P de x')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Dictado por voz' })).not.toBeInTheDocument()
    expect(screen.getByLabelText<HTMLTextAreaElement>('Fórmula').value).toBe('')
  })

  it('sin reconocimiento de voz el botón queda deshabilitado con la explicación', () => {
    vi.stubGlobal('webkitSpeechRecognition', undefined)
    render(<Harness />)
    const button = screen.getByRole('button', { name: /Dictar/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/Chrome o Edge/))
  })
})

describe('dónde se inserta lo dictado', () => {
  function Prefilled() {
    const [value, setValue] = useState('P(a) ∧ P(b)')
    const speaker = useSpeaker()
    return (
      <FormulaEditor
        value={value}
        onChange={setValue}
        analysis={null}
        analysisError={null}
        onSubmit={() => {}}
        voice={{ language, speaker, onEvaluate: () => {} }}
      />
    )
  }

  it('reemplaza la fórmula completa si no hay selección', async () => {
    render(<Prefilled />)
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('para todo x P de x', 'listo')
    await waitFor(() =>
      expect(screen.getByLabelText<HTMLTextAreaElement>('Fórmula').value).toBe('∀x P(x)'),
    )
  })

  it('reemplaza solo el fragmento seleccionado', async () => {
    render(<Prefilled />)
    const box = screen.getByLabelText<HTMLTextAreaElement>('Fórmula')
    box.setSelectionRange(7, 11) // "P(b)"
    await userEvent.click(screen.getByRole('button', { name: /Dictar/ }))
    await dictate('para todo x P de x', 'listo')
    await waitFor(() => expect(box.value).toBe('P(a) ∧ ∀x P(x)'))
  })
})
