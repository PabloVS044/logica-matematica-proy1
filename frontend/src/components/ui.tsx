import type { ButtonHTMLAttributes, ReactNode } from 'react'

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
