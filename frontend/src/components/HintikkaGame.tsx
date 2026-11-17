import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  api,
  ApiError,
  type GameMove,
  type GameRole,
  type GameState,
  type ProjectIn,
} from '../api/client'
import { Notation } from '../lib/notation'
import { sfx } from '../lib/sound'

/** Pausa antes de que la máquina juegue, para que se pueda seguir la partida. */
const MACHINE_DELAY = 1200

const ROLE_INFO: Record<
  GameRole,
  { name: string; claim: string; color: string; soft: string }
> = {
  verificador: {
    name: 'Verificador',
    claim: 'VERDADERA',
    color: 'text-true',
    soft: 'bg-true-soft border-true',
  },
  falsificador: {
    name: 'Falsificador',
    claim: 'FALSA',
    color: 'text-false',
    soft: 'bg-false-soft border-false',
  },
}

const opponent = (role: GameRole): GameRole =>
  role === 'verificador' ? 'falsificador' : 'verificador'

interface HistoryEntry {
  actor: 'tú' | 'máquina' | 'regla' | 'final'
  /** Lo que pasó, en palabras. */
  text: string
  /** La razón en notación del curso (opcional). */
  formal?: string
  mistake?: boolean
}

type Phase =
  | { kind: 'choose' }
  | { kind: 'playing'; state: GameState }
  | { kind: 'finished'; state: GameState; userWon: boolean }

/** "con x = a, y = b" para las variables ya elegidas. */
function withValues(state: GameState): string {
  const values = Object.entries(state.environment)
  return values.length ? ` con ${values.map(([v, e]) => `${v} = ${e}`).join(', ')}` : ''
}

/** "¬(A ∧ B)" → "A ∧ B": la condición de una implicación, sin la negación agregada. */
function withoutNegation(label: string): string {
  const inner = label.replace(/^¬/, '')
  return inner.startsWith('(') && inner.endsWith(')') ? inner.slice(1, -1) : inner
}

/**
 * Juego semántico de Hintikka contra la máquina, explicado en palabras. Toda la lógica
 * (jugadas válidas, estrategia ganadora, quién gana) la decide el backend.
 */
