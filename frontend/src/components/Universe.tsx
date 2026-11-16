import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'

import { STATION_ROLE, type Machine, type MachineState } from '../lib/machine'
import { narrate, type PredicateShapes } from '../lib/narration'
import { Notation } from '../lib/notation'
import { tupleKey, type Project } from '../lib/project'
import type { ItemStatus, QuantifierProgress, Step, TimelineMode } from '../lib/universe'
import {
  SPEEDS,
  useReducedMotion,
  type Player,
  type Speed,
  type UniverseLayers,
} from '../lib/useUniverse'
import type { ScenePalette } from './universe/UniverseScene'
import { floating } from './ui'

// three.js pesa: se descarga solo cuando hay algo que dibujar.
const UniverseScene = lazy(() => import('./universe/UniverseScene'))
const MachineScene = lazy(() => import('./universe/MachineScene'))

function readPalette(): ScenePalette {
  const css = getComputedStyle(document.documentElement)
  const get = (name: string) => css.getPropertyValue(name).trim()
  const dark = document.documentElement.dataset.theme === 'dark'
  return {
    dark,
    ink: get('--ink'),
    muted: get('--muted'),
    accent: get('--accent'),
    true: get('--true'),
    false: get('--false'),
    sphere: dark ? '#4a5382' : '#f3f5fc',
    bound: dark ? '#7d8bff' : '#5867e6',
  }
}

