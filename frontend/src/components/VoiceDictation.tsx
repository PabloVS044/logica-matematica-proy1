import { useCallback, useEffect, useRef, useState } from 'react'

import {
  api,
  type LanguageIn,
  type SpeechMark,
  type SpeechTranslation,
  type SymbolProposal,
} from '../api/client'
import { useDictation } from '../lib/useDictation'
import { useLiveRequest } from '../lib/useLiveRequest'
import type { Speaker } from '../lib/useSpeaker'
import { useVoiceSettings } from '../store/voiceStore'

/** Ejemplos de la ayuda: se pueden escuchar. */
const EXAMPLES = [
  'para todo x tal que P de x implica Q de x',
  'existe y tal que R de x coma y',
  'no es cierto que P de x y Q de x',
  'para todo x, y, abre paréntesis R de x coma y o x es igual a y cierra paréntesis',
  'f de x es distinto de c',
]

const VOCABULARY: [string, string][] = [
  ['para todo, para cada', '∀'],
  ['existe, hay un', '∃'],
  ['no', '¬'],
  ['no es cierto que … (hasta el final)', '¬( … )'],
  ['y', '∧'],
  ['o', '∨'],
  ['implica, entonces, si … entonces', '→'],
  ['es igual a / es distinto de', '=  /  ≠'],
  ['P de x coma y', 'P(x, y)'],
  ['abre / cierra paréntesis', '(  )'],
  ['tal que, o una pausa tras la variable', 'alcance hasta el final'],
  ['equis, i griega, zeta, pe, erre …', 'x, y, z, P, R …'],
]

const COMMANDS: [string, string][] = [
  ['«borra eso»', 'quita la última frase'],
  ['«borra todo»', 'empieza de nuevo'],
  ['«listo»', 'inserta la fórmula'],
  ['«evaluar»', 'inserta y evalúa'],
  ['«cancelar»', 'cierra sin insertar'],
  ['«declara»', 'declara el símbolo que falta'],
]

const ROLE_STYLE: Record<SpeechMark['role'], string> = {
  'palabra clave': 'text-accent',
  símbolo: 'font-bold text-ink',
  variable: 'italic text-true',
  desconocida: 'text-false underline decoration-wavy decoration-false underline-offset-4',
}

/** "Q como predicado de aridad 1", "c como constante". */
function describe(proposal: SymbolProposal): string {
  if (proposal.kind === 'constante') return `${proposal.name} como constante`
  return `${proposal.name} como ${proposal.kind} de aridad ${proposal.arity}`
}

/** La transcripción con cada palabra coloreada según cómo se interpretó. */
function MarkedTranscript({ text, marks }: { text: string; marks: readonly SpeechMark[] }) {
  const parts: React.ReactNode[] = []
  let position = 0
  for (const mark of marks) {
    if (mark.start < position || mark.end > text.length) continue
    parts.push(text.slice(position, mark.start))
    parts.push(
      <span
        key={mark.start}
        className={ROLE_STYLE[mark.role]}
        title={mark.meaning ? `${mark.role}: ${mark.meaning}` : mark.role}
      >
        {text.slice(mark.start, mark.end)}
      </span>,
    )
    position = mark.end
  }
  parts.push(text.slice(position))
  return <>{parts}</>
}

