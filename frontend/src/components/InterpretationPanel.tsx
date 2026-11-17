import { useState, type FormEvent } from 'react'

import type { Diagnostic } from '../api/client'
import { allTuples, tableSize, tupleKey, type SymbolDecl } from '../lib/project'
import * as ops from '../lib/projectOps'
import { useProject, useUpdate } from '../store/projectStore'
import { useDropTarget } from '../lib/dragDrop'
import { sfx } from '../lib/sound'
import { PREDICATE_COLORS } from '../lib/useUniverse'
import { Button, DiagnosticList, Hint, inputClass, RemoveButton, Section } from './ui'
import { CayleyTable, MappingDiagram, RelationGraph, TagMap, VennSet } from './diagrams'
import { ElementToken, SlotBoard } from './visual'

/** Igual que el límite del backend: tablas más grandes no se generan. */
const MAX_ROWS = 10_000
/** Hasta aquí la tabla de una función se muestra como cajitas; con más, como lista compacta. */
const MAX_SLOTS = 144
/** Hasta aquí caben los diagramas (grafos, Venn, flechas, Cayley). */
const MAX_DIAGRAM = 14

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
  const constantSlots = project.constants.map((name) => ({
    id: name,
    label: name,
    caption: `${name}ᴵ`,
    ariaLabel: `Valor de ${name}`,
    value: project.constantValues[name] ?? '',
    onChange: (value: string) => update((p) => ops.setConstantValue(p, name, value)),
  }))

  return (
    <Section title="Interpretación ℐ">
      <div className="space-y-5">
        <div>
          <h3 className="mb-1.5 font-bold">
            Dominio <span className="formula">𝒟</span>
          </h3>
          <DomainEditor />
          <Hint>
            Cada ficha es un elemento del universo. El orden importa: testigos y contraejemplos se
            buscan en este orden.
          </Hint>
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
                <h3 className="font-bold">Constantes</h3>
                <Hint>Cada constante es el nombre de un elemento: pon la ficha en su cajita.</Hint>
                <div className="mt-2 grid items-start gap-3 md:grid-cols-[1fr_minmax(0,20rem)]">
                  <SlotBoard
                    domain={project.domain}
                    slots={constantSlots}
                  />
                  {project.domain.length <= MAX_DIAGRAM && (
                    <TagMap domain={project.domain} tags={constantSlots} kind="constante" />
                  )}
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
            {project.predicates.map((decl, i) => (
              <RelationEditor
                key={decl.name}
                decl={decl}
                color={PREDICATE_COLORS[i % PREDICATE_COLORS.length]}
                diagnostics={byKind(diagnostics, 'predicate', decl.name)}
              />
            ))}
          </>
        )}
      </div>
    </Section>
  )
}

