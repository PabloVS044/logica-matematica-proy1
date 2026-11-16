import { useEffect, useMemo, useState } from 'react'

import type { ExplainNode } from '../api/client'
import type { BinaryLayer, UnaryLayer } from '../components/universe/UniverseScene'
import type { Project } from './project'
import {
  binaryEdges,
  buildTimeline,
  type Step,
  type Timeline,
  type TimelineMode,
} from './universe'

/** Colores de los predicados; ninguno es verde ni rojo, que se reservan para V y F. */
const PREDICATE_COLORS = ['#d4911c', '#1fa8c9', '#b45bd6', '#8d6e63', '#7c8aa5', '#c2185b']

// ------------------------------------------------------------------ entorno del navegador

export function hasWebGL(): boolean {
  if (typeof window === 'undefined' || !('WebGL2RenderingContext' in window)) return false
  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}

export function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches,
  )
  useEffect(() => {
    const media = window.matchMedia?.(query)
    if (!media) return
    const onChange = () => setReduced(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return reduced
}

// ------------------------------------------------------------------ datos de la escena

export interface UniverseLayers {
  /** Constantes que nombran cada elemento. */
  names: Map<string, string[]>
  unary: UnaryLayer[]
  binary: BinaryLayer[]
  /** Símbolos que la escena no dibuja (funciones y predicados de aridad ≥ 3). */
  undrawn: string[]
}

export function useUniverseLayers(project: Project): UniverseLayers {
  const { constants, constantValues, predicates, relations, functions, domain } = project
  return useMemo(() => {
    const names = new Map<string, string[]>()
    for (const constant of constants) {
      const element = constantValues[constant]
      if (element !== undefined) names.set(element, [...(names.get(element) ?? []), constant])
    }
    const unary: UnaryLayer[] = []
    const binary: BinaryLayer[] = []
    const undrawn: string[] = []
    predicates.forEach(({ name, arity }, i) => {
      const color = PREDICATE_COLORS[i % PREDICATE_COLORS.length]
      const tuples = relations[name] ?? []
      if (arity === 1) unary.push({ name, color, members: new Set(tuples.map((t) => t[0])) })
      else if (arity === 2) binary.push({ name, color, edges: binaryEdges(tuples, domain) })
      else undrawn.push(`${name} (aridad ${arity})`)
    })
    for (const { name } of functions) undrawn.push(`${name} (función)`)
    return { names, unary, binary, undrawn }
  }, [constants, constantValues, predicates, relations, functions, domain])
}

// ------------------------------------------------------------------ reproducción

export const SPEEDS = [0.5, 1, 2] as const
export type Speed = (typeof SPEEDS)[number]

/** Cuánto dura cada paso a velocidad 1, en milisegundos: lo justo para leer la narración. */
function stepDuration(step: Step): number {
  if (step.phase === 'conclude') return step.depth === 0 ? 3000 : 2200
  return step.node.atom ? 2300 : 1800
}

export interface Player {
  timeline: Timeline | null
  step: Step | null
  index: number
  playing: boolean
  speed: Speed
  mode: TimelineMode
  setSpeed: (speed: Speed) => void
  setMode: (mode: TimelineMode) => void
  goTo: (index: number) => void
  toggle: () => void
}

/** Animación de una evaluación: cada evaluación nueva empieza desde el primer paso. */
export function usePlayer(root: ExplainNode | null, playKey: string, autoplay: boolean): Player {
  const [mode, setMode] = useState<TimelineMode>('natural')
  const timeline = useMemo(() => (root ? buildTimeline(root, { mode }) : null), [root, mode])
  const key = root ? `${playKey}|${mode}` : null
  const [state, setState] = useState({ key, index: 0, playing: false })
  if (state.key !== key) setState({ key, index: 0, playing: key !== null && autoplay })

  const [speed, setSpeed] = useState<Speed>(1)
  const steps = timeline?.steps ?? []
  const last = Math.max(0, steps.length - 1)
  const index = Math.min(state.index, last)
  const step = steps[index] ?? null
  // Al llegar al último paso la reproducción termina sola.
  const playing = state.playing && index < last

  useEffect(() => {
    if (!playing || !step) return
    const timer = setTimeout(
      () => setState((s) => ({ ...s, index: s.index + 1 })),
      stepDuration(step) / speed,
    )
    return () => clearTimeout(timer)
  }, [playing, step, speed])

  return {
    timeline,
    step,
    index,
    playing,
    speed,
    mode,
    setSpeed,
    setMode,
    goTo: (next) =>
      setState((s) => ({ ...s, playing: false, index: Math.max(0, Math.min(last, next)) })),
    toggle: () =>
      setState((s) =>
        playing ? { ...s, playing: false } : { ...s, playing: true, index: index >= last ? 0 : index },
      ),
  }
}
