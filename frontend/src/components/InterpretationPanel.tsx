import { useState } from 'react'

import type { Diagnostic } from '../api/client'
import { allTuples, tableSize, tupleKey, type SymbolDecl } from '../lib/project'
import * as ops from '../lib/projectOps'
import { useProject, useUpdate } from '../store/projectStore'
import { ChipInput } from './ChipInput'
import { Button, DiagnosticList, Hint, inputClass, RemoveButton, Section } from './ui'

/** Igual que el límite del backend: tablas más grandes no se generan. */
const MAX_ROWS = 10_000

function byKind(diagnostics: readonly Diagnostic[], kind: string, symbol?: string) {
  return diagnostics.filter(
    (d) => d.location.kind === kind && (symbol === undefined || d.location.path?.[0] === symbol),
  )
}

const tuple = (values: readonly string[]) =>
  values.length === 1 ? values[0] : `(${values.join(', ')})`

export function InterpretationPanel({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const project = useProject()
  const update = useUpdate()
  const hasSymbols =
    project.constants.length + project.functions.length + project.predicates.length > 0

  return (
    <Section title="Interpretación ℐ">
      <div className="space-y-5">
        <div>
          <h3 className="mb-1.5 font-bold">
            Dominio <span className="formula">𝒟</span>
          </h3>
          <ChipInput
            items={project.domain}
            label="Nuevo elemento del dominio"
            placeholder="p. ej. a b c o 0 1 2"
            onAdd={(element) => update((p) => ops.addElement(p, element))}
            onRemove={(index) => update((p) => ops.removeElement(p, project.domain[index]))}
          />
          <Hint>El orden importa: testigos y contraejemplos se buscan en este orden.</Hint>
          {/* Con el dominio vacío basta la indicación de abajo; el error se ve al evaluar. */}
          <DiagnosticList
            diagnostics={byKind(diagnostics, 'domain').filter((d) => d.code !== 'E-DOM-001')}
          />
        </div>

        {project.domain.length === 0 ? (
          <Hint>Agrega elementos al dominio para interpretar los símbolos.</Hint>
        ) : !hasSymbols ? (
          <Hint>Declara símbolos en el lenguaje para interpretarlos aquí.</Hint>
        ) : (
          <>
            {project.constants.length > 0 && (
              <div>
                <h3 className="mb-1.5 font-bold">Constantes</h3>
                <div className="flex flex-wrap gap-3">
                  {project.constants.map((name) => (
                    <label key={name} className="formula flex items-center gap-1.5">
                      {name}ᴵ =
                      <ElementSelect
                        label={`Valor de ${name}`}
                        domain={project.domain}
                        value={project.constantValues[name] ?? ''}
                        onChange={(value) => update((p) => ops.setConstantValue(p, name, value))}
                      />
                    </label>
                  ))}
                </div>
                <DiagnosticList diagnostics={byKind(diagnostics, 'constant')} />
              </div>
            )}
            {project.functions.map((decl) => (
              <FunctionTable
                key={decl.name}
                decl={decl}
                diagnostics={byKind(diagnostics, 'function', decl.name)}
              />
            ))}
            {project.predicates.map((decl) => (
              <RelationEditor
                key={decl.name}
                decl={decl}
                diagnostics={byKind(diagnostics, 'predicate', decl.name)}
              />
            ))}
          </>
        )}
      </div>
    </Section>
  )
}

function ElementSelect({
  label,
  domain,
  value,
  onChange,
  invalid = false,
}: {
  label: string
  domain: readonly string[]
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} formula ${invalid || value === '' ? 'border-false' : ''}`}
    >
      <option value="">—</option>
      {domain.map((element) => (
        <option key={element} value={element}>
          {element}
        </option>
      ))}
    </select>
  )
}

function FunctionTable({ decl, diagnostics }: { decl: SymbolDecl; diagnostics: Diagnostic[] }) {
  const project = useProject()
  const update = useUpdate()
  const [fill, setFill] = useState('')
  const size = tableSize(project.domain.length, decl.arity)
  const table = project.functionTables[decl.name] ?? {}

  if (size > MAX_ROWS) {
    return (
      <div>
        <FunctionTitle decl={decl} />
        <DiagnosticList diagnostics={diagnostics} />
      </div>
    )
  }
  const tuples = allTuples(project.domain, decl.arity)
  const missing = tuples.filter((t) => !(tupleKey(t) in table)).length

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <FunctionTitle decl={decl} />
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted">Rellenar todo con</span>
          <ElementSelect
            label={`Valor para rellenar ${decl.name}`}
            domain={project.domain}
            value={fill}
            onChange={setFill}
          />
          <Button
            disabled={fill === ''}
            onClick={() => update((p) => ops.fillFunction(p, decl.name, tuples, fill))}
          >
            Rellenar
          </Button>
        </div>
      </div>
      <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-1.5 overflow-y-auto">
        {tuples.map((t) => (
          <label key={tupleKey(t)} className="formula flex items-center gap-1.5">
            {decl.name}ᴵ{`(${t.join(', ')})`} =
            <ElementSelect
              label={`Valor de ${decl.name}(${t.join(', ')})`}
              domain={project.domain}
              value={table[tupleKey(t)] ?? ''}
              onChange={(value) => update((p) => ops.setFunctionValue(p, decl.name, t, value))}
            />
          </label>
        ))}
      </div>
      {missing > 0 && (
        <Hint>
          Faltan {missing} de {tuples.length} valores: la función debe estar definida en todo 𝒟
          {decl.arity > 1 ? <sup>{decl.arity}</sup> : null}.
        </Hint>
      )}
      <DiagnosticList diagnostics={diagnostics.filter((d) => d.code !== 'E-FUN-001')} />
    </div>
  )
}

function FunctionTitle({ decl }: { decl: SymbolDecl }) {
  return (
    <h3 className="font-bold">
      <span className="formula">
        {decl.name}ᴵ : 𝒟{decl.arity > 1 ? <sup>{decl.arity}</sup> : null} → 𝒟
      </span>
    </h3>
  )
}

function RelationEditor({ decl, diagnostics }: { decl: SymbolDecl; diagnostics: Diagnostic[] }) {
  const project = useProject()
  const update = useUpdate()
  const rows = project.relations[decl.name] ?? []
  const toggle = (t: readonly string[]) => update((p) => ops.toggleTuple(p, decl.name, t))
  const has = (t: readonly string[]) => ops.hasTuple(project, decl.name, t)

  return (
    <div>
      <h3 className="mb-1.5 font-bold">
        <span className="formula">
          {decl.name}ᴵ ⊆ 𝒟{decl.arity > 1 ? <sup>{decl.arity}</sup> : null}
        </span>
        <span className="ml-2 text-sm font-normal text-muted">
          {rows.length} {rows.length === 1 ? 'tupla' : 'tuplas'}
        </span>
      </h3>
      {decl.arity === 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {project.domain.map((element) => (
            <label
              key={element}
              className={`formula flex cursor-pointer items-center gap-1 rounded-md border px-2 py-0.5 ${
                has([element]) ? 'border-accent bg-accent-soft' : 'border-line'
              }`}
            >
              <input type="checkbox" checked={has([element])} onChange={() => toggle([element])} />
              {element}
            </label>
          ))}
        </div>
      ) : decl.arity === 2 ? (
        <RelationMatrix name={decl.name} domain={project.domain} has={has} toggle={toggle} />
      ) : (
        <TupleList decl={decl} rows={rows} domain={project.domain} toggle={toggle} has={has} />
      )}
      <DiagnosticList diagnostics={diagnostics} />
    </div>
  )
}

function RelationMatrix({
  name,
  domain,
  has,
  toggle,
}: {
  name: string
  domain: readonly string[]
  has: (t: readonly string[]) => boolean
  toggle: (t: readonly string[]) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="formula border-collapse text-center">
        <caption className="sr-only">
          Fila: primer argumento; columna: segundo argumento de {name}
        </caption>
        <thead>
          <tr>
            <th className="px-2 text-muted" scope="col">
              {name}
            </th>
            {domain.map((b) => (
              <th key={b} scope="col" className="px-2 font-normal">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {domain.map((a) => (
            <tr key={a}>
              <th scope="row" className="px-2 font-normal">
                {a}
              </th>
              {domain.map((b) => (
                <td key={b} className="border border-line p-1">
                  <input
                    type="checkbox"
                    aria-label={`${name}(${a}, ${b})`}
                    checked={has([a, b])}
                    onChange={() => toggle([a, b])}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TupleList({
  decl,
  rows,
  domain,
  toggle,
  has,
}: {
  decl: SymbolDecl
  rows: readonly string[][]
  domain: readonly string[]
  toggle: (t: readonly string[]) => void
  has: (t: readonly string[]) => boolean
}) {
  const [draft, setDraft] = useState<string[]>(() => Array<string>(decl.arity).fill(''))
  const complete = draft.length === decl.arity && draft.every(Boolean)

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-1.5">
        {rows.map((row) => (
          <li key={tupleKey(row)} className="formula inline-flex items-center rounded-md bg-sunken pl-2">
            {tuple(row)}
            <RemoveButton label={`Quitar ${tuple(row)}`} onClick={() => toggle(row)} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="formula">(</span>
        {Array.from({ length: decl.arity }, (_, i) => (
          <ElementSelect
            key={i}
            label={`Componente ${i + 1} de la tupla`}
            domain={domain}
            value={draft[i] ?? ''}
            onChange={(value) => setDraft((d) => d.map((v, j) => (j === i ? value : v)))}
          />
        ))}
        <span className="formula">)</span>
        <Button
          disabled={!complete || has(draft)}
          onClick={() => {
            toggle(draft)
            setDraft(Array<string>(decl.arity).fill(''))
          }}
        >
          Agregar tupla
        </Button>
      </div>
    </div>
  )
}