/** El dominio como fichas: se agregan escribiendo (varias a la vez) y se quitan con ×. */
function DomainEditor() {
  const project = useProject()
  const update = useUpdate()
  const [draft, setDraft] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const names = draft.split(/[\s,]+/).filter(Boolean)
    if (names.length) sfx.play('cuentaCumple', { rate: 1.2, gain: 0.7 })
    for (const name of names) update((p) => ops.addElement(p, name))
    setDraft('')
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 py-2.5">
      {project.domain.map((element) => (
        <span key={element} className="group relative">
          <ElementToken element={element} label={`Elemento ${element}`} />
          <span className="absolute -top-2 -right-2 rounded-full bg-surface opacity-60 shadow group-hover:opacity-100">
            <RemoveButton
              label={`Quitar ${element}`}
              onClick={() => update((p) => ops.removeElement(p, element))}
            />
          </span>
        </span>
      ))}
      <form onSubmit={submit} className="inline-flex">
        <input
          aria-label="Nuevo elemento del dominio"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={project.domain.length ? '＋ otro elemento' : 'p. ej. a b c o 0 1 2'}
          className={`${inputClass} w-40 rounded-full px-3 text-sm`}
        />
      </form>
    </div>
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
      <Hint>
        Una máquina de entradas y salidas: a cada entrada le corresponde exactamente un elemento.
      </Hint>
      {project.domain.length <= MAX_DIAGRAM && decl.arity === 2 ? (
        <div className="mt-2">
          <CayleyTable
            name={decl.name}
            domain={project.domain}
            valueOf={(a, b) => table[tupleKey([a, b])] ?? ''}
            set={(a, b, value) => update((p) => ops.setFunctionValue(p, decl.name, [a, b], value))}
          />
        </div>
      ) : tuples.length <= MAX_SLOTS ? (
        <div className="mt-2 grid items-start gap-3 md:grid-cols-[1fr_minmax(0,20rem)]">
          <SlotBoard
            domain={project.domain}
            arrow="↦"
            slots={tuples.map((t) => ({
              id: tupleKey(t),
              label: `${decl.name}(${t.join(', ')})`,
              ariaLabel: `Valor de ${decl.name}(${t.join(', ')})`,
              value: table[tupleKey(t)] ?? '',
              onChange: (value) => update((p) => ops.setFunctionValue(p, decl.name, t, value)),
            }))}
          />
          {decl.arity === 1 && project.domain.length <= MAX_DIAGRAM && (
            <MappingDiagram
              name={decl.name}
              domain={project.domain}
              valueOf={(a) => table[tupleKey([a])] ?? ''}
              set={(a, value) => update((p) => ops.setFunctionValue(p, decl.name, [a], value))}
            />
          )}
        </div>
      ) : (
      <div className="mt-2 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-1.5 overflow-y-auto">
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
      )}
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

function RelationEditor({
  decl,
  color,
  diagnostics,
}: {
  decl: SymbolDecl
  color: string
  diagnostics: Diagnostic[]
}) {
  const project = useProject()
  const update = useUpdate()
  const rows = project.relations[decl.name] ?? []
  const toggle = (t: readonly string[]) => {
    sfx.play(ops.hasTuple(project, decl.name, t) ? 'cuentaFalla' : 'cuentaCumple', { gain: 0.7 })
    update((p) => ops.toggleTuple(p, decl.name, t))
  }
  const has = (t: readonly string[]) => ops.hasTuple(project, decl.name, t)

  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-2 font-bold">
        <span className="h-3 w-3 rounded-full" style={{ background: color }} aria-hidden />
        <span className="formula">
          {decl.name}ᴵ ⊆ 𝒟{decl.arity > 1 ? <sup>{decl.arity}</sup> : null}
        </span>
        <span className="ml-2 text-sm font-normal text-muted">
          {rows.length} {rows.length === 1 ? 'tupla' : 'tuplas'}
        </span>
      </h3>
      {decl.arity === 1 ? (
        project.domain.length <= MAX_DIAGRAM ? (
          <VennSet name={decl.name} color={color} domain={project.domain} has={has} toggle={toggle} />
        ) : (
          <SetBox name={decl.name} color={color} domain={project.domain} has={has} toggle={toggle} />
        )
      ) : decl.arity === 2 ? (
        <div className="grid items-start gap-3 md:grid-cols-[minmax(0,20rem)_1fr]">
          {project.domain.length <= MAX_DIAGRAM && (
            <RelationGraph
              name={decl.name}
              color={color}
              domain={project.domain}
              has={has}
              toggle={toggle}
            />
          )}
          <RelationMatrix
            name={decl.name}
            color={color}
            domain={project.domain}
            has={has}
            toggle={toggle}
          />
        </div>
      ) : (
        <TupleList decl={decl} rows={rows} domain={project.domain} toggle={toggle} has={has} />
      )}
      <DiagnosticList diagnostics={diagnostics} />
    </div>
  )
}

/**
 * Predicado unario como un conjunto: las fichas de dentro lo cumplen. Se tocan o se arrastran
 * para meterlas o sacarlas.
 */
