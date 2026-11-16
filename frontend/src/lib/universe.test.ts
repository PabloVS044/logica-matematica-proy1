import { describe, expect, it } from 'vitest'

import type { ExplainNode } from '../api/client'
import {
  binaryEdges,
  buildTimeline,
  layoutDomain,
  quantifierProgress,
  type TimelineMode,
} from './universe'

const node = (id: string, overrides: Partial<ExplainNode> = {}): ExplainNode => ({
  id,
  formula: id,
  start: 0,
  end: 1,
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

// ∃y R(x, y) con testigo y ↦ 2: el primer intento (y ↦ 1) no es decisivo.
const exists = node('∃', {
  rule: 'existencial',
  justification: 'testigo',
  children: [
    node('R11', { value: false, decisive: false, binding: { var: 'y', value: '1' } }),
    node('R12', { binding: { var: 'y', value: '2' } }),
  ],
})

describe('layoutDomain', () => {
  it('da una posición distinta a cada elemento', () => {
    for (const size of [1, 2, 5, 12, 13, 40]) {
      const positions = layoutDomain(size)
      expect(positions).toHaveLength(size)
      expect(new Set(positions.map((p) => p.map((c) => c.toFixed(3)).join()))).toHaveProperty(
        'size',
        size,
      )
    }
  })

  it('separa los elementos lo suficiente para que no se toquen', () => {
    for (const size of [2, 6, 12, 20, 40]) {
      const positions = layoutDomain(size)
      let closest = Infinity
      for (let i = 0; i < size; i++)
        for (let j = i + 1; j < size; j++) {
          closest = Math.min(closest, Math.hypot(...positions[i].map((c, k) => c - positions[j][k])))
        }
      expect(closest).toBeGreaterThan(0.9)
    }
  })
})

// ∃y R(x, y) con testigo y ↦ 2 en 𝒟 = {1, 2, 3}: y ↦ 1 falla antes y y ↦ 3 ya no hace falta.
const search = node('∃', {
  rule: 'existencial',
  formula: '∃y R(x, y)',
  justification: 'testigo',
  children: [
    node('R1', { value: false, decisive: false, binding: { var: 'y', value: '1' } }),
    node('R2', { binding: { var: 'y', value: '2' } }),
    node('R3', { value: false, decisive: false, binding: { var: 'y', value: '3' } }),
  ],
})

describe('buildTimeline', () => {
  it('visita cada nodo y concluye los que tienen hijos, con su testigo', () => {
    const { steps, mode, fellBack, cut } = buildTimeline(exists)
    expect(steps.map((s) => `${s.phase}:${s.node.id}`)).toEqual([
      'visit:∃',
      'visit:R11',
      'visit:R12',
      'conclude:∃',
    ])
    expect(steps[3].focus).toEqual({ var: 'y', value: '2', kind: 'testigo' })
    expect(steps[1].depth).toBe(1)
    expect(mode).toBe('natural')
    expect(fellBack).toBe(false)
    expect(cut).toBe(false)
  })

  it('en modo natural se detiene al encontrar el testigo', () => {
    const ids = (mode: TimelineMode) =>
      buildTimeline(search, { mode }).steps.map((s) => s.node.id)
    expect(ids('natural')).toEqual(['∃', 'R1', 'R2', '∃'])
    expect(ids('completo')).toEqual(['∃', 'R1', 'R2', 'R3', '∃'])
    expect(ids('decisivo')).toEqual(['∃', 'R2', '∃'])
  })

  it('pasa a las ramas decisivas si la animación es muy larga', () => {
    const timeline = buildTimeline(search, { mode: 'completo', maxSteps: 3 })
    expect(timeline.mode).toBe('decisivo')
    expect(timeline.fellBack).toBe(true)
    expect(timeline.steps).toHaveLength(3)
  })

  it('si aún es muy larga, la corta pero conserva la conclusión de la raíz', () => {
    const timeline = buildTimeline(exists, { maxSteps: 2 })
    expect(timeline.cut).toBe(true)
    expect(timeline.steps).toHaveLength(2)
    expect(timeline.steps.at(-1)).toMatchObject({ phase: 'conclude', node: { id: '∃' } })
  })
})

describe('quantifierProgress', () => {
  const statuses = (index: number) =>
    quantifierProgress(buildTimeline(search), index)[0].items.map((i) => `${i.value}:${i.status}`)

  it('marca qué elementos se revisaron, cuál se prueba y cuáles no hacen falta', () => {
    expect(statuses(0)).toEqual(['1:pendiente', '2:pendiente', '3:innecesario'])
    expect(statuses(1)).toEqual(['1:falla', '2:pendiente', '3:innecesario'])
    expect(statuses(2)).toEqual(['1:falla', '2:cumple', '3:innecesario'])
  })

  it('describe el cuantificador y sabe cuándo terminó', () => {
    const timeline = buildTimeline(search)
    expect(quantifierProgress(timeline, 2)[0]).toMatchObject({ kind: '∃', var: 'y', done: false })
    expect(quantifierProgress(timeline, 3)[0].done).toBe(true)
  })

  it('incluye los cuantificadores que contienen al paso, de afuera hacia adentro', () => {
    const forall = node('∀', {
      rule: 'universal',
      formula: '∀x ∃y R(x, y)',
      justification: 'comprobación completa',
      children: [{ ...search, binding: { var: 'x', value: '1' } }],
    })
    const timeline = buildTimeline(forall)
    const leaf = timeline.steps.findIndex((s) => s.node.id === 'R1')
    expect(quantifierProgress(timeline, leaf).map((q) => `${q.kind}${q.var}`)).toEqual([
      '∀x',
      '∃y',
    ])
    expect(quantifierProgress(timeline, leaf)[0].items[0].status).toBe('probando')
  })
})

describe('binaryEdges', () => {
  it('ignora repetidos y elementos fuera del dominio', () => {
    expect(
      binaryEdges(
        [
          ['1', '2'],
          ['1', '2'],
          ['2', '9'],
          ['3', '3'],
        ],
        ['1', '2', '3'],
      ),
    ).toEqual([
      ['1', '2'],
      ['3', '3'],
    ])
  })
})
