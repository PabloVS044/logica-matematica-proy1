import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { FormulaAnalysis } from '../api/client'
import { FormulaEditor } from './FormulaEditor'

function Harness({
  initial = '',
  analysis = null,
  onSubmit = () => {},
}: {
  initial?: string
  analysis?: FormulaAnalysis | null
  onSubmit?: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <FormulaEditor
      value={value}
      onChange={setValue}
      analysis={analysis}
      analysisError={null}
      onSubmit={onSubmit}
    />
  )
}

describe('FormulaEditor', () => {
  it('los botones insertan el símbolo en el cursor', async () => {
    render(<Harness initial="P(x)" />)
    const box = screen.getByLabelText<HTMLTextAreaElement>('Fórmula')
    box.setSelectionRange(0, 0)
    await userEvent.click(screen.getByRole('button', { name: 'Insertar para todo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Insertar negación' }))
    expect(box.value).toBe('∀¬P(x)')
  })

  it('incluye un botón por cada símbolo pedido', () => {
    render(<Harness />)
    const toolbar = screen.getByRole('toolbar', { name: 'Símbolos lógicos' })
    const symbols = [...toolbar.querySelectorAll('button')].map((b) => b.textContent)
    expect(symbols).toEqual(expect.arrayContaining(['¬', '∧', '∨', '→', '∀', '∃', '(', ')']))
  })

  it('convierte los atajos de teclado', async () => {
    render(<Harness />)
    const box = screen.getByLabelText<HTMLTextAreaElement>('Fórmula')
    await userEvent.type(box, '\\Ax P(x) -> ~Q(x)')
    expect(box.value).toBe('∀x P(x) → ¬Q(x)')
  })

  it('Ctrl+Enter evalúa', () => {
    const onSubmit = vi.fn()
    render(<Harness onSubmit={onSubmit} />)
    fireEvent.keyDown(screen.getByLabelText('Fórmula'), { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('marca la posición del error y muestra el mensaje', () => {
    const analysis: FormulaAnalysis = {
      ok: false,
      diagnostics: [
        {
          code: 'E-SYN-001',
          severity: 'error',
          message: "Se esperaba un término, pero se encontró '∧'.",
          location: { kind: 'formula', start: 5, end: 6, path: [] },
        },
      ],
      parenthesized: null,
      free_vars: [],
      occurrences: [],
      syntax_tree: null,
    }
    const { container } = render(<Harness initial="P(x, ∧)" analysis={analysis} />)
    expect(container.querySelector('mark')?.textContent).toBe('∧')
    expect(screen.getByText(/Se esperaba un término/)).toBeInTheDocument()
  })
})
