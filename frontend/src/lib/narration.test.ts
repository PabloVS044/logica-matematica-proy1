import { describe, expect, it } from 'vitest'

import type { ExplainNode } from '../api/client'
import { narrate, spokenVariable, type PredicateShapes } from './narration'
import type { Step } from './universe'

const shapes: PredicateShapes = { unary: new Set(['P']), binary: new Set(['R']) }

const node = (overrides: Partial<ExplainNode>): ExplainNode => ({
  id: 'n',
  formula: 'φ',
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

const visit = (n: ExplainNode, depth = 1): Step => ({ node: n, phase: 'visit', depth, focus: null })

describe('narrate', () => {
  it('pregunta por la flecha de una relación binaria y dice qué elemento se prueba', () => {
    const atom = node({
      formula: 'R(x, y)',
      value: false,
      atom: { symbol: 'R', args: ['1', '2'] },
      binding: { var: 'y', value: '2' },
    })
    const { title, detail, value } = narrate(visit(atom), shapes)
    expect(title).toBe('Probamos y = 2. ¿Hay una flecha R de 1 a 2? No.')
    expect(detail).toBe('Así que R(x, y) es falsa.')
    expect(value).toBe(false)
  })

  it('habla del anillo en predicados unarios y explica los términos con funciones', () => {
    const atom = node({
      formula: 'P(s(x))',
      atom: { symbol: 'P', args: ['2'] },
      computations: ['⟦x⟧_{l} = l(x) = 1', '⟦s(x)⟧_{l} = sᴵ(1) = 2'],
    })
    const { title, detail } = narrate(visit(atom), shapes)
    expect(title).toBe('¿2 cumple P? (¿tiene el anillo P?) Sí.')
    expect(detail).toBe('Primero se calculan los términos: s(1) = 2. Así que P(s(x)) es verdadera.')
  })

  it('explica la diferencia entre ∀ y ∃ al empezar', () => {
    const child = node({ formula: 'P(x)' })
    expect(narrate(visit(node({ rule: 'universal', children: [child] })), shapes).detail).toMatch(
      /TODOS deben cumplir/,
    )
    expect(narrate(visit(node({ rule: 'existencial', children: [child] })), shapes).detail).toMatch(
      /Basta con encontrar UNO/,
    )
  })

  it('al concluir nombra el testigo o el contraejemplo', () => {
    const exists = node({ rule: 'existencial', formula: '∃y R(x, y)', justification: 'testigo' })
    const witness: Step = {
      node: exists,
      phase: 'conclude',
      depth: 0,
      focus: { var: 'y', value: '3', kind: 'testigo' },
    }
    const { title, detail } = narrate(witness, shapes)
    expect(title).toBe('y = 3 cumple: es un testigo.')
    expect(detail).toBe('Resultado final. Con uno basta: ∃y R(x, y) es VERDADERA.')

    const forall = node({ rule: 'universal', formula: '∀x P(x)', value: false })
    const counter: Step = {
      node: forall,
      phase: 'conclude',
      depth: 1,
      focus: { var: 'x', value: '3', kind: 'contraejemplo' },
    }
    expect(narrate(counter, shapes).title).toBe('x = 3 no cumple: es un contraejemplo.')
  })

  it('explica por qué una implicación con condición falsa es verdadera', () => {
    const implication = node({
      rule: 'implicación',
      formula: 'P(x) → R(x, x)',
      children: [node({ formula: 'P(x)', value: false }), node({ formula: 'R(x, x)', value: false })],
    })
    const step: Step = { node: implication, phase: 'conclude', depth: 1, focus: null }
    expect(narrate(step, shapes).title).toBe('La condición P(x) es falsa: no hay nada que cumplir.')
  })
})


describe('narración en voz alta', () => {
  it('usa la versión hablada de las fórmulas', () => {
    const child = node({ formula: 'P(x)', spoken: 'pe de equis' })
    const forall = node({
      rule: 'universal',
      formula: '∀x P(x)',
      spoken: 'para todo equis pe de equis',
      children: [child],
    })
    const step = { node: forall, phase: 'visit', depth: 0 } as Parameters<typeof narrate>[0]
    expect(narrate(step, shapes, { voice: true }).title).toBe('¿Todos los elementos cumplen pe de equis?')
    expect(narrate(step, shapes).title).toBe('¿Todos los elementos cumplen P(x)?')
  })
})

describe('variables habladas', () => {
  it('dice el nombre de la letra', () => {
    expect(spokenVariable('y')).toBe('i griega')
    expect(spokenVariable('x1')).toBe('equis 1')
  })

  it('el caso de un cuantificador se dice con «vale»', () => {
    const child = node({ formula: 'P(y)', spoken: 'pe de i griega', binding: { var: 'y', value: 'a' } })
    const step = { node: child, phase: 'visit', depth: 1 } as Parameters<typeof narrate>[0]
    expect(narrate(step, shapes, { voice: true }).title).toMatch(/^Probamos i griega vale a\./)
    expect(narrate(step, shapes).title).toMatch(/^Probamos y = a\./)
  })
})
