import type { InterpretationIn, LanguageIn, ProjectIn } from '../api/client'

export interface SymbolDecl {
  name: string
  arity: number
}

/** Estado editable del proyecto. Las tablas de funciones se indexan por tupla. */
export interface Project {
  constants: string[]
  functions: SymbolDecl[]
  predicates: SymbolDecl[]
  domain: string[]
  constantValues: Record<string, string>
  functionTables: Record<string, Record<string, string>>
  relations: Record<string, string[][]>
  formula: string
  environment: Record<string, string>
}

export const emptyProject: Project = {
  constants: [],
  functions: [],
  predicates: [],
  domain: [],
  constantValues: {},
  functionTables: {},
  relations: {},
  formula: '',
  environment: {},
}

const SEPARATOR = '\u001f'

export const tupleKey = (tuple: readonly string[]): string => tuple.join(SEPARATOR)
export const keyTuple = (key: string): string[] => key.split(SEPARATOR)

/** Todas las tuplas de 𝒟ⁿ en orden lexicográfico según el orden del dominio. */
export function allTuples(domain: readonly string[], arity: number): string[][] {
  let result: string[][] = [[]]
  for (let i = 0; i < arity; i++) {
    result = result.flatMap((prefix) => domain.map((element) => [...prefix, element]))
  }
  return result
}

export const tableSize = (domainSize: number, arity: number): number => domainSize ** arity

export function toLanguage(project: Project): LanguageIn {
  return {
    constants: project.constants,
    functions: project.functions,
    predicates: project.predicates,
  }
}

/** Interpretación en formato de la API, solo con los símbolos declarados. */
export function toInterpretation(project: Project): InterpretationIn {
  const constants: Record<string, string> = {}
  for (const name of project.constants) {
    const value = project.constantValues[name]
    if (value !== undefined) constants[name] = value
  }
  const functions: InterpretationIn['functions'] = {}
  for (const { name } of project.functions) {
    const table = project.functionTables[name] ?? {}
    functions[name] = Object.entries(table).map(([key, value]) => ({ args: keyTuple(key), value }))
  }
  const predicates: Record<string, string[][]> = {}
  for (const { name } of project.predicates) {
    predicates[name] = project.relations[name] ?? []
  }
  return { domain: project.domain, constants, functions, predicates }
}

export function toProjectIn(project: Project, freeVars?: readonly string[]): ProjectIn {
  const environment: Record<string, string> = {}
  for (const [name, value] of Object.entries(project.environment)) {
    if (!freeVars || freeVars.includes(name)) environment[name] = value
  }
  return {
    version: 1,
    language: toLanguage(project),
    interpretation: toInterpretation(project),
    formula: project.formula,
    environment,
  }
}

export function fromProjectIn(data: ProjectIn): Project {
  const language = data.language ?? {}
  const interpretation = data.interpretation ?? {}
  const functionTables: Project['functionTables'] = {}
  for (const [name, rows] of Object.entries(interpretation.functions ?? {})) {
    functionTables[name] = Object.fromEntries(rows.map((row) => [tupleKey(row.args), row.value]))
  }
  return {
    constants: language.constants ?? [],
    functions: language.functions ?? [],
    predicates: language.predicates ?? [],
    domain: interpretation.domain ?? [],
    constantValues: interpretation.constants ?? {},
    functionTables,
    relations: interpretation.predicates ?? {},
    formula: data.formula ?? '',
    environment: data.environment ?? {},
  }
}
