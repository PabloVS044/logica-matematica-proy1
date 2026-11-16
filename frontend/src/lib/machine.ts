import type { ExplainNode, SyntaxNode } from '../api/client'
import { progressOf, type QuantifierProgress, type Timeline } from './universe'

/**
 * La fórmula vista como una máquina que procesa:
 * - cada cuantificador es un bucle que prueba cada elemento de 𝒟 y cuenta los resultados;
 * - cada conectivo es una compuerta que combina los valores que le llegan;
 * - cada fórmula atómica es un sensor que le pregunta a la interpretación.
 * Los valores de las variables bajan por los cables y los resultados (V/F) suben.
 */

export type StationKind = 'forall' | 'exists' | 'not' | 'and' | 'or' | 'implies' | 'pred' | 'eq'

const FORMULA_KINDS: ReadonlySet<string> = new Set([
  'forall',
  'exists',
  'not',
  'and',
  'or',
  'implies',
  'pred',
  'eq',
])

export interface Station {
  /** Tramo de la fórmula que procesa, "inicio:fin": lo comparte con los nodos de la explicación. */
  key: string
  kind: StationKind
  /** Símbolo principal: ∀x, ∃y, ∧, →, ¬, P, = … */
  label: string
  /** Subfórmula completa, p. ej. "R(s(x), y)". */
  text: string
  depth: number
  x: number
  y: number
  parent: string | null
  children: string[]
}

export interface Machine {
  stations: Station[]
  byKey: Map<string, Station>
  width: number
  height: number
}

/** Puerto de arriba de la máquina: por ahí entra el entorno y sale el resultado final. */
export const PORT = 'puerto'

export const spanKey = (node: { start: number; end: number }) => `${node.start}:${node.end}`

/**
 * Dispone las estaciones como un árbol: la raíz arriba, las hojas abajo y cada estación
 * centrada sobre sus entradas. `dx` separa hojas vecinas y `dy` separa niveles.
 */
/** Separación entre hojas vecinas y entre niveles en la disposición vertical. */
export const MACHINE_DX = 3.3
export const MACHINE_DY = 2.55

export function buildMachine(
  tree: SyntaxNode,
  { dx = MACHINE_DX, dy = MACHINE_DY } = {},
): Machine {
  const stations: Station[] = []
  let leaves = 0

  function place(node: SyntaxNode, depth: number, parent: string | null): Station {
    const inputs = node.children.filter((c) => FORMULA_KINDS.has(c.kind))
    const station: Station = {
      key: spanKey(node),
      kind: node.kind as StationKind,
      label: node.label,
      text: node.text,
      depth,
      x: 0,
      y: -depth * dy,
      parent,
      children: [],
    }
    stations.push(station)
    if (inputs.length === 0) {
      station.x = leaves++ * dx
    } else {
      const placed = inputs.map((child) => place(child, depth + 1, station.key))
      station.children = placed.map((c) => c.key)
      station.x = (placed[0].x + placed[placed.length - 1].x) / 2
    }
    return station
  }

  place(tree, 0, null)
  const minX = Math.min(...stations.map((s) => s.x))
  const maxX = Math.max(...stations.map((s) => s.x))
  const maxDepth = Math.max(...stations.map((s) => s.depth))
  const middle = (minX + maxX) / 2
  for (const station of stations) station.x -= middle
  return {
    stations,
    byKey: new Map(stations.map((s) => [s.key, s])),
    width: maxX - minX,
    height: maxDepth * dy,
  }
}

/**
 * - `idle`: todavía no recibió nada en esta vuelta del bucle que la contiene.
 * - `active`: es la que trabaja en este paso.
 * - `working`: espera los resultados de sus entradas.
 * - `done`: ya entregó su resultado.
 */
export type StationStatus = 'idle' | 'active' | 'working' | 'done'

