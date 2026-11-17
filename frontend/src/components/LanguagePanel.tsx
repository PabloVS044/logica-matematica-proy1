import { useState, type FormEvent, type ReactNode } from 'react'

import type { Diagnostic } from '../api/client'
import type { SymbolDecl } from '../lib/project'
import * as ops from '../lib/projectOps'
import { sfx } from '../lib/sound'
import { PREDICATE_COLORS } from '../lib/useUniverse'
import { useProject, useUpdate } from '../store/projectStore'
import { Button, DiagnosticList, Hint, inputClass, RemoveButton, Section } from './ui'
import { ArityStepper, SymbolShape } from './visual'

const CATEGORY_LABEL = {
  constants: 'constante',
  functions: 'símbolo funcional',
  predicates: 'predicado',
} as const

/** Diagnósticos del lenguaje cuya ruta es [categoría, índice]. */
function forCategory(diagnostics: readonly Diagnostic[], category: string) {
  return diagnostics.filter((d) => d.location.path?.[0] === category)
}

export function LanguagePanel({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  const project = useProject()
  const update = useUpdate()

  return (
    <Section title="Lenguaje">
      <Hint>
        Las piezas con las que se escriben fórmulas. Las variables (u, v, w, x, y, z, con dígitos
        opcionales) y los símbolos lógicos ¬ ∧ ∨ → ∀ ∃ = ya vienen incluidos.
      </Hint>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Family
          title="Constantes"
          icon={<ConstantIcon />}
          explain="Nombres de elementos: cada una nombra exactamente uno."
          example="c, cero"
        >
          <ConstantList
            constants={project.constants}
            onAdd={(name) => update((p) => ops.addConstant(p, name))}
            onRename={(index, name) => update((p) => ops.renameConstant(p, index, name))}
            onRemove={(index) => update((p) => ops.removeConstant(p, index))}
          />
          <DiagnosticList diagnostics={forCategory(diagnostics, CATEGORY_LABEL.constants)} />
        </Family>

        <Family
          title="Funciones"
          icon={<FunctionIcon />}
          explain="Máquinas: reciben elementos y devuelven un elemento."
          example="s(□) ↦ elemento"
        >
          <SymbolList
            kind="functions"
            placeholder="f"
            output="↦ elemento"
            declarations={project.functions}
            diagnostics={forCategory(diagnostics, CATEGORY_LABEL.functions)}
          />
        </Family>

        <Family
          title="Predicados"
          icon={<PredicateIcon />}
          explain="Preguntas: reciben elementos y responden V o F."
          example="R(□, □) ↦ V / F"
        >
          <SymbolList
            kind="predicates"
            placeholder="P"
            output="↦ V / F"
            colored
            declarations={project.predicates}
            diagnostics={forCategory(diagnostics, CATEGORY_LABEL.predicates)}
          />
        </Family>
      </div>
    </Section>
  )
}

function Family({
  title,
  icon,
  explain,
  example,
  children,
}: {
  title: string
  icon: ReactNode
  explain: string
  example: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col rounded-2xl border border-line bg-sunken/50 p-3">
      <div className="mb-1 flex items-center gap-3">
        <span className="shrink-0 rounded-xl bg-surface p-1.5 shadow-sm">{icon}</span>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <p className="text-sm text-muted">{explain}</p>
      <p className="formula mb-3 text-sm text-muted">p. ej. {example}</p>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </section>
  )
}

function Empty() {
  return <p className="text-sm text-muted italic">Ninguno todavía.</p>
}

const card = 'flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm'

function ConstantList({
  constants,
  onAdd,
  onRename,
  onRemove,
}: {
  constants: readonly string[]
  onAdd: (name: string) => void
  onRename: (index: number, name: string) => void
  onRemove: (index: number) => void
}) {
  const [draft, setDraft] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const names = draft.split(/[\s,]+/).filter(Boolean)
    if (names.length) sfx.play('simbolo')
    names.forEach(onAdd)
    setDraft('')
  }
  return (
    <>
      {constants.length === 0 && <Empty />}
      {constants.map((name, index) => (
        <div key={index} className={card}>
          <span className="token formula inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-line text-sm">
            ●
          </span>
          <input
            aria-label={`Nombre de la constante ${index + 1}`}
            value={name}
            onChange={(e) => onRename(index, e.target.value)}
            className={`${inputClass} formula w-full min-w-0 text-lg font-bold`}
          />
          <RemoveButton label={`Quitar ${name}`} onClick={() => onRemove(index)} />
        </div>
      ))}
      <form onSubmit={submit} className="mt-auto flex gap-2 pt-1">
        <input
          aria-label="Nueva constante"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="nombre, p. ej. c"
          className={`${inputClass} formula w-full min-w-0 text-sm`}
        />
        <Button type="submit" disabled={!draft.trim()}>
          Agregar
        </Button>
      </form>
    </>
  )
}