function SetBox({
  name,
  color,
  domain,
  has,
  toggle,
}: {
  name: string
  color: string
  domain: readonly string[]
  has: (t: readonly string[]) => boolean
  toggle: (t: readonly string[]) => void
}) {
  const inside = domain.filter((e) => has([e]))
  const outside = domain.filter((e) => !has([e]))
  const enter = useDropTarget((e) => {
    if (!has([e])) toggle([e])
  })
  const leave = useDropTarget((e) => {
    if (has([e])) toggle([e])
  })
  return (
    <div className="grid gap-2 sm:grid-cols-[3fr_2fr]">
      <div
        {...enter.props}
        role="group"
        aria-label={`Dentro de ${name}`}
        className={`min-h-20 rounded-[1.75rem] border-2 px-4 py-2 transition ${enter.over ? 'scale-[1.02]' : ''}`}
        style={{ borderColor: color, background: `${color}${enter.over ? '33' : '14'}` }}
      >
        <p className="formula mb-1.5 text-sm font-semibold" style={{ color }}>
          {name}ᴵ — lo cumplen
        </p>
        <div className="flex flex-wrap gap-1.5">
          {inside.length === 0 && (
            <span className="text-sm text-muted">vacío: ningún elemento cumple {name}</span>
          )}
          {inside.map((e) => (
            <ElementToken
              key={e}
              element={e}
              color={color}
              label={`Sacar ${e} de ${name}`}
              onClick={() => toggle([e])}
            />
          ))}
        </div>
      </div>
      <div
        {...leave.props}
        role="group"
        aria-label={`Fuera de ${name}`}
        className={`min-h-20 rounded-xl border-2 border-dashed px-3 py-2 transition ${
          leave.over ? 'border-accent bg-accent-soft' : 'border-line'
        }`}
      >
        <p className="mb-1.5 text-sm text-muted">no lo cumplen (toca para meter)</p>
        <div className="flex flex-wrap gap-1.5">
          {outside.map((e) => (
            <ElementToken
              key={e}
              element={e}
              dim
              label={`Meter ${e} en ${name}`}
              onClick={() => toggle([e])}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Predicado binario como tablero: cada casilla encendida es una flecha a → b. */
function RelationMatrix({
  name,
  color,
  domain,
  has,
  toggle,
}: {
  name: string
  color: string
  domain: readonly string[]
  has: (t: readonly string[]) => boolean
  toggle: (t: readonly string[]) => void
}) {
  return (
    <div>
      <Hint>
        Enciende la casilla <span className="formula">(a, b)</span> si va una flecha de a hacia b;
        así se dibuja en el universo.
      </Hint>
      <div className="mt-2 overflow-x-auto">
        <table className="formula border-separate border-spacing-1 text-center">
          <caption className="sr-only">
            Fila: primer argumento; columna: segundo argumento de {name}
          </caption>
          <thead>
            <tr>
              <th className="px-1 text-xs font-normal whitespace-nowrap text-muted" scope="col">
                de ↓ a →
              </th>
              {domain.map((b) => (
                <th key={b} scope="col" className="px-1 font-semibold">
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domain.map((a) => (
              <tr key={a}>
                <th scope="row" className="px-2 font-semibold">
                  {a}
                </th>
                {domain.map((b) => {
                  const on = has([a, b])
                  return (
                    <td key={b} className="p-0">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`${name}(${a}, ${b})`}
                        title={`${a} → ${b}`}
                        onClick={() => toggle([a, b])}
                        className={`h-9 w-9 rounded-lg border-2 text-sm transition hover:scale-110 ${
                          on
                            ? 'text-white shadow-md'
                            : 'border-line bg-surface text-transparent hover:text-muted'
                        }`}
                        style={on ? { background: color, borderColor: color } : undefined}
                      >
                        →
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
      <p className="mb-1.5 text-sm text-muted">Arma una tupla nueva:</p>
      <SlotBoard
        domain={domain}
        layout="row"
        slots={draft.map((value, i) => ({
          id: String(i),
          label: `${i + 1}º`,
          ariaLabel: `Componente ${i + 1} de la tupla`,
          value,
          onChange: (next) => setDraft((d) => d.map((v, j) => (j === i ? next : v))),
        }))}
      />
      <Button
        className="mt-2"
        disabled={!complete || has(draft)}
        onClick={() => {
          toggle(draft)
          setDraft(Array<string>(decl.arity).fill(''))
        }}
      >
        Agregar {complete ? tuple(draft) : 'tupla'}
      </Button>
    </div>
  )
}