export function VoiceDictation({
  language,
  speaker,
  onInsert,
  onEvaluate,
  onDeclare,
  onClose,
}: {
  /** Declara en el lenguaje el símbolo que falta para entender lo dictado. */
  onDeclare: (proposal: SymbolProposal) => void
  language: LanguageIn
  speaker: Speaker
  /** Inserta la fórmula dictada en el editor. */
  onInsert: (formula: string) => void
  /** Inserta y pide evaluar (comando «evaluar»). */
  onEvaluate: (formula: string) => void
  onClose: () => void
}) {
  const settings = useVoiceSettings()
  const [phrases, setPhrases] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const queue = useRef(Promise.resolve())
  // «listo» y «evaluar» esperan a que termine la traducción de lo último que se dijo.
  const [pendingAction, setPendingAction] = useState<'accept' | 'evaluate' | 'declare' | null>(
    null,
  )
  const cancelRef = useRef(() => {})

  // Las frases se procesan en orden: primero se pregunta si son un comando.
  const handlePhrase = useCallback((phrase: string) => {
    queue.current = queue.current.then(async () => {
      const { command } = await api.voiceCommand(phrase).catch(() => ({ command: null }))
      switch (command) {
        case 'borrar':
          setPhrases((p) => p.slice(0, -1))
          setNotice('Se borró la última frase.')
          return
        case 'vaciar':
          setPhrases([])
          setNotice('Se borró todo lo dictado.')
          return
        case 'aceptar':
          setPendingAction('accept')
          return
        case 'evaluar':
          setPendingAction('evaluate')
          return
        case 'cancelar':
          cancelRef.current()
          return
        case 'declarar':
          setPendingAction('declare')
          return
        default:
          setNotice(null)
          setPhrases((p) => [...p, phrase])
      }
    })
  }, [])

  const dictation = useDictation(handlePhrase)
  const transcript = [...phrases, dictation.interim].filter(Boolean).join(' ')
  const committed = phrases.join(' ')
  const translation = useLiveRequest(
    { language, transcript },
    (input, signal) => api.translateSpeech(input.language, input.transcript, signal),
    250,
    transcript.trim() !== '',
  )
  const result: SpeechTranslation | null = transcript.trim() ? translation.data : null

  const readBack = useCallback(
    (text: string | null | undefined) => {
      if (text && settings.readBack) void speaker.speak(`Entendí: ${text}`)
    },
    [settings.readBack, speaker],
  )

  // Al declarar cambia el lenguaje y la transcripción se vuelve a traducir sola.
  function declare(proposal: SymbolProposal) {
    onDeclare(proposal)
    setNotice(
      `Se declaró ${describe(proposal)}. Falta definir ${proposal.name}ᴵ en la interpretación.`,
    )
  }

  function cancel() {
    dictation.stop()
    speaker.stop()
    onClose()
  }
  useEffect(() => {
    cancelRef.current = cancel
  })

  useEffect(() => {
    if (!pendingAction || translation.pending) return
    setPendingAction(null)
    if (pendingAction === 'declare') {
      if (result?.proposal) declare(result.proposal)
      else setNotice('No hay ningún símbolo que declarar.')
      return
    }
    if (!result?.ok || !result.formula) {
      setNotice(
        pendingAction === 'accept'
          ? 'Todavía no hay una fórmula válida para insertar.'
          : 'Todavía no hay una fórmula válida para evaluar.',
      )
      return
    }
    dictation.stop()
    if (pendingAction === 'accept') {
      onInsert(result.formula)
      readBack(result.spoken)
    } else {
      onEvaluate(result.formula)
    }
    onClose()
    // se ejecuta cuando la acción pedida y la traducción están listas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, translation.pending, result])

  // Empieza a escuchar al abrir el panel; la voz de la app se calla para no oírse a sí misma.
  useEffect(() => {
    speaker.stop()
    dictation.start()
    return () => dictation.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Escape cancela.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function stopListening() {
    dictation.stop()
    readBack(result?.ok ? result.spoken : null)
  }

  function listenAgain() {
    speaker.stop()
    dictation.start()
  }

  const marks = result && transcript.startsWith(committed) ? result.marks : []
  const error = result && !result.ok ? result.diagnostics[0] : null
  const button =
    'rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-sunken disabled:opacity-50'

  return (
    <section
      aria-label="Dictado por voz"
      className="mb-2 rounded-lg border border-accent/40 bg-accent-soft/60 px-3 py-2.5"
    >
      <div className="flex items-center gap-2">
        {dictation.listening ? (
          <span className="flex items-center gap-2 text-sm font-bold text-accent" role="status">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-false opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-false" />
            </span>
            Escuchando… di la fórmula
          </span>
        ) : (
          <span className="text-sm font-bold text-muted" role="status">
            Micrófono en pausa
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={settings.readBack}
              onChange={(e) => settings.set({ readBack: e.target.checked })}
            />
            Leer en voz alta lo entendido
          </label>
        </span>
      </div>

      <p className="mt-2 min-h-7 text-lg leading-snug" aria-live="polite">
        {transcript ? (
          <>
            <MarkedTranscript text={committed} marks={marks} />
            {dictation.interim && (
              <span className="text-muted italic"> {dictation.interim}</span>
            )}
          </>
        ) : (
          <span className="text-muted">
            Por ejemplo: «para todo x tal que P de x implica Q de x»
          </span>
        )}
      </p>

      {result?.ok && result.formula && (
        <div className="mt-2 rounded-md bg-surface px-3 py-2">
          <p className="formula text-2xl leading-snug break-words">{result.formula}</p>
          {result.parenthesized !== result.formula && (
            <p className="mt-0.5 text-sm text-muted">
              Se interpreta como{' '}
              <span className="formula text-base text-ink">{result.parenthesized}</span>
            </p>
          )}
        </div>
      )}
      {error && !dictation.interim && (
        <div className="mt-2 rounded-md bg-false-soft px-2 py-1.5 text-sm text-false">
          <p>{error.message}</p>
          {result?.proposal && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={() => declare(result.proposal!)}
                className="rounded-md bg-accent px-3 py-1 font-bold text-surface hover:opacity-90"
              >
                Declarar {describe(result.proposal)}
              </button>
              {result.proposal.formula ? (
                <span className="text-ink">
                  quedaría <span className="formula text-base">{result.proposal.formula}</span>
                </span>
              ) : (
                <span className="text-ink">después falta declarar otro símbolo</span>
              )}
              <span className="text-muted">o di «declara»</span>
            </div>
          )}
        </div>
      )}
      {translation.error && <p className="mt-2 text-sm text-false">{translation.error}</p>}
      {dictation.error && <p className="mt-2 text-sm text-false">{dictation.error}</p>}
      {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {dictation.listening ? (
          <button type="button" className={button} onClick={stopListening}>
            Pausar
          </button>
        ) : (
          <button type="button" className={button} onClick={listenAgain}>
            Seguir dictando
          </button>
        )}
        <button
          type="button"
          className={button}
          disabled={!result?.ok || !speaker.supported}
          onClick={() => result?.spoken && void speaker.speak(result.spoken)}
        >
          Escuchar
        </button>
        <button
          type="button"
          className={button}
          disabled={phrases.length === 0}
          onClick={() => setPhrases((p) => p.slice(0, -1))}
        >
          Borrar última frase
        </button>
        <button type="button" className={button} onClick={cancel}>
          Cancelar
        </button>
        <button
          type="button"
          disabled={!result?.ok || translation.pending}
          onClick={() => setPendingAction('accept')}
          className="ml-auto rounded-md bg-accent px-4 py-1.5 text-sm font-bold text-surface hover:opacity-90 disabled:opacity-50"
        >
          Insertar fórmula
        </button>
      </div>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted select-none">¿Qué puedo decir?</summary>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <table className="w-full">
            <caption className="mb-1 text-left font-bold">Vocabulario</caption>
            <tbody>
              {VOCABULARY.map(([say, means]) => (
                <tr key={say} className="border-t border-line">
                  <td className="py-0.5 pr-2">{say}</td>
                  <td className="formula py-0.5 text-base">{means}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <p className="mb-1 font-bold">Comandos</p>
            <ul className="mb-3">
              {COMMANDS.map(([say, does]) => (
                <li key={say}>
                  {say} <span className="text-muted">{does}</span>
                </li>
              ))}
            </ul>
            <p className="mb-1 font-bold">Ejemplos</p>
            <ul className="space-y-1">
              {EXAMPLES.map((example) => (
                <li key={example} className="flex items-start gap-2">
                  {speaker.supported && (
                    <button
                      type="button"
                      aria-label={`Escuchar: ${example}`}
                      onClick={() => {
                        dictation.stop()
                        void speaker.speak(example)
                      }}
                      className="rounded border border-line px-1.5 text-xs hover:bg-sunken"
                    >
                      ▶
                    </button>
                  )}
                  <span>«{example}»</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Si dices «y» donde va una variable, es la variable y; entre dos fórmulas es «∧».
            </p>
          </div>
        </div>
      </details>
    </section>
  )
}
