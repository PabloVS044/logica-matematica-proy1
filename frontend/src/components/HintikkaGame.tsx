import { useEffect, useRef, useState } from 'react'

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
const MACHINE_DELAY = 900

const ROLE_INFO: Record<GameRole, { name: string; goal: string; color: string; soft: string }> = {
  verificador: {
    name: 'Verificador',
    goal: 'mostrar que la fórmula es verdadera',
    color: 'text-true',
    soft: 'bg-true-soft border-true',
  },
  falsificador: {
    name: 'Falsificador',
    goal: 'mostrar que la fórmula es falsa',
    color: 'text-false',
    soft: 'bg-false-soft border-false',
  },
}

const opponent = (role: GameRole): GameRole =>
  role === 'verificador' ? 'falsificador' : 'verificador'

interface HistoryEntry {
  actor: 'tú' | 'máquina' | 'regla' | 'final'
  text: string
  mistake?: boolean
}

type Phase =
  | { kind: 'choose' }
  | { kind: 'playing'; state: GameState }
  | { kind: 'finished'; state: GameState; userWon: boolean }

/**
 * Juego semántico de Hintikka contra la máquina. Toda la lógica (jugadas válidas,
 * estrategia ganadora, quién gana) la decide el backend; aquí solo se muestra.
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
      if (alive.current) {
        setError(e instanceof ApiError ? e.message : 'El juego no respondió.')
      }
      return null
    }
  }

  /** Aplica la respuesta de una jugada y, si se llegó a una fórmula atómica, pide el desenlace. */
  async function advance(previous: GameState, result: GameMove, entry: HistoryEntry | null) {
    const entries: HistoryEntry[] = entry ? [entry] : []
    const next = result.state
    if (next.user_role !== previous.user_role) {
      entries.push({
        actor: 'regla',
        text: `Hay una negación ¬: se intercambian los papeles. Ahora eres el ${ROLE_INFO[next.user_role].name}.`,
      })
    }
    if (result.finished) {
      // La jugada llevó a una fórmula atómica: el desenlace explica quién gana y por qué.
      const end = await call(() => api.gameMove(toStateIn(next), null))
      if (!end || !alive.current) return
      const userWon = end.winner === 'usuario'
      entries.push({ actor: 'final', text: end.commentary })
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
    const entries: HistoryEntry[] = []
    if (state.user_role !== role) {
      entries.push({
        actor: 'regla',
        text: `La fórmula empieza con ¬: se intercambian los papeles. Ahora eres el ${ROLE_INFO[state.user_role].name}.`,
      })
    }
    setHistory(entries)
    if (state.turn === null) {
      // La fórmula ya es atómica: no hay jugadas, solo el desenlace.
      await advance(state, { state, finished: true, winner: null, commentary: '', machine_move: null, mistake: false }, null)
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
    await advance(before, result, {
      actor: 'tú',
      text: `Elegiste ${label}.`,
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
        await advance(before, result, { actor: 'máquina', text: result.commentary })
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
  const userRole = state.user_role
  const winningRole: GameRole | null =
    value === null ? null : value ? 'verificador' : 'falsificador'
  const mistake = history.find((h) => h.mistake)

  return (
    <div className="space-y-4">
      <Position formula={project.formula} state={state} />

      <div className="grid gap-2 sm:grid-cols-2">
        <PlayerCard who="Tú" wants="Quieres" role={userRole} active={state.turn === 'usuario'} />
        <PlayerCard
          who="La máquina"
          wants="Quiere"
          role={opponent(userRole)}
          active={state.turn === 'máquina'}
        />
      </div>

      {phase.kind === 'playing' && state.turn === 'usuario' && (
        <section aria-label="Tu jugada" className="rounded-lg border border-accent bg-accent-soft/50 p-4">
          <p className="font-bold">{prompt(state)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {state.options.map((option) => (
              <button
                key={option.move}
                type="button"
                onClick={() => void play(option.move, option.label)}
                className="formula rounded-lg border border-line bg-surface px-4 py-2 text-lg hover:border-accent hover:bg-accent-soft"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {phase.kind === 'playing' && thinking && (
        <p className="rounded-lg border border-line px-4 py-3 text-muted" role="status">
          La máquina está pensando su jugada…
        </p>
      )}

      {phase.kind === 'finished' && (
        <section
          role="status"
          className={`rounded-lg border-l-8 px-5 py-4 ${phase.userWon ? 'border-true bg-true-soft' : 'border-false bg-false-soft'}`}
        >
          <p className={`text-2xl font-bold ${phase.userWon ? 'text-true' : 'text-false'}`}>
            {phase.userWon ? '¡Ganaste!' : 'Ganó la máquina'}
          </p>
          <p className="formula mt-1 text-lg">
            <Notation text={history.at(-1)?.text ?? ''} />
          </p>
          {winningRole && (
            <p className="mt-2 text-sm">
              {initialRole === winningRole
                ? mistake
                  ? 'Empezaste con estrategia ganadora, pero la perdiste en la jugada marcada en el historial.'
                  : 'Empezaste con estrategia ganadora y la mantuviste hasta el final.'
                : `La fórmula es ${value ? 'verdadera' : 'falsa'}, así que el ${ROLE_INFO[winningRole].name} tenía estrategia ganadora: con el otro papel no se puede ganar contra una máquina que juega bien.`}
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            Teorema del juego: el Verificador tiene una estrategia ganadora si y solo si ℐ ⊨ φ.
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
              Jugar como {ROLE_INFO[opponent(initialRole)].name}
            </button>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-false">{error}</p>}

      {history.length > 0 && (
        <section aria-label="Historial">
          <h3 className="mb-1.5 text-sm font-bold text-muted">Historial de la partida</h3>
          <ol className="space-y-1.5">
            {history.map((entry, i) => (
              <li
                key={i}
                className={`flex gap-2 rounded-md px-3 py-1.5 text-sm ${
                  entry.mistake ? 'bg-warn-soft' : 'bg-sunken'
                }`}
              >
                <span className="w-20 shrink-0 font-bold">{ACTOR_LABEL[entry.actor]}</span>
                <span className="formula min-w-0 flex-1 text-[0.95rem]">
                  <Notation text={entry.text} />
                  {entry.mistake && (
                    <span className="ml-2 font-sans text-sm font-bold text-warn">
                      Aquí perdiste tu estrategia ganadora.
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

/** Qué se pide en tu turno, según tu papel y el tipo de elección. */
function prompt(state: GameState): string {
  const quantifier = state.options.some((o) => o.label.includes('↦'))
  const variable = quantifier ? state.options[0].label.split('↦')[0].trim() : ''
  if (state.user_role === 'verificador') {
    return quantifier
      ? `Elige un testigo: un valor de ${variable} con el que la fórmula sea verdadera.`
      : 'Elige la parte que creas verdadera (basta con una).'
  }
  return quantifier
    ? `Elige un contraejemplo: un valor de ${variable} con el que la fórmula sea falsa.`
    : 'Elige la parte que creas falsa (basta con una).'
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

function Position({ formula, state }: { formula: string; state: GameState }) {
  const start = Math.max(0, Math.min(state.start, formula.length))
  const end = Math.max(start, Math.min(state.end, formula.length))
  const env = Object.entries(state.environment)
  return (
    <section aria-label="Posición" className="rounded-lg border border-line px-4 py-3">
      <p className="formula text-2xl leading-relaxed break-words">
        <span className="text-muted">{formula.slice(0, start)}</span>
        <mark className="rounded bg-accent-soft px-0.5 text-ink">{formula.slice(start, end)}</mark>
        <span className="text-muted">{formula.slice(end)}</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        Se juega sobre <span className="formula text-base text-ink">{state.formula}</span>
        {env.length > 0 && (
          <>
            {' '}con{' '}
            {env.map(([variable, element]) => (
              <span
                key={variable}
                className="formula mr-1 rounded-full bg-accent px-2 text-sm font-bold text-surface"
              >
                {variable} ↦ {element}
              </span>
            ))}
          </>
        )}
      </p>
    </section>
  )
}

function PlayerCard({
  who,
  wants,
  role,
  active,
}: {
  who: string
  wants: string
  role: GameRole
  active: boolean
}) {
  const info = ROLE_INFO[role]
  return (
    <div
      className={`rounded-lg border-2 px-4 py-2.5 ${active ? info.soft : 'border-line'}`}
      aria-current={active ? 'true' : undefined}
    >
      <p className="text-sm text-muted">
        {who} {active && <span className="font-bold text-ink">· le toca jugar</span>}
      </p>
      <p className={`text-lg font-bold ${info.color}`}>{info.name}</p>
      <p className="text-sm text-muted">
        {wants} {info.goal}.
      </p>
    </div>
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
      <p>
        Dos jugadores discuten si la fórmula es verdadera en la interpretación. Cada uno elige en
        su turno y la partida termina en una fórmula atómica: si es verdadera gana el Verificador;
        si es falsa, el Falsificador.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="py-1">Fórmula</th>
            <th className="py-1">Quién elige</th>
            <th className="py-1">Qué elige</th>
          </tr>
        </thead>
        <tbody className="[&_td]:py-1">
          <tr className="border-b border-line"><td className="formula">∃x φ</td><td className="text-true">Verificador</td><td>un testigo x ↦ a</td></tr>
          <tr className="border-b border-line"><td className="formula">∀x φ</td><td className="text-false">Falsificador</td><td>un contraejemplo x ↦ a</td></tr>
          <tr className="border-b border-line"><td className="formula">φ ∨ ψ</td><td className="text-true">Verificador</td><td>la parte verdadera</td></tr>
          <tr className="border-b border-line"><td className="formula">φ ∧ ψ</td><td className="text-false">Falsificador</td><td>la parte falsa</td></tr>
          <tr className="border-b border-line"><td className="formula">φ → ψ</td><td className="text-true">Verificador</td><td><span className="formula">¬φ</span> o <span className="formula">ψ</span> (porque <span className="formula">φ → ψ ≡ ¬φ ∨ ψ</span>)</td></tr>
          <tr><td className="formula">¬φ</td><td>nadie</td><td>se intercambian los papeles</td></tr>
        </tbody>
      </table>
      <p className="font-bold">¿Con qué papel quieres jugar?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(['verificador', 'falsificador'] as const).map((role) => (
          <button
            key={role}
            type="button"
            onClick={() => onChoose(role)}
            className={`rounded-lg border-2 px-4 py-3 text-left hover:opacity-90 ${ROLE_INFO[role].soft}`}
          >
            <span className={`block text-lg font-bold ${ROLE_INFO[role].color}`}>
              {ROLE_INFO[role].name}
            </span>{' '}
            <span className="text-sm text-ink">Quieres {ROLE_INFO[role].goal}.</span>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-false">{error}</p>}
    </div>
  )
}
