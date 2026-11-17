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
    kind: 'existe',
    variable: 'x',
    body: 'P(x)',
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
    kind: 'atómica',
    variable: null,
    body: null,
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
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es VERDADERA/ }))

    expect(await screen.findByText(/Demuéstralo: elige ese x/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tu jugada' })).toHaveTextContent(
      'Dices que existe un x que cumple «P(x)».',
    )
    await userEvent.click(screen.getByRole('button', { name: 'x = a' }))

    expect(await screen.findByText('¡Ganaste!')).toBeInTheDocument()
    // El desenlace aparece en el recuadro final y en el historial.
    expect(
      screen.getAllByText(/se revisa «P\(x\)» con x = a en la interpretación y es VERDADERA/),
    ).toHaveLength(2)
    expect(screen.getByText(/elegiste bien en cada paso/)).toBeInTheDocument()
    expect(calls).toEqual([{ move: 'a' }, { move: null }])
  })

  it('una jugada que pierde la estrategia ganadora queda marcada', async () => {
    mockGame(state({}), [
      move(atom('b'), { mistake: true }),
      move(atom('b'), { finished: true, winner: 'máquina', commentary: 'ℐ ⊭_{l[x↦b]} P(x): gana el falsificador.' }),
    ])
    render(<HintikkaGame project={project} value={true} />)
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es VERDADERA/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'x = b' }))

    expect(await screen.findByText('Ganó la máquina')).toBeInTheDocument()
    expect(screen.getByText('Aquí perdiste: con otra opción habrías ganado.')).toBeInTheDocument()
    expect(screen.getByText(/en la jugada marcada abajo elegiste mal/)).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es FALSA/ }))

    expect(await screen.findByText(/Le toca a la máquina/)).toBeInTheDocument()
    expect(screen.getByText(/Ella dice que existe un x que cumple «P\(x\)»/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Ganó la máquina')).toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(calls).toEqual([{ move: null }, { move: null }])
    expect(screen.getByText(/La máquina elige x = a/)).toBeInTheDocument()
    expect(screen.getByText(/estabas en el bando equivocado/)).toBeInTheDocument()
  })

  it('avisa cuando una negación intercambia los papeles', async () => {
    mockGame(state({ user_role: 'falsificador', turn: 'máquina' }), [])
    render(<HintikkaGame project={{ ...project, formula: '¬∃xP(x)' }} value={false} />)
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es VERDADERA/ }))
    expect(
      await screen.findByText(/La fórmula empieza con un «no» \(¬\).*cambiaste de bando. Ahora defiendes que «∃x P\(x\)» es FALSA/),
    ).toBeInTheDocument()
  })

  it('muestra las reglas y los dos papeles antes de empezar', () => {
    render(<HintikkaGame project={project} value={null} />)
    expect(screen.getByText(/Es un debate contra la máquina/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Yo digo que es VERDADERA Juegas como Verificador.' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Yo digo que es FALSA Juegas como Falsificador.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Reglas: ¿quién elige en cada paso?')).toBeInTheDocument()
  })
})

describe('guía de cada tipo de fórmula', () => {
  it('en una implicación explica las dos salidas en palabras', async () => {
    const implication = state({
      formula: 'P(a) → P(b)',
      kind: 'implica',
      variable: null,
      body: null,
      options: [
        { move: 'izquierda', label: '¬P(a)' },
        { move: 'derecha', label: 'P(b)' },
      ],
    })
    mockGame(implication, [])
    render(<HintikkaGame project={project} value={null} />)
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es VERDADERA/ }))
    expect(await screen.findByText(/es verdadero si la condición es falsa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /La condición «P\(a\)» es falsa/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /La conclusión «P\(b\)» es verdadera/ })).toBeInTheDocument()
  })

  it('en un «para todo» pide un contraejemplo a quien dice falsa', async () => {
    const forall = state({ formula: '∀x P(x)', kind: 'para todo', user_role: 'falsificador' })
    mockGame(forall, [])
    render(<HintikkaGame project={{ ...project, formula: '∀xP(x)' }} value={null} />)
    await userEvent.click(screen.getByRole('button', { name: /^Yo digo que es FALSA/ }))
    expect(await screen.findByText(/elige un x que NO cumpla/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Lo que defiendes' })).toHaveTextContent(
      'Defiendes que «∀x P(x)» es FALSA.',
    )
  })
})