export interface StationState {
  status: StationStatus
  /** Resultado entregado (o leído, en un sensor); null si aún no hay. */
  value: boolean | null
  /** Instancia de la explicación que procesa ahora (la última que llegó a la estación). */
  node: ExplainNode | null
  /** Solo en bucles: marcador de los elementos probados. */
  progress: QuantifierProgress | null
}

/** Lo que viaja por un cable en este paso. */
export interface Packet {
  from: string
  to: string
  direction: 'down' | 'up'
  /** Valores que bajan, p. ej. "y = 2"; null si no hay nada nuevo que decir. */
  label: string | null
  /** Resultado que sube; en un sensor, el que sube después de leer. */
  value: boolean | null
}

export interface MachineState {
  stations: Map<string, StationState>
  packets: Packet[]
  /** Resultado que salió por el puerto de arriba; null mientras no termina. */
  output: boolean | null
}

const envLabel = (node: ExplainNode) =>
  node.env.length ? node.env.map((b) => `${b.var} = ${b.value}`).join(', ') : null

export function machineState(machine: Machine, timeline: Timeline, index: number): MachineState {
  const step = timeline.steps[index]
  // Última instancia que llegó a cada estación hasta este paso.
  const latest = new Map<string, ExplainNode>()
  for (let i = 0; i <= index && i < timeline.steps.length; i++) {
    const node = timeline.steps[i].node
    latest.set(spanKey(node), node)
  }

  const stations = new Map<string, StationState>()
  for (const station of machine.stations) {
    const node = latest.get(station.key) ?? null
    const empty: StationState = { status: 'idle', value: null, node: null, progress: null }
    if (!node) {
      stations.set(station.key, empty)
      continue
    }
    // Si el padre ya pasó a otra vuelta (otro elemento), lo de esta estación es viejo.
    const parent = timeline.parents.get(node.id)
    if (parent && latest.get(spanKey(parent))?.id !== parent.id) {
      stations.set(station.key, empty)
      continue
    }
    const span = timeline.spans.get(node.id)!
    const done = span.end <= index
    const status: StationStatus =
      step?.node.id === node.id ? 'active' : done ? 'done' : 'working'
    stations.set(station.key, {
      status,
      value: done ? node.value : null,
      node,
      progress:
        node.rule === 'universal' || node.rule === 'existencial'
          ? progressOf(timeline, node, index)
          : null,
    })
  }

  const packets: Packet[] = []
  if (step) {
    const { node } = step
    const here = spanKey(node)
    const parent = timeline.parents.get(node.id)
    const above = parent ? spanKey(parent) : PORT
    if (step.phase === 'visit') {
      packets.push({
        from: above,
        to: here,
        direction: 'down',
        label: node.binding ? `${node.binding.var} = ${node.binding.value}` : parent ? null : envLabel(node),
        value: null,
      })
      // Un sensor responde enseguida: su resultado sube en el mismo paso.
      if (node.atom) {
        packets.push({ from: here, to: above, direction: 'up', label: null, value: node.value })
      }
    } else {
      packets.push({ from: here, to: above, direction: 'up', label: null, value: node.value })
    }
  }

  const root = timeline.steps[timeline.steps.length - 1]?.node
  const finished = root !== undefined && (timeline.spans.get(root.id)?.end ?? Infinity) <= index
  return { stations, packets, output: finished ? root.value : null }
}

/** Qué hace cada tipo de estación, en palabras (para la leyenda y las etiquetas). */
export const STATION_ROLE: Record<StationKind, string> = {
  forall: 'bucle: prueba cada elemento; necesita que TODOS den V',
  exists: 'bucle: prueba elementos hasta que UNO dé V',
  not: 'inversor: entrega lo contrario de lo que recibe',
  and: 'compuerta Y: V solo si las dos entradas son V',
  or: 'compuerta O: V si alguna entrada es V',
  implies: 'compuerta SI-ENTONCES: F solo si llega V y luego F',
  pred: 'sensor: pregunta a la interpretación si la tupla está en la relación',
  eq: 'sensor de igualdad: ¿los dos valores son el mismo elemento?',
}