function SymbolList({
  kind,
  placeholder,
  output,
  colored = false,
  declarations,
  diagnostics,
}: {
  kind: ops.SymbolKind
  placeholder: string
  output: string
  colored?: boolean
  declarations: readonly SymbolDecl[]
  diagnostics: readonly Diagnostic[]
}) {
  const update = useUpdate()
  const [name, setName] = useState('')
  const [arity, setArity] = useState(1)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    sfx.play('simbolo')
    update((p) => ops.addSymbol(p, kind, { name: name.trim(), arity }))
    setName('')
  }

  return (
    <>
      {declarations.length === 0 && <Empty />}
      {declarations.map((decl, index) => {
        const set = (next: SymbolDecl) => update((p) => ops.updateSymbol(p, kind, index, next))
        const color = colored ? PREDICATE_COLORS[index % PREDICATE_COLORS.length] : undefined
        return (
          <div
            key={index}
            className={`${card} flex-col items-stretch`}
            style={color ? { borderLeft: `5px solid ${color}` } : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1">
                <SymbolShape name={decl.name} arity={decl.arity} />
                <span className="formula text-sm whitespace-nowrap text-muted">{output}</span>
              </span>
              <RemoveButton
                label={`Quitar ${decl.name}`}
                onClick={() => update((p) => ops.removeSymbol(p, kind, index))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label={`Nombre del ${CATEGORY_LABEL[kind]} ${index + 1}`}
                value={decl.name}
                onChange={(e) => set({ ...decl, name: e.target.value })}
                className={`${inputClass} formula w-20`}
              />
              <ArityStepper
                label={`Aridad de ${decl.name}`}
                value={decl.arity}
                onChange={(next) => set({ ...decl, arity: next })}
              />
            </div>
          </div>
        )
      })}
      <form
        onSubmit={submit}
        className="mt-auto flex flex-col gap-2 rounded-xl border-2 border-dashed border-line px-3 py-2"
      >
        <span className="flex items-center gap-1 opacity-80">
          <SymbolShape name={name.trim() || placeholder} arity={arity} />
          <span className="formula text-sm text-muted">{output}</span>
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label={`Nombre del nuevo ${CATEGORY_LABEL[kind]}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`p. ej. ${placeholder}`}
            className={`${inputClass} formula w-20 text-sm`}
          />
          <ArityStepper label="Aridad del nuevo símbolo" value={arity} onChange={setArity} />
        </div>
        <Button type="submit" disabled={!name.trim()}>
          Agregar
        </Button>
      </form>
      <DiagnosticList diagnostics={diagnostics} />
    </>
  )
}

// ------------------------------------------------------------------ íconos (las piezas de la máquina)

const iconProps = { width: 56, height: 40, viewBox: '0 0 56 40', 'aria-hidden': true } as const

/** Una etiqueta colgada de una perla: el nombre de un elemento. */
function ConstantIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="40" cy="24" r="10" fill="var(--sunken)" stroke="var(--line)" strokeWidth="2" />
      <line x1="31" y1="19" x2="22" y2="14" stroke="var(--accent)" strokeWidth="2" />
      <rect x="4" y="5" width="22" height="14" rx="7" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
      <text x="15" y="15.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)" className="formula">
        c
      </text>
    </svg>
  )
}

/** Una caja con engrane: entran elementos, sale uno. */
function FunctionIcon() {
  return (
    <svg {...iconProps}>
      <path d="M2 20 H14" stroke="var(--muted)" strokeWidth="2" markerEnd="none" />
      <path d="M10 16 L14 20 L10 24" fill="none" stroke="var(--muted)" strokeWidth="2" />
      <rect x="15" y="8" width="24" height="24" rx="5" fill="var(--accent)" />
      <circle cx="27" cy="20" r="6" fill="none" stroke="var(--surface)" strokeWidth="2.5" strokeDasharray="2.5 2" />
      <circle cx="27" cy="20" r="2" fill="var(--surface)" />
      <path d="M40 20 H52" stroke="var(--accent)" strokeWidth="2" />
      <path d="M48 16 L52 20 L48 24" fill="none" stroke="var(--accent)" strokeWidth="2" />
    </svg>
  )
}

/** Un sensor con su foco: responde V o F. */
function PredicateIcon() {
  return (
    <svg {...iconProps}>
      <rect x="6" y="12" width="30" height="22" rx="5" fill="var(--sunken)" stroke="var(--line)" strokeWidth="2" />
      <text x="21" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--true)" className="formula">
        V
      </text>
      <circle cx="45" cy="14" r="7" fill="var(--true)" opacity="0.85" />
      <circle cx="45" cy="14" r="11" fill="var(--true)" opacity="0.18" />
      <line x1="45" y1="21" x2="45" y2="30" stroke="var(--muted)" strokeWidth="2" />
      <line x1="36" y1="30" x2="45" y2="30" stroke="var(--muted)" strokeWidth="2" />
    </svg>
  )
}
