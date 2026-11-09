import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Evaluation, ExplainNode } from '../api/client'
import { ResultPanel } from './ResultPanel'

const leaf = (value: boolean, binding: string, decisive: boolean): ExplainNode => ({
  id: `n-${binding}`,
  formula: 'R(x)',
  start: 3,
  end: 7,
  env_label: `l[x↦${binding}]`,
  env: [{ var: 'x', value: binding }],
  value,
  rule: 'predicado',
  reason: `${binding} ${value ? '∈' : '∉'} Rᴵ, por lo tanto ℐ ${value ? '⊨' : '⊭'}_{l[x↦${binding}]} R(x).`,
  decisive,
  justification: null,
  binding: { var: 'x', value: binding },
  computations: [],
  pruned: false,
  children: [],
})

const valid: Evaluation = {
  ok: true,
  diagnostics: [],
  value: true,
  summary: 'Verdadero. ℐ ⊨_{l} ∃x R(x); testigo: x ↦ b. b ∈ Rᴵ.',
  explanation: {
    ...leaf(true, 'b', true),
    id: 'root',
    formula: '∃x R(x)',
    env_label: 'l',
    env: [],
    rule: 'existencial',
    reason: 'Testigo: x ↦ b. ℐ ⊨_{l[x↦b]} R(x), por lo tanto ℐ ⊨_{l} ∃x R(x).',
    justification: 'testigo',
    binding: null,
    children: [leaf(false, 'a', false), leaf(true, 'b', true)],
  },
  truncated: false,
  node_count: 3,
  free_vars: [],
  parenthesized: '∃x R(x)',
}

const props = { error: null, pending: false, stale: false, onEvaluate: () => {} }

describe('ResultPanel', () => {
  it('muestra el veredicto en la notación del curso y el testigo', () => {
    render(<ResultPanel evaluation={valid} {...props} />)
    expect(screen.getByRole('status')).toHaveTextContent('Verdadero')
    expect(screen.getByRole('status')).toHaveTextContent('ℐ ⊨ ∃x R(x)')
    expect(screen.getAllByText('Testigo.').length).toBeGreaterThan(0)
  })

  it('una entrada inválida no muestra valor de verdad', () => {
    const invalid: Evaluation = {
      ...valid,
      ok: false,
      value: null,
      summary: null,
      explanation: null,
      diagnostics: [
        {
          code: 'E-REL-001',
          severity: 'error',
          message: 'La relación Rᴵ está vacía; debe contener al menos una tupla.',
          location: { kind: 'predicate', start: null, end: null, path: ['R'] },
        },
      ],
    }
    render(<ResultPanel evaluation={invalid} {...props} />)
    expect(screen.queryByText('Verdadero')).not.toBeInTheDocument()
    expect(screen.queryByText('Falso')).not.toBeInTheDocument()
    expect(screen.getByText(/No se puede evaluar: hay 1 error/)).toBeInTheDocument()
    expect(screen.getByText(/La relación Rᴵ está vacía/)).toBeInTheDocument()
  })

  it('avisa cuando el resultado quedó desactualizado', () => {
    render(<ResultPanel evaluation={valid} {...props} stale />)
    expect(screen.getByText(/Cambiaste la entrada después de evaluar/)).toBeInTheDocument()
  })
})