/** Los colores salen de las variables CSS del tema y se actualizan al cambiarlo. */
function usePalette(): ScenePalette {
  const [palette, setPalette] = useState(readPalette)
  useEffect(() => {
    const observer = new MutationObserver(() => setPalette(readPalette()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return palette
}

// ------------------------------------------------------------------ componentes

/** Si la escena 3D falla, se avisa en su lugar y el resto de la aplicación sigue funcionando. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <p className="grid h-full place-items-center px-6 text-center text-sm text-muted">
        La escena 3D tuvo un problema y no se puede mostrar. La evaluación y la justificación
        siguen disponibles.
      </p>
    ) : (
      this.props.children
    )
  }
}

/** La escena a pantalla completa, detrás de toda la interfaz. */
export function UniverseStage({
  domain,
  layers,
  step,
  stepKey,
  selected,
  onSelect,
  spin,
  marks,
  className = '',
}: {
  /** Clases extra para reservar espacio a los paneles laterales. */
  className?: string
  domain: readonly string[]
  layers: UniverseLayers
  step: Step | null
  stepKey: number
  /** ✓ / ✗ sobre los elementos ya revisados por el cuantificador más interno. */
  marks: ReadonlyMap<string, { var: string; ok: boolean }>
  selected: string | null
  onSelect: (element: string | null) => void
  spin: boolean
}) {
  const palette = usePalette()
  const motion = !useReducedMotion()
  return (
    <div
      className={`absolute inset-0 transition-[left,right] duration-300 ${className}`}
      role="img"
      aria-label={`Universo con ${domain.length} elementos: ${domain.join(', ')}. Arrastra para girarlo y haz clic en un elemento para ver sus datos.`}
    >
      <SceneBoundary>
      <Suspense
        fallback={
          <p className="grid h-full place-items-center text-sm text-muted">
            Cargando la escena 3D…
          </p>
        }
      >
        <UniverseScene
          domain={domain}
          names={layers.names}
          unary={layers.unary}
          binary={layers.binary}
          step={step}
          stepKey={stepKey}
          palette={palette}
          motion={motion}
          spin={motion && spin && selected === null}
          selected={selected}
          onSelect={onSelect}
          marks={marks}
        />
      </Suspense>
      </SceneBoundary>
    </div>
  )
}

export type View = 'universo' | 'maquina'

/** Selector entre el universo (la interpretación) y la máquina (la fórmula). */
export function ViewToggle({
  view,
  onChange,
  machineReady,
}: {
  view: View
  onChange: (view: View) => void
  machineReady: boolean
}) {
  const option = (id: View, label: string, disabled = false) => (
    <button
      type="button"
      role="radio"
      aria-checked={view === id}
      disabled={disabled}
      title={disabled ? 'Escribe una fórmula válida para ver su máquina' : undefined}
      onClick={() => onChange(id)}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-bold disabled:opacity-40 ${
        view === id ? 'bg-accent text-surface' : 'text-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
  return (
    <div role="radiogroup" aria-label="Vista" className="flex min-w-56 gap-1 rounded-lg bg-sunken p-1">
      {option('universo', '🪐 Universo')}
      {option('maquina', '⚙ Máquina', !machineReady)}
    </div>
  )
}

/** La fórmula como máquina, a pantalla completa detrás de la interfaz. */
export function MachineStage({
  machine,
  state,
  stepKey,
  className = '',
}: {
  machine: Machine
  state: MachineState | null
  stepKey: number
  className?: string
}) {
  const palette = usePalette()
  const motion = !useReducedMotion()
  return (
    <div
      className={`absolute inset-0 transition-[left,right] duration-300 ${className}`}
      role="img"
      aria-label={`Máquina de la fórmula con ${machine.stations.length} estaciones.`}
    >
      <SceneBoundary key={machine.stations.length}>
        <Suspense
          fallback={
            <p className="grid h-full place-items-center text-sm text-muted">Cargando la máquina…</p>
          }
        >
          <MachineScene machine={machine} state={state} stepKey={stepKey} palette={palette} motion={motion} />
        </Suspense>
      </SceneBoundary>
    </div>
  )
}

/** Cómo leer la máquina, en palabras. */
export function MachineLegend({ machine }: { machine: Machine }) {
  const kinds = [...new Set(machine.stations.map((s) => s.kind))]
  const swatch = (kind: string) =>
    kind === 'forall' || kind === 'exists' ? '#6f63e8' : kind === 'pred' || kind === 'eq' ? '#1b8fb0' : '#56637d'
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted">
        La fórmula es una máquina: los valores de las variables <b className="text-ink">viajan</b> por
        los cables hasta los sensores y los resultados V/F <b className="text-ink">regresan</b> hasta la salida.
      </p>
      <ul className="space-y-1.5">
        {kinds.map((kind) => {
          const station = machine.stations.find((s) => s.kind === kind)!
          return (
            <li key={kind} className="flex items-start gap-2">
              <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: swatch(kind) }} />
              <span>
                <span className="formula font-semibold">
                  {kind === 'pred' || kind === 'eq' ? station.text : station.label}
                </span>
                <span className="text-muted">: {STATION_ROLE[kind]}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-accent" /> valores que viajan
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-true" />
          <span className="h-2.5 w-2.5 rounded-full bg-false" /> resultados que regresan
        </span>
      </p>
    </div>
  )
}

export function Legend({ layers }: { layers: UniverseLayers }) {
  const { unary, binary, undrawn } = layers
  if (unary.length + binary.length + undrawn.length === 0) return null
  return (
    <ul className="space-y-2 text-sm">
      {unary.map((layer) => (
        <li key={layer.name} className="flex items-start gap-2">
          <span
            className="mt-0.5 inline-block h-4 w-4 shrink-0 rounded-full border-[3px]"
            style={{ borderColor: layer.color }}
          />
          <span>
            <span className="formula text-base font-semibold">{layer.name}</span>
            <span className="text-muted">
              : el anillo marca a los que cumplen {layer.name}
              {layer.members.size > 0 && ` (${[...layer.members].join(', ')})`}
            </span>
          </span>
        </li>
      ))}
      {binary.map((layer) => (
        <li key={layer.name} className="flex items-start gap-2">
          <span className="w-4 shrink-0 text-base leading-5 font-bold" style={{ color: layer.color }}>
            ⟶
          </span>
          <span>
            <span className="formula text-base font-semibold">{layer.name}</span>
            <span className="text-muted">
              : una flecha <span className="formula">a → b</span> significa que (a, b) está en{' '}
              {layer.name}
            </span>
          </span>
        </li>
      ))}
      {undrawn.length > 0 && <li className="text-muted">Sin dibujar: {undrawn.join(', ')}</li>}
    </ul>
  )
}

const control =
  'h-9 min-w-9 rounded-lg border border-line bg-surface px-2 text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-40'

const MODES: { id: TimelineMode; label: string; title: string }[] = [
  {
    id: 'natural',
    label: 'Como una persona',
    title: 'Se detiene en cuanto el resultado queda decidido (p. ej. al hallar un testigo)',
  },
  { id: 'completo', label: 'Todo', title: 'Revisa todo lo que calculó el evaluador' },
  { id: 'decisivo', label: 'Solo lo decisivo', title: 'Solo las razones que deciden el resultado' },
]

/** Controles de la animación: una sola fila sobre el dock de la fórmula. */
export function PlaybackControls({
  player,
  narration,
}: {
  player: Player
  /** Narración en voz alta; sin esto (navegador sin voz) no se muestra el botón. */
  narration?: { on: boolean; toggle: () => void }
}) {
  const { timeline, index } = player
  if (!timeline) return null
  const last = timeline.steps.length - 1
  return (
    <div className={`flex flex-wrap items-center gap-2 px-3 py-2 ${floating}`}>
      <button type="button" className={control} aria-label="Ir al inicio" onClick={() => player.goTo(0)} disabled={index === 0}>
        ⏮
      </button>
      <button type="button" className={control} aria-label="Paso anterior" onClick={() => player.goTo(index - 1)} disabled={index === 0}>
        ‹
      </button>
      <button
        type="button"
        onClick={player.toggle}
        className="h-9 min-w-28 rounded-lg bg-accent px-3 text-sm font-bold text-surface hover:opacity-90"
      >
        {player.playing ? '❚❚ Pausar' : index >= last ? '↻ Repetir' : '▶ Reproducir'}
      </button>
      <button type="button" className={control} aria-label="Paso siguiente" onClick={() => player.goTo(index + 1)} disabled={index >= last}>
        ›
      </button>
      <button type="button" className={control} aria-label="Ir al final" onClick={() => player.goTo(last)} disabled={index >= last}>
        ⏭
      </button>
      <input
        type="range"
        min={0}
        max={last}
        value={index}
        onChange={(e) => player.goTo(Number(e.target.value))}
        aria-label="Paso de la animación"
        className="mx-1 min-w-24 flex-1 accent-[var(--accent)]"
      />
      <span className="text-sm text-muted tabular-nums">
        {index + 1}/{last + 1}
      </span>
      <select
        aria-label="Velocidad"
        value={player.speed}
        onChange={(e) => player.setSpeed(Number(e.target.value) as Speed)}
        className="h-9 rounded-lg border border-line bg-surface px-1 text-sm text-ink"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <select
        aria-label="Recorrido"
        value={player.mode}
        onChange={(e) => player.setMode(e.target.value as TimelineMode)}
        title={MODES.find((m) => m.id === player.mode)?.title}
        className="h-9 rounded-lg border border-line bg-surface px-1 text-sm text-ink"
      >
        {MODES.map((m) => (
          <option key={m.id} value={m.id} title={m.title}>
            {m.label}
          </option>
        ))}
      </select>
      {narration && (
        <button
          type="button"
          onClick={narration.toggle}
          aria-pressed={narration.on}
          title="Leer en voz alta cada paso; la animación espera a que termine de hablar"
          className={`h-9 rounded-lg border px-2.5 text-sm font-bold ${
            narration.on
              ? 'border-accent bg-accent text-surface'
              : 'border-line bg-surface text-ink hover:bg-sunken'
          }`}
        >
          {narration.on ? 'Narrando en voz alta' : 'Narrar en voz alta'}
        </button>
      )}
    </div>
  )
}

/** La fórmula completa con la parte que se evalúa en este paso resaltada. */
function FormulaFocus({ formula, step }: { formula: string; step: Step }) {
  const { node } = step
  const start = Math.max(0, Math.min(node.start, formula.length))
  const end = Math.max(start, Math.min(node.end, formula.length))
  return (
    <div>
      <p className="formula text-xl leading-relaxed break-words">
        <span className="text-muted">{formula.slice(0, start)}</span>
        <mark
          className={`rounded px-0.5 text-ink ${
            step.phase === 'conclude' || node.atom
              ? node.value
                ? 'bg-true-soft'
                : 'bg-false-soft'
              : 'bg-accent-soft'
          }`}
        >
          {formula.slice(start, end)}
        </mark>
        <span className="text-muted">{formula.slice(end)}</span>
      </p>
      {node.env.length > 0 && (
        <p className="mt-1 flex flex-wrap gap-1.5">
          {node.env.map((b) => (
            <span
              key={b.var}
              className="formula rounded-full bg-accent px-2 text-sm font-bold text-surface"
            >
              {b.var} = {b.value}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

const ITEM_STYLE: Record<ItemStatus, string> = {
  cumple: 'border-true bg-true-soft text-true',
  falla: 'border-false bg-false-soft text-false',
  probando: 'border-accent bg-accent-soft text-ink ring-2 ring-accent',
  pendiente: 'border-line text-muted',
  innecesario: 'border-dashed border-line text-muted line-through opacity-60',
}
const ITEM_MARK: Record<ItemStatus, string> = {
  cumple: ' ✓',
  falla: ' ✗',
  probando: ' …',
  pendiente: '',
  innecesario: '',
}
const ITEM_LABEL: Record<ItemStatus, string> = {
  cumple: 'cumple',
  falla: 'no cumple',
  probando: 'se está probando',
  pendiente: 'pendiente',
  innecesario: 'no hace falta revisarlo',
}

/** Marcador de un cuantificador: ∀ necesita que todos cumplan, ∃ solo uno. */
function QuantifierTracker({ progress }: { progress: QuantifierProgress }) {
  const { kind, items, done, node } = progress
  return (
    <div>
      <p className="text-sm">
        <span className="formula text-base font-bold">
          {kind}
          {progress.var}
        </span>{' '}
        <span className="text-muted">
          {kind === '∀' ? 'todos deben cumplir' : 'basta con que uno cumpla'}
        </span>
        {done && (
          <span className={`ml-2 font-bold ${node.value ? 'text-true' : 'text-false'}`}>
            → {node.value ? 'verdadera' : 'falsa'}
          </span>
        )}
      </p>
      {items.length > 0 ? (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item.value}
              title={ITEM_LABEL[item.status]}
              className={`formula rounded-md border px-1.5 text-sm ${ITEM_STYLE[item.status]}`}
            >
              {progress.var} = {item.value}
              {ITEM_MARK[item.status]}
              <span className="sr-only"> ({ITEM_LABEL[item.status]})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Detalle omitido por el tamaño de la explicación.</p>
      )}
    </div>
  )
}

/** Explicación del paso actual en palabras, con la fórmula y el marcador de cuantificadores. */
export function StoryCard({
  player,
  progress,
  formula,
  shapes,
}: {
  player: Player
  progress: QuantifierProgress[]
  formula: string
  shapes: PredicateShapes
}) {
  const [formal, setFormal] = useState(false)
  const { timeline, step } = player
  if (!timeline || !step) return null
  const narration = narrate(step, shapes)
  const hasInnecesarios = progress.some((q) => q.items.some((i) => i.status === 'innecesario'))
  return (
    <div className={`px-4 py-3 ${floating}`} aria-live="polite">
      <FormulaFocus formula={formula} step={step} />
      <div className="mt-3 flex items-start gap-2">
        {narration.value !== null && (
          <span
            className={`mt-0.5 inline-grid h-7 min-w-7 place-items-center rounded-md px-1 text-sm font-bold ${
              narration.value ? 'bg-true-soft text-true' : 'bg-false-soft text-false'
            }`}
          >
            {narration.value ? 'V' : 'F'}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-lg leading-snug font-bold">{narration.title}</p>
          {narration.detail && <p className="mt-0.5 text-muted">{narration.detail}</p>}
        </div>
      </div>
      {progress.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-line pt-3">
          {progress.map((q) => (
            <QuantifierTracker key={q.node.id} progress={q} />
          ))}
          {hasInnecesarios && (
            <p className="text-xs text-muted">
              Los tachados no hace falta revisarlos: el resultado ya quedó decidido.
            </p>
          )}
        </div>
      )}
      {timeline.fellBack && (
        <p className="mt-2 text-sm text-warn">
          La evaluación tiene demasiados pasos: se muestran solo los decisivos.
        </p>
      )}
      {timeline.cut && (
        <p className="mt-1 text-sm text-warn">
          La animación se acortó; la justificación completa está en «Ver justificación».
        </p>
      )}
      <button
        type="button"
        onClick={() => setFormal(!formal)}
        aria-expanded={formal}
        className="mt-2 text-sm font-bold text-accent underline-offset-2 hover:underline"
      >
        {formal ? 'Ocultar la notación formal' : 'Ver en notación formal'}
      </button>
      {formal && (
        <p className="formula mt-1 rounded-md bg-sunken px-3 py-2 text-base">
          <Notation
            text={
              step.phase === 'visit' && !step.node.atom
                ? `¿ℐ ⊨_{${step.node.env_label}} ${step.node.formula}?`
                : step.node.reason
            }
          />
        </p>
      )}
    </div>
  )
}

/** Datos de un elemento seleccionado en la escena. */
export function ElementCard({
  element,
  project,
  layers,
  onClose,
}: {
  element: string
  project: Project
  layers: UniverseLayers
  onClose: () => void
}) {
  const names = layers.names.get(element) ?? []
  const unary = layers.unary.filter((l) => l.members.has(element))
  const notUnary = layers.unary.filter((l) => !l.members.has(element))
  const functionValues = project.functions
    .filter((f) => f.arity === 1)
    .map((f) => ({ name: f.name, value: project.functionTables[f.name]?.[tupleKey([element])] }))
  const higher = project.predicates
    .filter((p) => p.arity >= 3)
    .map((p) => ({
      name: p.name,
      count: (project.relations[p.name] ?? []).filter((t) => t.includes(element)).length,
    }))

  return (
    <div className={`${floating} w-72 px-4 py-3`}>
      <div className="flex items-start justify-between gap-2">
        <p className="formula text-2xl font-semibold">{element}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar los datos del elemento"
          className="rounded-md px-1.5 text-lg text-muted hover:bg-sunken"
        >
          ×
        </button>
      </div>
      <dl className="mt-1 space-y-1.5 text-sm">
        {names.length > 0 && (
          <Row label="Lo nombran">
            <span className="formula text-base">
              {names.map((n) => `${n}ᴵ = ${element}`).join(', ')}
            </span>
          </Row>
        )}
        {layers.unary.length > 0 && (
          <Row label="Predicados">
            <span className="formula text-base">
              {unary.map((l) => `${element} ∈ ${l.name}ᴵ`).join(', ')}
              {unary.length > 0 && notUnary.length > 0 && ', '}
              {notUnary.map((l) => `${element} ∉ ${l.name}ᴵ`).join(', ')}
            </span>
          </Row>
        )}
        {layers.binary.map((layer) => {
          const out = layer.edges.filter(([a]) => a === element).map(([, b]) => b)
          const into = layer.edges.filter(([, b]) => b === element).map(([a]) => a)
          return (
            <Row key={layer.name} label={layer.name} color={layer.color}>
              <span className="formula text-base">
                {out.length ? `${element} → ${out.join(', ')}` : `sale hacia nadie`}
                <br />
                {into.length ? `${into.join(', ')} → ${element}` : 'nadie llega'}
              </span>
            </Row>
          )
        })}
        {functionValues.map((f) => (
          <Row key={f.name} label={`${f.name}ᴵ`}>
            <span className="formula text-base">
              {f.name}({element}) = {f.value ?? '?'}
            </span>
          </Row>
        ))}
        {higher.map((p) => (
          <Row key={p.name} label={p.name}>
            aparece en {p.count} {p.count === 1 ? 'tupla' : 'tuplas'}
          </Row>
        ))}
      </dl>
    </div>
  )
}

function Row({ label, color, children }: { label: string; color?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="formula text-muted" style={color ? { color } : undefined}>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
