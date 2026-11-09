import { describe, expect, it } from 'vitest'

import {
  allTuples,
  emptyProject,
  fromProjectIn,
  toInterpretation,
  toProjectIn,
  tupleKey,
  type Project,
} from './project'

const project: Project = {
  ...emptyProject,
  constants: ['c'],
  functions: [{ name: 'f', arity: 1 }],
  predicates: [{ name: 'P', arity: 2 }],
  domain: ['a', 'b'],
  constantValues: { c: 'a', old: 'b' },
  functionTables: { f: { [tupleKey(['a'])]: 'b', [tupleKey(['b'])]: 'a' }, g: {} },
  relations: { P: [['a', 'b']], Q: [['a']] },
  formula: 'P(x, c)',
  environment: { x: 'a', z: 'b' },
}

describe('allTuples', () => {
  it('genera 𝒟ⁿ en el orden del dominio', () => {
    expect(allTuples(['a', 'b'], 2)).toEqual([
      ['a', 'a'],
      ['a', 'b'],
      ['b', 'a'],
      ['b', 'b'],
    ])
    expect(allTuples(['1', '2', '3'], 1)).toEqual([['1'], ['2'], ['3']])
    expect(allTuples(['a', 'b', 'c'], 3)).toHaveLength(27)
  })
})

describe('conversión al formato de la API', () => {
  it('solo envía símbolos declarados', () => {
    const interpretation = toInterpretation(project)
    expect(interpretation.constants).toEqual({ c: 'a' })
    expect(Object.keys(interpretation.functions ?? {})).toEqual(['f'])
    expect(interpretation.functions?.f).toEqual([
      { args: ['a'], value: 'b' },
      { args: ['b'], value: 'a' },
    ])
    expect(interpretation.predicates).toEqual({ P: [['a', 'b']] })
  })

  it('filtra el entorno por las variables libres', () => {
    expect(toProjectIn(project, ['x']).environment).toEqual({ x: 'a' })
    expect(toProjectIn(project).environment).toEqual({ x: 'a', z: 'b' })
  })

  it('ida y vuelta con fromProjectIn', () => {
    const again = fromProjectIn(toProjectIn(project))
    expect(again.functionTables.f).toEqual(project.functionTables.f)
    expect(again.relations).toEqual({ P: [['a', 'b']] })
    expect(again.formula).toBe('P(x, c)')
  })

  it('tolera proyectos incompletos', () => {
    expect(fromProjectIn({ formula: 'P(a)' } as never)).toEqual({ ...emptyProject, formula: 'P(a)' })
  })
})