export function HintikkaGame({
  project,
  value,
}: {
  project: ProjectIn
  /** Valor de verdad de la fórmula, si ya se evaluó (para decir quién tenía estrategia ganadora). */
  value: boolean | null
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' })
  const [initialRole, setInitialRole] = useState<GameRole>('verificador')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Evita actualizar el estado si se cierra el juego con una petición en curso. Se vuelve
  // a marcar en cada montaje: en desarrollo React monta, desmonta y vuelve a montar.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  async function call<T>(action: () => Promise<T>): Promise<T | null> {
    try {
      return await action()
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : 'El juego no respondió.')
      return null
    }
  }

  /** Mensaje cuando una negación cambia de bando al usuario. */
  function swapEntry(next: GameState, atStart: boolean): HistoryEntry {
    return {
      actor: 'regla',
      text:
        `${atStart ? 'La fórmula empieza con' : 'Apareció'} un «no» (¬). Decir que «no φ» es ` +
        `${ROLE_INFO[opponent(next.user_role)].claim.toLowerCase()} es lo mismo que decir que φ es ` +
        `${ROLE_INFO[next.user_role].claim.toLowerCase()}: cambiaste de bando. Ahora defiendes ` +
        `que «${next.formula}» es ${ROLE_INFO[next.user_role].claim}.`,
    }
  }

  /** Aplica la respuesta de una jugada y, si se llegó a una fórmula atómica, pide el desenlace. */
  async function advance(previous: GameState, result: GameMove, entry: HistoryEntry | null) {
    const entries: HistoryEntry[] = entry ? [entry] : []
    const next = result.state
    if (next.user_role !== previous.user_role) entries.push(swapEntry(next, false))
    if (result.finished) {
      // La jugada llevó a una fórmula atómica: el desenlace explica quién gana y por qué.
      const end = await call(() => api.gameMove(toStateIn(next), null))
      if (!end || !alive.current) return
      const userWon = end.winner === 'usuario'
      const atomTrue = userWon === (end.state.user_role === 'verificador')
      entries.push({
        actor: 'final',
        text:
          `Ya no hay nada que elegir: se revisa «${end.state.formula}»${withValues(end.state)} ` +
          `en la interpretación y es ${atomTrue ? 'VERDADERA' : 'FALSA'}.`,
        formal: end.commentary,
      })
      setHistory((h) => [...h, ...entries])
      setPhase({ kind: 'finished', state: end.state, userWon })
      sfx.play(userWon ? 'verdadero' : 'falso')
      return
    }
    setHistory((h) => [...h, ...entries])
    setPhase({ kind: 'playing', state: next })
  }

  async function start(role: GameRole) {
    setError(null)
    setHistory([])
    setInitialRole(role)
    const state = await call(() => api.gameStart(project, role))
    if (!state || !alive.current) return
    const first: HistoryEntry[] = [
      {
        actor: 'tú',
        text: `Dices que la fórmula es ${ROLE_INFO[role].claim}. La máquina dice lo contrario.`,
      },
    ]
    if (state.user_role !== role) first.push(swapEntry(state, true))
    setHistory(first)
    if (state.turn === null) {
      // La fórmula ya es atómica: no hay jugadas, solo el desenlace.
      const atomic: GameMove = {
        state,
        finished: true,
        winner: null,
        commentary: '',
        machine_move: null,
        mistake: false,
      }
      await advance(state, atomic, null)
      return
    }
    setPhase({ kind: 'playing', state })
  }

  async function play(move: string, label: string) {
    if (phase.kind !== 'playing') return
    sfx.play('seleccionar')
    const before = phase.state
    const result = await call(() => api.gameMove(toStateIn(before), move))
    if (!result || !alive.current) return
    const quantifier = before.kind === 'existe' || before.kind === 'para todo'
    await advance(before, result, {
      actor: 'tú',
      text: quantifier
        ? `Elegiste ${label}.`
        : `Elegiste defender que ${label.charAt(0).toLowerCase()}${label.slice(1)}.`,
      mistake: result.mistake,
    })
  }

  // La máquina juega sola cuando es su turno.
  const machineTurn = phase.kind === 'playing' && phase.state.turn === 'máquina'
  useEffect(() => {
    if (!machineTurn || phase.kind !== 'playing') return
    const before = phase.state
    setThinking(true)
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = setTimeout(
      async () => {
        const result = await call(() => api.gameMove(toStateIn(before), null))
        if (!alive.current) return
        setThinking(false)
        if (!result) return
        sfx.play('seleccionar')
        await advance(before, result, {
          actor: 'máquina',
          text: `La máquina elige ${plainMove(before, result.machine_move ?? '')}.`,
          formal: result.commentary,
        })
      },
      reduced ? 0 : MACHINE_DELAY,
    )
    return () => clearTimeout(timer)
    // solo cuando cambia la posición
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineTurn, phase])

  if (phase.kind === 'choose') {
    return <ChooseRole formula={project.formula} onChoose={start} error={error} />
  }

  const state = phase.state
  const winningRole: GameRole | null =
    value === null ? null : value ? 'verificador' : 'falsificador'
  const mistake = history.find((h) => h.mistake)

  return (
    <div className="space-y-4">
      <Claim formula={project.formula} state={state} finished={phase.kind === 'finished'} />

      {phase.kind === 'playing' && state.turn === 'usuario' && (
        <section
          aria-label="Tu jugada"
          className="rounded-lg border border-accent bg-accent-soft/50 p-4"
        >
          <Guide state={state} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {state.options.map((option, i) => (
              <button
                key={option.move}
                type="button"
                onClick={() => void play(option.move, plainOption(state, option.label, i))}
                className="rounded-lg border border-line bg-surface px-4 py-2.5 text-left hover:border-accent hover:bg-accent-soft"
              >
                <span className="block font-bold">{plainOption(state, option.label, i)}</span>
                {state.kind !== 'existe' && state.kind !== 'para todo' && (
                  <span className="formula text-base text-muted">{option.label}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {phase.kind === 'playing' && state.turn === 'máquina' && (
        <section
          aria-label="Turno de la máquina"
          className="rounded-lg border border-line p-4"
          role="status"
        >
          <p className="font-bold">Le toca a la máquina.</p>
          <p className="mt-1 text-muted">{machineIntent(state)}</p>
          {thinking && <p className="mt-2 text-sm text-muted">Está pensando su jugada…</p>}
        </section>
      )}

      {phase.kind === 'finished' && (
        <section
          role="status"
          className={`rounded-lg border-l-8 px-5 py-4 ${phase.userWon ? 'border-true bg-true-soft' : 'border-false bg-false-soft'}`}
        >
          <p className={`text-2xl font-bold ${phase.userWon ? 'text-true' : 'text-false'}`}>
            {phase.userWon ? '¡Ganaste!' : 'Ganó la máquina'}
          </p>
          <p className="mt-1">
            {history.at(-1)?.text}{' '}
            {phase.userWon
              ? `Tú defendías que era ${ROLE_INFO[state.user_role].claim}: tenías razón.`
              : `Tú defendías que era ${ROLE_INFO[state.user_role].claim}: no se cumplió.`}
          </p>
          {winningRole && (
            <p className="mt-2">
              {initialRole === winningRole
                ? mistake
                  ? 'Tenías la razón desde el principio, pero en la jugada marcada abajo elegiste mal. Con otra elección habrías ganado.'
                  : 'Tenías la razón desde el principio y elegiste bien en cada paso.'
                : `La fórmula completa es ${value ? 'VERDADERA' : 'FALSA'}, así que estabas en el bando equivocado: contra una máquina que elige bien no se puede ganar desde ahí. Prueba con el otro bando.`}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            Por eso el juego funciona como prueba: quien dice «verdadera» puede ganar siempre si y
            solo si la fórmula es verdadera (ℐ ⊨ φ). Sus jugadas ganadoras son los testigos; las
            del otro bando, los contraejemplos.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void start(initialRole)}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-bold text-surface hover:opacity-90"
            >
              Jugar de nuevo
            </button>
            <button
              type="button"
              onClick={() => void start(opponent(initialRole))}
              className="rounded-md border border-line bg-surface px-4 py-1.5 text-sm hover:bg-sunken"
            >
              Probar diciendo que es {ROLE_INFO[opponent(initialRole)].claim}
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-false">{error}</p>}

      {history.length > 0 && (
        <section aria-label="Historial">
          <h3 className="mb-1.5 text-sm font-bold text-muted">Lo que ha pasado</h3>
          <ol className="space-y-1.5">
            {history.map((entry, i) => (
              <li
                key={i}
                className={`flex gap-3 rounded-md px-3 py-2 text-sm ${
                  entry.mistake ? 'bg-warn-soft' : 'bg-sunken'
                }`}
              >
                <span className="w-16 shrink-0 font-bold">{ACTOR_LABEL[entry.actor]}</span>
                <span className="min-w-0 flex-1">
                  {entry.text}
                  {entry.mistake && (
                    <span className="mt-0.5 block font-bold text-warn">
                      Aquí perdiste: con otra opción habrías ganado.
                    </span>
                  )}
                  {entry.formal && (
                    <span className="formula mt-0.5 block text-[0.95rem] text-muted">
                      <Notation text={entry.formal} />
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}

const ACTOR_LABEL: Record<HistoryEntry['actor'], string> = {
  tú: 'Tú',
  máquina: 'Máquina',
  regla: 'Regla',
  final: 'Final',
}

/** Qué tienes que hacer en tu turno, en palabras, según el tipo de fórmula. */
function Guide({ state }: { state: GameState }) {
  const quoted = (text: string) => <span className="formula text-[1.05em]">«{text}»</span>
  let title: ReactNode
  let detail: string
  switch (state.kind) {
    case 'existe':
      title = (
        <>
          Dices que <b>existe</b> un {state.variable} que cumple {quoted(state.body ?? '')}.
        </>
      )
      detail = `Demuéstralo: elige ese ${state.variable}. Si eliges uno que cumpla, sigues ganando.`
      break
    case 'para todo':
      title = (
        <>
          Dices que <b>no todos</b> los {state.variable} cumplen {quoted(state.body ?? '')}.
        </>
      )
      detail = `Demuéstralo: elige un ${state.variable} que NO cumpla (un contraejemplo).`
      break
    case 'o':
      title = <>Dices que {quoted(state.formula)} es VERDADERA.</>
      detail = 'Con «o» basta que una de las dos partes sea verdadera: elige cuál vas a defender.'
      break
    case 'y':
      title = <>Dices que {quoted(state.formula)} es FALSA.</>
      detail = 'Con «y» basta que una de las dos partes sea falsa: elige cuál vas a atacar.'
      break
    default:
      title = <>Dices que {quoted(state.formula)} es VERDADERA.</>
      detail =
        'Un «si… entonces» es verdadero si la condición es falsa o si la conclusión es verdadera: elige qué vas a defender.'
  }
  return (
    <>
      <p className="text-lg">{title}</p>
      <p className="mt-1 text-muted">{detail}</p>
    </>
  )
}

/** Texto de una opción, en palabras. */
function plainOption(state: GameState, label: string, index: number): string {
  switch (state.kind) {
    case 'existe':
    case 'para todo':
      return label.replace('↦', '=')
    case 'o':
      return `«${label}» es verdadera`
    case 'y':
      return `«${label}» es falsa`
    default:
      return index === 0
        ? `La condición «${withoutNegation(label)}» es falsa`
        : `La conclusión «${label}» es verdadera`
  }
}

/** La jugada de la máquina, en palabras ("x = a" o "la parte «…»"). */
function plainMove(state: GameState, label: string): string {
  if (state.kind === 'existe' || state.kind === 'para todo') return label.replace('↦', '=')
  if (state.kind === 'implica') {
    return label.startsWith('¬')
      ? `defender que la condición «${withoutNegation(label)}» es falsa`
      : `defender que la conclusión «${label}» es verdadera`
  }
  return `la parte «${label}»`
}

/** Qué va a hacer la máquina, según su bando y el tipo de fórmula. */
function machineIntent(state: GameState): string {
  switch (state.kind) {
    case 'existe':
      return `Ella dice que existe un ${state.variable} que cumple «${state.body}», y va a elegirlo.`
    case 'para todo':
      return `Ella dice que no todos los ${state.variable} cumplen «${state.body}», y va a buscar uno que no cumpla.`
    case 'o':
      return 'Ella dice que la fórmula es verdadera: va a elegir la parte que cree verdadera.'
    case 'y':
      return 'Ella dice que la fórmula es falsa: va a elegir la parte que cree falsa.'
    default:
      return 'Ella dice que el «si… entonces» es verdadero: va a defender que la condición es falsa o que la conclusión es verdadera.'
  }
}

/** El estado como lo espera la API (sin los campos que solo sirven para mostrar). */
function toStateIn(state: GameState) {
  return {
    project: state.project,
    start: state.start,
    end: state.end,
    environment: state.environment,
    env_label: state.env_label,
    user_role: state.user_role,
  }
}

/** Lo que defiendes ahora: la parte de la fórmula que se discute y si dices que es V o F. */
function Claim({
  formula,
  state,
  finished,
}: {
  formula: string
  state: GameState
  finished: boolean
}) {
  const start = Math.max(0, Math.min(state.start, formula.length))
  const end = Math.max(start, Math.min(state.end, formula.length))
  const info = ROLE_INFO[state.user_role]
  return (
    <section aria-label="Lo que defiendes" className="rounded-lg border border-line px-4 py-3">
      <p className="formula text-xl leading-relaxed break-words">
        <span className="text-muted">{formula.slice(0, start)}</span>
        <mark className="rounded bg-accent-soft px-0.5 text-ink">{formula.slice(start, end)}</mark>
        <span className="text-muted">{formula.slice(end)}</span>
      </p>
      <p className="mt-2 text-lg">
        {finished ? 'Defendías' : 'Defiendes'} que{' '}
        <span className="formula">«{state.formula}»</span>
        {withValues(state)} es{' '}
        <b className={info.color}>{info.claim}</b>.
      </p>
      <p className="text-sm text-muted">
        La máquina defiende lo contrario. Tú eres el {info.name}; ella, el{' '}
        {ROLE_INFO[opponent(state.user_role)].name}.
      </p>
    </section>
  )
}

function ChooseRole({
  formula,
  onChoose,
  error,
}: {
  formula: string
  onChoose: (role: GameRole) => void
  error: string | null
}) {
  return (
    <div className="space-y-4">
      <p className="formula text-2xl break-words">{formula}</p>
      <p className="text-lg">
        Es un debate contra la máquina: tú dices si la fórmula es verdadera o falsa y ella dice lo
        contrario.
      </p>
      <p className="text-muted">
        La fórmula se va desarmando paso a paso. En cada paso elige quien tiene que dar la prueba
        (por ejemplo, quien dice «existe un x» tiene que mostrar cuál). Al final queda algo que se
        revisa en la interpretación, y gana quien tenía razón ahí.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['verificador', 'falsificador'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChoose(role)}
            className={`rounded-lg border-2 px-4 py-3 text-left hover:opacity-90 ${ROLE_INFO[role].soft}`}
          >
            <span className={`block text-lg font-bold ${ROLE_INFO[role].color}`}>
              Yo digo que es {ROLE_INFO[role].claim}
            </span>{' '}
            <span className="text-sm text-ink">Juegas como {ROLE_INFO[role].name}.</span>
          </button>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted select-none">
          Reglas: ¿quién elige en cada paso?
        </summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-1">Si la fórmula dice…</th>
              <th className="py-1">Elige</th>
              <th className="py-1">Porque…</th>
            </tr>
          </thead>
          <tbody className="[&_td]:py-1">
            <tr className="border-b border-line"><td><span className="formula">∃x</span> «existe un x»</td><td className="text-true">quien dice VERDADERA</td><td>tiene que mostrar cuál (el testigo)</td></tr>
            <tr className="border-b border-line"><td><span className="formula">∀x</span> «para todo x»</td><td className="text-false">quien dice FALSA</td><td>tiene que mostrar uno que falle (el contraejemplo)</td></tr>
            <tr className="border-b border-line"><td><span className="formula">∨</span> «o»</td><td className="text-true">quien dice VERDADERA</td><td>le basta una parte verdadera</td></tr>
            <tr className="border-b border-line"><td><span className="formula">∧</span> «y»</td><td className="text-false">quien dice FALSA</td><td>le basta una parte falsa</td></tr>
            <tr className="border-b border-line"><td><span className="formula">→</span> «si… entonces»</td><td className="text-true">quien dice VERDADERA</td><td>defiende que la condición es falsa o la conclusión verdadera (<span className="formula">φ → ψ ≡ ¬φ ∨ ψ</span>)</td></tr>
            <tr><td><span className="formula">¬</span> «no»</td><td>nadie</td><td>los dos cambian de bando</td></tr>
          </tbody>
        </table>
      </details>
      {error && <p className="text-sm text-false">{error}</p>}
    </div>
  )
}
