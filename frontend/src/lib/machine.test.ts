import { describe, expect, it } from 'vitest'

import type { ExplainNode, SyntaxNode } from '../api/client'
import { buildMachine, machineState, PORT } from './machine'
import { buildTimeline } from './universe'

const syntax = (
  kind: SyntaxNode['kind'],
  label: string,
  start: number,
  end: number,
  children: SyntaxNode[] = [],
): SyntaxNode => ({ id: `${start}:${end}`, kind, label, text: label, start, end, children })

// ∃y R(x, y)  →  exists(0..10) ⟶ pred R(3..10) ⟶ var x, var y
const tree = syntax('exists', '∃y', 0, 10, [
  syntax('pred', 'R', 3, 10, [syntax('var', 'x', 5, 6), syntax('var', 'y', 8, 9)]),
])

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

// Con x ↦ 1: y ↦ 1 falla, y ↦ 2 es el testigo.
const leaf = (id: string, y: string, value: boolean) =>
  explain(id, {
    start: 3,
    end: 10,
    value,
    decisive: value,
    binding: { var: 'y', value: y },
    env: [
      { var: 'x', value: '1' },
      { var: 'y', value: y },
    ],
    atom: { symbol: 'R', args: ['1', y] },
  })
const root = explain('e', {
  rule: 'existencial',
  justification: 'testigo',
  env: [{ var: 'x', value: '1' }],
  children: [leaf('r1', '1', false), leaf('r2', '2', true)],
})

describe('buildMachine', () => {
  it('pone una estación por subfórmula, sin los términos, con la raíz arriba', () => {
    const machine = buildMachine(tree)
    expect(machine.stations.map((s) => `${s.kind}:${s.key}`)).toEqual(['exists:0:10', 'pred:3:10'])
    const [loop, sensor] = machine.stations
    expect(loop.children).toEqual(['3:10'])
    expect(sensor.parent).toBe('0:10')
    expect(sensor.y).toBeLessThan(loop.y)
  })

  it('centra cada compuerta sobre sus entradas', () => {
    const and = syntax('and', '∧', 0, 9, [
      syntax('pred', 'P', 0, 4, [syntax('var', 'x', 2, 3)]),
      syntax('pred', 'Q', 5, 9, [syntax('var', 'x', 7, 8)]),
    ])
    const { byKey, width } = buildMachine(and, { dx: 4 })
    expect(byKey.get('0:9')!.x).toBe(0)
    expect(byKey.get('0:4')!.x).toBe(-2)
    expect(byKey.get('5:9')!.x).toBe(2)
    expect(width).toBe(4)
  })
})

describe('machineState', () => {
  const machine = buildMachine(tree)
  const timeline = buildTimeline(root)
  // Pasos: 0 entra al bucle, 1 sensor con y=1, 2 sensor con y=2, 3 el bucle concluye.

  it('al empezar, el entorno baja por el puerto hasta el bucle', () => {
    const state = machineState(machine, timeline, 0)
    expect(state.stations.get('0:10')!.status).toBe('active')
    expect(state.stations.get('3:10')!.status).toBe('idle')
    expect(state.packets).toEqual([
      { from: PORT, to: '0:10', direction: 'down', label: 'x = 1', value: null },
    ])
    expect(state.output).toBeNull()
  })

  it('el sensor recibe el elemento a probar y su respuesta sube enseguida', () => {
    const state = machineState(machine, timeline, 1)
    expect(state.stations.get('3:10')).toMatchObject({ status: 'active', value: false })
    expect(state.stations.get('0:10')!.status).toBe('working')
    expect(state.stations.get('0:10')!.progress!.items.map((i) => i.status)).toEqual([
      'falla',
      'pendiente',
    ])
    expect(state.packets).toEqual([
      { from: '0:10', to: '3:10', direction: 'down', label: 'y = 1', value: null },
      { from: '3:10', to: '0:10', direction: 'up', label: null, value: false },
    ])
  })

  it('al concluir, el resultado sale por el puerto', () => {
    const state = machineState(machine, timeline, 3)
    expect(state.stations.get('0:10')).toMatchObject({ status: 'active', value: true })
    expect(state.packets).toEqual([
      { from: '0:10', to: PORT, direction: 'up', label: null, value: true },
    ])
    expect(state.output).toBe(true)
  })
})
