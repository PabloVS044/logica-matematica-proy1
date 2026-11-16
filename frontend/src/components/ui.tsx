import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import type { Diagnostic } from '../api/client'

export function Section({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="border-t border-line pt-4 pb-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

type Variant = 'primary' | 'quiet' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-surface hover:opacity-90 font-bold',
  quiet: 'border border-line bg-surface text-ink hover:bg-sunken',
  danger: 'border border-line bg-surface text-false hover:bg-false-soft',
}

export function Button({
  variant = 'quiet',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded px-1.5 text-muted hover:bg-false-soft hover:text-false"
    >
      ×
    </button>
  )
}

export const inputClass =
  'rounded-md border border-line bg-surface px-2 py-1 text-ink placeholder:text-muted placeholder:opacity-70 focus:border-accent focus:outline-none'

export function DiagnosticList({ diagnostics }: { diagnostics: readonly Diagnostic[] }) {
  if (diagnostics.length === 0) return null
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {diagnostics.map((d, i) => (
        <li
          key={`${d.code}-${i}`}
          className={`rounded-md px-2 py-1 ${
            d.severity === 'error' ? 'bg-false-soft text-false' : 'bg-warn-soft text-warn'
          }`}
        >
          <span className="sr-only">{d.severity === 'error' ? 'Error: ' : 'Advertencia: '}</span>
          {d.message} <span className="opacity-60">({d.code})</span>
        </li>
      ))}
    </ul>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>
}

/**
 * Ventana sobre la escena. `center` es un modal (bloquea lo de atrás); `right` es un panel
 * lateral que deja usar la escena mientras está abierto. Escape cierra ambos.
 */
export function Modal({
  open,
  onClose,
  title,
  placement = 'center',
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  placement?: 'center' | 'right'
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  // onClose cambia en cada render del padre: se guarda aparte para no repetir el efecto.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open])

  if (!open) return null
  const modal = placement === 'center'
  return (
    <div
      className={
        modal
          ? 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-3 pt-[6vh] backdrop-blur-[2px]'
          : 'pointer-events-none fixed inset-y-0 right-0 z-40 flex w-full justify-end p-3 sm:w-[min(560px,100vw)]'
      }
      onMouseDown={modal ? (e) => e.target === e.currentTarget && onClose() : undefined}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal={modal}
        aria-label={title}
        tabIndex={-1}
        className={`pointer-events-auto flex flex-col rounded-xl border border-line bg-surface shadow-2xl focus:outline-none ${
          modal ? 'max-h-[88vh] w-full max-w-4xl' : 'h-full w-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-lg font-bold">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md px-2 py-0.5 text-xl text-muted hover:bg-sunken hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Tarjeta translúcida que flota sobre la escena. */
export const floating =
  'rounded-xl border border-line bg-surface/85 shadow-lg backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-surface'
