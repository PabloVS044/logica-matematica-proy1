import { describe, expect, it } from 'vitest'

import type { ExplainNode } from '../api/client'
import { stepCues } from './stepSounds'
import { buildTimeline } from './universe'

const explain = (id: string, overrides: Partial<ExplainNode>): ExplainNode => ({
  id,
  formula: '',
  start: 0,
  end: 10,
  env_label: 'l',
  env: [],
  value: true,
  rule: 'predicado',
  reason: '',
  decisive: true,
  justification: null,
  binding: null,
  computations: [],
  atom: null,
  spoken: '',
  pruned: false,
  children: [],
  ...overrides,
})

// ∃y R(x, y) con x ↦ 1: y ↦ 1 falla, y ↦ 2 es el testigo.
const leaf = (id: string, y: string, value: boolean) =>
  explain(id, {
    start: 3,
    value,
    decisive: value,
    binding: { var: 'y', value: y },
    atom: { symbol: 'R', args: ['1', y] },
  })
const root = explain('e', {
  rule: 'existencial',
  justification: 'testigo',
  children: [leaf('r1', '1', false), leaf('r2', '2', true)],
})
const timeline = buildTimeline(root)
const binary = new Set(['R'])
const sounds = (index: number, view: 'universo' | 'maquina') =>
  stepCues(timeline, index, view, binary).map((c) => c.sound)

describe('stepCues', () => {
  it('en la máquina, el sensor consulta y la cuenta del cuantificador suena después', () => {
    expect(sounds(0, 'maquina')).toEqual(['compuerta'])
    const cues = stepCues(timeline, 1, 'maquina', binary)
    expect(cues.map((c) => c.sound)).toEqual(['sensor', 'cuentaFalla'])
    expect(cues[1].delay).toBeGreaterThan(0)
  })

  it('en el universo, la flecha existe o no existe y la cuenta sube de tono', () => {
    expect(sounds(1, 'universo')).toEqual(['flechaNoExiste', 'cuentaFalla'])
    const cues = stepCues(timeline, 2, 'universo', binary)
    expect(cues.map((c) => c.sound)).toEqual(['flechaRecorre', 'cuentaCumple'])
    expect(cues[1].rate).toBeGreaterThan(1)
  })

  it('al final suena el testigo y luego el veredicto', () => {
    expect(sounds(3, 'maquina')).toEqual(['testigo', 'verdadero'])
  })

  it('la igualdad usa la balanza', () => {
    const eq = buildTimeline(explain('q', { value: false, atom: { symbol: '=', args: ['1', '2'] } }))
    expect(stepCues(eq, 0, 'universo', binary).map((c) => c.sound)).toEqual([
      'balanzaInclina',
      'falso',
    ])
  })

  it('un paso fuera de rango no suena', () => {
    expect(stepCues(timeline, 99, 'maquina', binary)).toEqual([])
  })
})
