import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameMove, GameState, ProjectIn } from '../api/client'
import { HintikkaGame } from './HintikkaGame'

const project: ProjectIn = {
  version: 1,
  language: { constants: [], functions: [], predicates: [{ name: 'P', arity: 1 }] },
  interpretation: { domain: ['a', 'b'], constants: {}, functions: {}, predicates: { P: [['a']] } },
  formula: '∃xP(x)',
  environment: {},
}

function state(overrides: Partial<GameState>): GameState {
  return {
    project,
    start: 0,
    end: 6,
    environment: {},
    env_label: 'l',
    user_role: 'verificador',
    formula: '∃x P(x)',
    turn: 'usuario',
    options: [
      { move: 'a', label: 'x ↦ a' },
      { move: 'b', label: 'x ↦ b' },
    ],
    ...overrides,
  }
}

const atom = (value: string, role: GameState['user_role'] = 'verificador') =>
  state({
    start: 2,
    end: 6,
    environment: { x: value },
    env_label: `l[x↦${value}]`,
    user_role: role,
    formula: 'P(x)',
    turn: null,
    options: [],
  })

function move(next: GameState, fields: Partial<GameMove> = {}): GameMove {
  return {
    state: next,
    machine_move: null,
    finished: next.turn === null,
    winner: null,
    commentary: '',
    mistake: false,
    ...fields,
  }
}

/** Servidor falso: `start` responde a /game/start y `moves` a cada /game/move en orden. */
function mockGame(start: GameState, moves: GameMove[]) {
  const calls: { move: string | null }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? '{}')
      let data: unknown = {}
      if (url === '/api/game/start') data = start
      if (url === '/api/game/move') {
        calls.push({ move: body.move })
        data = moves.shift()
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }),
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('juego de Hintikka', () => {
  it('el usuario elige un testigo y gana', async () => {
    const calls = mockGame(state({}), [
      move(atom('a'), { commentary: 'Elegiste x ↦ a.' }),
      move(atom('a'), { finished: true, winner: 'usuario', commentary: 'ℐ ⊨_{l[x↦a]} P(x): gana el verificador.' }),
    ])
    render(<HintikkaGame project={project} value={true} />)
    await userEvent.click(screen.getByRole('button', { name: /^Verificador/ }))

    expect(await screen.findByText(/Elige un testigo: un valor de x/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'x ↦ a' }))

    expect(await screen.findByText('¡Ganaste!')).toBeInTheDocument()
    expect(screen.getByText(/mantuviste hasta el final/)).toBeInTheDocument()
    expect(calls).toEqual([{ move: 'a' }, { move: null }])
  })

  it('una jugada que pierde la estrategia ganadora queda marcada', async () => {
    mockGame(state({}), [
      move(atom('b'), { mistake: true }),
      move(atom('b'), { finished: true, winner: 'máquina', commentary: 'ℐ ⊭_{l[x↦b]} P(x): gana el falsificador.' }),
    ])
    render(<HintikkaGame project={project} value={true} />)
    await userEvent.click(screen.getByRole('button', { name: /^Verificador/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'x ↦ b' }))

    expect(await screen.findByText('Ganó la máquina')).toBeInTheDocument()
    expect(screen.getByText('Aquí perdiste tu estrategia ganadora.')).toBeInTheDocument()
    expect(screen.getByText(/la perdiste en la jugada marcada/)).toBeInTheDocument()
  })

  it('la máquina juega sola en su turno', async () => {
    const machineFirst = state({ user_role: 'falsificador', turn: 'máquina' })
    const calls = mockGame(machineFirst, [
      move(atom('a', 'falsificador'), {
        machine_move: 'x ↦ a',
        commentary: 'Elijo x ↦ a porque ℐ ⊨_{l[x↦a]} P(x).',
      }),
      move(atom('a', 'falsificador'), {
        finished: true,
        winner: 'máquina',
        commentary: 'ℐ ⊨_{l[x↦a]} P(x): gana el verificador.',
      }),
    ])
    render(<HintikkaGame project={project} value={true} />)
    await userEvent.click(screen.getByRole('button', { name: /^Falsificador/ }))

    expect(await screen.findByText(/La máquina está pensando/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ganó la máquina')).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(calls).toEqual([{ move: null }, { move: null }])
    expect(screen.getByText(/el Verificador tenía estrategia ganadora/)).toBeInTheDocument()
  })

  it('avisa cuando una negación intercambia los papeles', async () => {
    mockGame(state({ user_role: 'falsificador', turn: 'máquina' }), [])
    render(<HintikkaGame project={{ ...project, formula: '¬∃xP(x)' }} value={false} />)
    await userEvent.click(screen.getByRole('button', { name: /^Verificador/ }))
    expect(
      await screen.findByText(/empieza con ¬: se intercambian los papeles. Ahora eres el Falsificador/),
    ).toBeInTheDocument()
  })

  it('muestra las reglas y los dos papeles antes de empezar', () => {
    render(<HintikkaGame project={project} value={null} />)
    expect(screen.getByText('¿Con qué papel quieres jugar?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Verificador Quieres mostrar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Falsificador Quieres mostrar/ })).toBeInTheDocument()
  })
})
