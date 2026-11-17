import { useState, type DragEvent, type ReactNode } from 'react'

import { DRAG_TYPE, useDropTarget } from '../lib/dragDrop'
import { sfx } from '../lib/sound'

/**
 * Piezas para configurar con las manos: los elementos de 𝒟 son fichas que se arrastran (o se
 * tocan) hacia cajitas. Una cajita es cualquier lugar que espera un elemento: una constante,
 * una variable del entorno, el valor de una función o una componente de una tupla.
 */

/** Ficha de un elemento del dominio. */
export function ElementToken({
  element,
  onClick,
  active = false,
  dim = false,
  size = 'md',
  label,
  color,
}: {
  element: string
  onClick?: () => void
  active?: boolean
  dim?: boolean
  size?: 'sm' | 'md'
  label?: string
  /** Color de un conjunto al que pertenece (predicados unarios). */
  color?: string
}) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData(DRAG_TYPE, element)
    event.dataTransfer.setData('text/plain', element)
    event.dataTransfer.effectAllowed = 'copyMove'
  }
  const sizing = size === 'sm' ? 'h-8 min-w-8 px-2 text-base' : 'h-10 min-w-10 px-3 text-lg'
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      aria-label={label}
      aria-pressed={onClick ? active : undefined}
      style={color ? { borderColor: color, boxShadow: `0 0 0 2px ${color}55` } : undefined}
      className={`formula token inline-flex cursor-grab items-center justify-center rounded-full border-2 font-semibold transition active:cursor-grabbing ${sizing} ${
        active ? 'border-accent ring-2 ring-accent' : 'border-line'
      } ${dim ? 'opacity-45' : ''}`}
    >
      {element}
    </button>
  )
}

export interface SlotSpec {
  id: string
  /** Lo que identifica la cajita: "x", "c", "f(a, b)"… */
  label: ReactNode
  /** Notación formal debajo, p. ej. "l(x)" o "cᴵ". */
  caption?: ReactNode
  ariaLabel: string
  value: string
  onChange: (value: string) => void
}

/**
 * Cajitas y, debajo, las fichas del dominio. Se arrastra una ficha a una cajita, o se toca
 * una cajita y luego una ficha; al llenarse, pasa sola a la siguiente cajita vacía.
 */
