import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import type { FormulaAnalysis } from '../api/client'
import { applyShortcut, insertAt } from '../lib/formulaInput'
import { DiagnosticList, Hint, Section } from './ui'

const SYMBOLS: { symbol: string; label: string }[] = [
  { symbol: '¬', label: 'negación' },
  { symbol: '∧', label: 'conjunción' },
  { symbol: '∨', label: 'disyunción' },
  { symbol: '→', label: 'implicación' },
  { symbol: '∀', label: 'para todo' },
  { symbol: '∃', label: 'existe' },
  { symbol: '=', label: 'igualdad' },
  { symbol: '(', label: 'abrir paréntesis' },
  { symbol: ')', label: 'cerrar paréntesis' },
  { symbol: ',', label: 'coma' },
]

/** Partes del texto con los tramos de error marcados, para la capa de resaltado. */
function segments(text: string, analysis: FormulaAnalysis | null) {
  const spans = (analysis?.diagnostics ?? [])
    .filter((d) => d.severity === 'error' && d.location.start != null && d.location.end != null)
    .map((d) => ({ start: d.location.start!, end: Math.max(d.location.end!, d.location.start! + 1) }))
    .sort((a, b) => a.start - b.start)
  const result: { text: string; error: boolean }[] = []
  let position = 0
  for (const span of spans) {
    if (span.start < position) continue
    result.push({ text: text.slice(position, span.start), error: false })
    // Un error al final de la fórmula se marca con un espacio subrayado.
    result.push({ text: text.slice(span.start, span.end) || ' ', error: true })
    position = span.end
  }
  result.push({ text: text.slice(position), error: false })
  return result
}

export function FormulaEditor({
  value,
  onChange,
  analysis,
  analysisError,
  onSubmit,
  compact = false,
  action,
}: {
  /** Versión para el dock inferior: sin título ni ayuda, y con `action` junto al campo. */
  compact?: boolean
  action?: ReactNode
  value: string
  onChange: (value: string) => void
  analysis: FormulaAnalysis | null
  analysisError: string | null
  onSubmit: () => void
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const pendingCursor = useRef<number | null>(null)

  // Restaura el cursor después de insertar un símbolo o aplicar un atajo.
  useLayoutEffect(() => {
    const element = textarea.current
    if (element && pendingCursor.current !== null) {
      element.setSelectionRange(pendingCursor.current, pendingCursor.current)
      pendingCursor.current = null
    }
    if (element) {
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight}px`
    }
  }, [value])

  function insert(symbol: string) {
    const element = textarea.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    const edit = insertAt(value, start, end, symbol)
    pendingCursor.current = edit.cursor
    onChange(edit.text)
    element?.focus()
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const typed = (event.nativeEvent as InputEvent).inputType === 'insertText'
    const cursor = event.target.selectionStart
    if (!typed) {
      onChange(event.target.value)
      return
    }
    const edit = applyShortcut(event.target.value, cursor)
    if (edit.cursor !== cursor || edit.text !== event.target.value) {
      pendingCursor.current = edit.cursor
    }
    onChange(edit.text)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    } else if (event.key === 'Enter') {
      event.preventDefault() // la fórmula es una sola línea
    }
  }

  const errors = analysis?.diagnostics ?? []
  const shared = 'formula w-full whitespace-pre-wrap break-words px-3 py-2 text-xl leading-relaxed'

  const content = (
    <>
      <div
        role="toolbar"
        aria-label="Símbolos lógicos"
        className={`flex flex-wrap gap-1 ${compact ? 'mb-1.5' : 'mb-2'}`}
      >
        {SYMBOLS.map(({ symbol, label }) => (
          <button
            key={symbol}
            type="button"
            title={label}
            aria-label={`Insertar ${label}`}
            onMouseDown={(e) => e.preventDefault()} // conserva el cursor en el editor
            onClick={() => insert(symbol)}
            className={`formula rounded-md border border-line bg-surface px-2 text-ink hover:border-accent hover:bg-accent-soft ${
              compact ? 'h-8 min-w-8 text-lg' : 'h-10 min-w-10 text-xl'
            }`}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2">
      <div className="relative min-w-0 flex-1 rounded-md border border-line bg-surface focus-within:border-accent">
        <div aria-hidden className={`${shared} pointer-events-none absolute inset-0 text-transparent`}>
          {segments(value, analysis).map((segment, i) =>
            segment.error ? (
              <mark
                key={i}
                className="bg-false-soft text-transparent underline decoration-false decoration-wavy decoration-2 underline-offset-4"
              >
                {segment.text}
              </mark>
            ) : (
              <span key={i}>{segment.text}</span>
            ),
          )}
        </div>
        <textarea
          ref={textarea}
          aria-label="Fórmula"
          value={value}
          rows={1}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder="Escribe una fórmula, p. ej. ∀x (P(x) → ∃y R(x, y))"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={`${shared} relative resize-none overflow-hidden bg-transparent text-ink placeholder:text-base placeholder:text-muted placeholder:opacity-70 focus:outline-none`}
        />
      </div>
      {action}
      </div>
      {!compact && (
      <Hint>
        También puedes escribir con el teclado: <kbd>-&gt;</kbd> → , <kbd>&amp;</kbd> ∧ ,{' '}
        <kbd>|</kbd> ∨ , <kbd>~</kbd> ¬ , <kbd>\A</kbd> ∀ , <kbd>\E</kbd> ∃. Ctrl + Enter evalúa.
      </Hint>
      )}

      {analysisError && <p className="mt-2 text-sm text-false">{analysisError}</p>}
      {analysis?.parenthesized && value.trim() && (
        <p className={`${compact ? 'mt-1.5' : 'mt-3'} text-sm text-muted`}>
          Se interpreta como{' '}
          <span className="formula text-base text-ink">{analysis.parenthesized}</span>
        </p>
      )}
      {analysis?.syntax_tree && (
        <p className="mt-1 text-sm text-muted">
          {analysis.free_vars.length === 0 ? (
            'Fórmula cerrada (enunciado): no tiene variables libres.'
          ) : (
            <>
              Fórmula abierta. Variables libres:{' '}
              <span className="formula text-base text-ink">{analysis.free_vars.join(', ')}</span>
            </>
          )}
        </p>
      )}
      {value.trim() && <DiagnosticList diagnostics={errors} />}
    </>
  )

  return compact ? content : <Section title="Fórmula">{content}</Section>
}
