/**
 * Operaciones puras sobre el proyecto. Mantienen la interpretación coherente con el
 * lenguaje y el dominio: al renombrar un símbolo se mueve su tabla, al cambiar la
 * aridad se borra, y al quitar un elemento de 𝒟 se eliminan las filas que lo usan.
 */
import { keyTuple, tupleKey, type Project, type SymbolDecl } from './project'

export type SymbolKind = 'functions' | 'predicates'

function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (from === to || !(from in record)) return record
  const { [from]: value, ...rest } = record
  return { ...rest, [to]: value }
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const { [key]: _removed, ...rest } = record
  return rest
}

// ------------------------------------------------------------------ lenguaje

export function addConstant(p: Project, name: string): Project {
  return { ...p, constants: [...p.constants, name] }
}

export function renameConstant(p: Project, index: number, name: string): Project {
  const old = p.constants[index]
  const constants = p.constants.map((c, i) => (i === index ? name : c))
  return { ...p, constants, constantValues: renameKey(p.constantValues, old, name) }
}

export function removeConstant(p: Project, index: number): Project {
  const name = p.constants[index]
  return {
    ...p,
    constants: p.constants.filter((_, i) => i !== index),
    constantValues: withoutKey(p.constantValues, name),
  }
}

export function addSymbol(p: Project, kind: SymbolKind, decl: SymbolDecl): Project {
  return { ...p, [kind]: [...p[kind], decl] }
}

export function updateSymbol(
  p: Project,
  kind: SymbolKind,
  index: number,
  decl: SymbolDecl,
): Project {
  const old = p[kind][index]
  const declarations = p[kind].map((d, i) => (i === index ? decl : d))
  const tablesKey = kind === 'functions' ? 'functionTables' : 'relations'
  let tables: Record<string, unknown> = p[tablesKey]
  if (old.arity !== decl.arity) {
    tables = withoutKey(tables, old.name) // la tabla anterior ya no tiene sentido
  } else {
    tables = renameKey(tables, old.name, decl.name)
  }
  return { ...p, [kind]: declarations, [tablesKey]: tables }
}

export function removeSymbol(p: Project, kind: SymbolKind, index: number): Project {
  const name = p[kind][index].name
  const tablesKey = kind === 'functions' ? 'functionTables' : 'relations'
  return {
    ...p,
    [kind]: p[kind].filter((_, i) => i !== index),
    [tablesKey]: withoutKey(p[tablesKey] as Record<string, unknown>, name),
  }
}

// ------------------------------------------------------------------ dominio

export function addElement(p: Project, element: string): Project {
  return { ...p, domain: [...p.domain, element] }
}

export function removeElement(p: Project, element: string): Project {
  const keep = (value: string) => value !== element
  const constantValues = Object.fromEntries(
    Object.entries(p.constantValues).filter(([, value]) => keep(value)),
  )
  const functionTables = Object.fromEntries(
    Object.entries(p.functionTables).map(([name, table]) => [
      name,
      Object.fromEntries(
        Object.entries(table).filter(([key, value]) => keep(value) && keyTuple(key).every(keep)),
      ),
    ]),
  )
  const relations = Object.fromEntries(
    Object.entries(p.relations).map(([name, rows]) => [name, rows.filter((row) => row.every(keep))]),
  )
  const environment = Object.fromEntries(
    Object.entries(p.environment).filter(([, value]) => keep(value)),
  )
  return {
    ...p,
    domain: p.domain.filter(keep),
    constantValues,
    functionTables,
    relations,
    environment,
  }
}

// ------------------------------------------------------------------ interpretación

export function setConstantValue(p: Project, name: string, value: string): Project {
  return { ...p, constantValues: { ...p.constantValues, [name]: value } }
}

export function setFunctionValue(
  p: Project,
  name: string,
  tuple: readonly string[],
  value: string,
): Project {
  const table = { ...(p.functionTables[name] ?? {}) }
  if (value === '') delete table[tupleKey(tuple)]
  else table[tupleKey(tuple)] = value
  return { ...p, functionTables: { ...p.functionTables, [name]: table } }
}

export function fillFunction(
  p: Project,
  name: string,
  tuples: readonly (readonly string[])[],
  value: string,
): Project {
  const table = Object.fromEntries(tuples.map((tuple) => [tupleKey(tuple), value]))
  return { ...p, functionTables: { ...p.functionTables, [name]: table } }
}

const sameTuple = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i])

export function hasTuple(p: Project, name: string, tuple: readonly string[]): boolean {
  return (p.relations[name] ?? []).some((row) => sameTuple(row, tuple))
}

export function toggleTuple(p: Project, name: string, tuple: readonly string[]): Project {
  const rows = p.relations[name] ?? []
  const next = hasTuple(p, name, tuple)
    ? rows.filter((row) => !sameTuple(row, tuple))
    : [...rows, [...tuple]]
  return { ...p, relations: { ...p.relations, [name]: next } }
}

// ------------------------------------------------------------------ fórmula y entorno

export function setEnvironmentValue(p: Project, variable: string, value: string): Project {
  return { ...p, environment: { ...p.environment, [variable]: value } }
}
