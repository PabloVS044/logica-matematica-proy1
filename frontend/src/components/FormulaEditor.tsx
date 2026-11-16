import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import type { FormulaAnalysis, LanguageIn, SymbolProposal } from '../api/client'
import { applyShortcut, insertAt } from '../lib/formulaInput'
import { recognitionConstructor } from '../lib/speech'
import type { Speaker } from '../lib/useSpeaker'
import { DiagnosticList, Hint, Section } from './ui'
import { VoiceDictation } from './VoiceDictation'

/** Lo que necesita el dictado por voz; sin esto el editor no muestra el micrófono. */
export interface VoiceInput {
  language: LanguageIn
  speaker: Speaker
  /** Pide evaluar después de insertar la fórmula dictada (comando «evaluar»). */
  onEvaluate: () => void
  /** Declara en el lenguaje un símbolo que se dictó y no existía. */
  onDeclare: (proposal: SymbolProposal) => void
}

function MicIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  )
}

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
  voice,
}: {
  voice?: VoiceInput
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
  const [dictating, setDictating] = useState(false)
  const [undo, setUndo] = useState<string | null>(null)
  const [canDictate] = useState(() => recognitionConstructor() !== null)

  // Ctrl + M abre o cierra el dictado desde cualquier parte de la página.
  useEffect(() => {
    if (!voice || !canDictate) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'm') {
        event.preventDefault()
        setDictating((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [voice, canDictate])

  // La opción de deshacer lo dictado desaparece después de un rato.
  useEffect(() => {
    if (undo === null) return
    const timer = setTimeout(() => setUndo(null), 10_000)
    return () => clearTimeout(timer)
  }, [undo])

  /**
   * Lo dictado es siempre una fórmula completa: reemplaza la fórmula, o solo el fragmento
   * seleccionado si el usuario marcó uno (para dictar una subfórmula).
   */
  function insertDictated(formula: string) {
    setUndo(value)
    const element = textarea.current
    const selected = element !== null && element.selectionStart !== element.selectionEnd
    if (selected) {
      insert(formula)
    } else {
      pendingCursor.current = formula.length
      onChange(formula)
    }
  }

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
        {voice && (
          <button
            type="button"
            onClick={() => setDictating((open) => !open)}
            disabled={!canDictate}
            aria-pressed={dictating}
            title={
              canDictate
                ? 'Dictar la fórmula (Ctrl + M)'
                : 'Este navegador no permite dictar. Usa Chrome o Edge.'
            }
            className={`ml-auto flex items-center gap-1.5 rounded-md border px-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
              compact ? 'h-8' : 'h-10'
            } ${
              dictating
                ? 'border-accent bg-accent text-surface'
                : 'border-line bg-surface text-ink hover:border-accent hover:bg-accent-soft'
            }`}
          >
            <MicIcon />
            Dictar
          </button>
        )}
      </div>

      {voice && dictating && (
        <VoiceDictation
          language={voice.language}
          speaker={voice.speaker}
          onInsert={insertDictated}
          onEvaluate={(formula) => {
            insertDictated(formula)
            voice.onEvaluate()
          }}
          onDeclare={voice.onDeclare}
          onClose={() => setDictating(false)}
        />
      )}
      {undo !== null && !dictating && (
        <p className="mb-1.5 flex items-center gap-2 text-sm text-muted" role="status">
          Se insertó la fórmula dictada.
          <button
            type="button"
            className="font-bold text-accent underline-offset-2 hover:underline"
            onClick={() => {
              onChange(undo)
              setUndo(null)
            }}
          >
            Deshacer
          </button>
        </p>
      )}

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
