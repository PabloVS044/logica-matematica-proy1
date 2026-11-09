import { describe, expect, it } from 'vitest'

import { emptyProject, tupleKey, type Project } from './project'
import * as ops from './projectOps'

const base: Project = {
  ...emptyProject,
  constants: ['c'],
  functions: [{ name: 'f', arity: 1 }],
  predicates: [{ name: 'P', arity: 1 }],
  domain: ['a', 'b'],
  constantValues: { c: 'b' },
  functionTables: { f: { [tupleKey(['a'])]: 'b', [tupleKey(['b'])]: 'a' } },
  relations: { P: [['a'], ['b']] },
  environment: { x: 'b', y: 'a' },
}

describe('lenguaje', () => {
  it('renombrar una constante conserva su valor', () => {
    const p = ops.renameConstant(base, 0, 'd')
    expect(p.constants).toEqual(['d'])
    expect(p.constantValues).toEqual({ d: 'b' })
  })

  it('renombrar un símbolo mueve su tabla', () => {
    const p = ops.updateSymbol(base, 'functions', 0, { name: 'g', arity: 1 })
    expect(p.functionTables).toEqual({ g: base.functionTables.f })
  })

  it('cambiar la aridad descarta la tabla anterior', () => {
    const p = ops.updateSymbol(base, 'predicates', 0, { name: 'P', arity: 2 })
    expect(p.relations).toEqual({})
  })

  it('quitar un símbolo quita su interpretación', () => {
    const p = ops.removeSymbol(base, 'functions', 0)
    expect(p.functions).toEqual([])
    expect(p.functionTables).toEqual({})
  })
})

describe('dominio', () => {
  it('quitar un elemento elimina todo lo que lo usa', () => {
    const p = ops.removeElement(base, 'b')
    expect(p.domain).toEqual(['a'])
    expect(p.constantValues).toEqual({})
    expect(p.functionTables.f).toEqual({}) // f(a) = b y f(b) = a usan b
    expect(p.relations.P).toEqual([['a']])
    expect(p.environment).toEqual({ y: 'a' })
  })
})

describe('interpretación', () => {
  it('asignar y borrar un valor de función', () => {
    let p = ops.setFunctionValue(base, 'f', ['a'], 'a')
    expect(p.functionTables.f[tupleKey(['a'])]).toBe('a')
    p = ops.setFunctionValue(p, 'f', ['a'], '')
    expect(tupleKey(['a']) in p.functionTables.f).toBe(false)
  })

  it('rellenar una función completa', () => {
    const p = ops.fillFunction(base, 'f', [['a'], ['b']], 'a')
    expect(Object.values(p.functionTables.f)).toEqual(['a', 'a'])
  })

  it('alternar tuplas de una relación', () => {
    let p = ops.toggleTuple(base, 'P', ['a'])
    expect(p.relations.P).toEqual([['b']])
    expect(ops.hasTuple(p, 'P', ['a'])).toBe(false)
    p = ops.toggleTuple(p, 'P', ['a'])
    expect(ops.hasTuple(p, 'P', ['a'])).toBe(true)
  })

  it('no modifica el proyecto original', () => {
    ops.toggleTuple(base, 'P', ['a'])
    ops.removeElement(base, 'a')
    expect(base.relations.P).toEqual([['a'], ['b']])
    expect(base.domain).toEqual(['a', 'b'])
  })
})