export function SlotBoard({
  slots,
  domain,
  arrow = '=',
  layout = 'grid',
  trayLabel = 'Elementos de 𝒟',
}: {
  slots: readonly SlotSpec[]
  domain: readonly string[]
  /** Lo que va entre la etiqueta y la cajita: "=" o "↦". */
  arrow?: string
  layout?: 'grid' | 'row'
  trayLabel?: string
}) {
  const filled = (slot: SlotSpec) => slot.value !== '' && domain.includes(slot.value)
  const firstEmpty = slots.find((s) => !filled(s))?.id ?? null
  const [picked, setPicked] = useState<string | null>(null)
  const active = slots.some((s) => s.id === picked) ? picked : firstEmpty

  function assign(slot: SlotSpec, element: string) {
    slot.onChange(element)
    sfx.play('cuentaCumple', { rate: 1.2, gain: 0.7 })
    // Pasa a la siguiente cajita vacía (después de esta, o la primera que quede).
    const index = slots.indexOf(slot)
    const next =
      slots.slice(index + 1).find((s) => !filled(s)) ??
      slots.slice(0, index).find((s) => !filled(s))
    setPicked(next?.id ?? null)
  }

  const current = slots.find((s) => s.id === active)
  return (
    <div>
      <div
        className={
          layout === 'grid'
            ? 'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2.5'
            : 'flex flex-wrap gap-2'
        }
      >
        {slots.map((slot) => (
          <Slot
            key={slot.id}
            slot={slot}
            arrow={arrow}
            active={slot.id === active}
            valid={filled(slot)}
            onPick={() => setPicked(slot.id)}
            onDrop={(element) => assign(slot, element)}
            onClear={() => {
              slot.onChange('')
              setPicked(slot.id)
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-sunken/60 px-3 py-1.5">
        <div className="flex flex-wrap gap-1.5" aria-label={trayLabel} role="group">
          {domain.map((element) => (
            <ElementToken
              key={element}
              element={element}
              size="sm"
              label={current ? `Poner ${element} en ${current.ariaLabel}` : `Elemento ${element}`}
              onClick={current ? () => assign(current, element) : undefined}
              active={current?.value === element}
            />
          ))}
        </div>
        <p className="text-xs text-muted">
          {current ? (
            <>
              Toca un elemento para ponerlo en{' '}
              <span className="formula font-bold text-ink">{current.label}</span>, o arrástralo a
              cualquier cajita.
            </>
          ) : (
            'Todo lleno. Arrastra un elemento a una cajita para cambiarla.'
          )}
        </p>
      </div>
    </div>
  )
}

function Slot({
  slot,
  arrow,
  active,
  valid,
  onPick,
  onDrop,
  onClear,
}: {
  slot: SlotSpec
  arrow: string
  active: boolean
  valid: boolean
  onPick: () => void
  onDrop: (element: string) => void
  onClear: () => void
}) {
  const drop = useDropTarget(onDrop)
  return (
    <div
      {...drop.props}
      className={`relative flex flex-col rounded-xl border-2 px-3 pt-2 pb-1.5 transition ${
        drop.over
          ? 'scale-[1.03] border-accent bg-accent-soft'
          : active
            ? 'border-accent bg-surface shadow-md'
            : valid
              ? 'border-line bg-surface'
              : 'border-dashed border-warn bg-warn-soft/40'
      }`}
    >
      <button
        type="button"
        onClick={onPick}
        aria-label={`${slot.ariaLabel}: ${valid ? slot.value : 'sin valor'}`}
        aria-pressed={active}
        className="flex items-center gap-2 text-left"
      >
        <span className="formula text-lg font-bold whitespace-nowrap">{slot.label}</span>
        <span className="formula text-muted">{arrow}</span>
        <span
          className={`formula inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-lg font-semibold ${
            valid ? 'token-filled' : 'border-2 border-dashed border-line text-muted'
          }`}
        >
          {valid ? slot.value : '?'}
        </span>
      </button>
      {slot.caption && <span className="formula mt-0.5 text-xs text-muted">{slot.caption}</span>}
      {valid && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Vaciar ${slot.ariaLabel}`}
          title="Vaciar"
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full border border-line bg-surface text-xs leading-none text-muted shadow-sm hover:bg-false-soft hover:text-false"
        >
          ×
        </button>
      )}
    </div>
  )
}

/** Notación de un símbolo con sus lugares vacíos: P(□, □). */
export function SymbolShape({ name, arity }: { name: string; arity: number }) {
  return (
    <span className="formula inline-flex items-center text-xl">
      <span className="font-bold">{name || '·'}</span>
      <span className="text-muted">(</span>
      {Array.from({ length: arity }, (_, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mr-1 text-muted">,</span>}
          <span className="inline-block h-5 w-5 rounded-md border-2 border-dashed border-accent/70 bg-accent-soft" />
        </span>
      ))}
      <span className="text-muted">)</span>
    </span>
  )
}

/** − n + para elegir la aridad. */
export function ArityStepper({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (value: number) => void
  label: string
}) {
  const button =
    'h-7 w-7 rounded-md border border-line bg-surface text-lg leading-none hover:bg-sunken disabled:opacity-40'
  return (
    <span role="group" aria-label={label} className="inline-flex items-center gap-1 text-sm">
      <button
        type="button"
        className={button}
        disabled={value <= 1}
        aria-label="Un argumento menos"
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span className="min-w-24 text-center whitespace-nowrap text-muted" aria-live="polite">
        {value} {value === 1 ? 'argumento' : 'argumentos'}
      </span>
      <button
        type="button"
        className={button}
        disabled={value >= 6}
        aria-label="Un argumento más"
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </span>
  )
}
