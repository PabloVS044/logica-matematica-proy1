import type { ExplainNode } from '../api/client'

export type Vec3 = [number, number, number]

/** Más elementos que esto no se dibujan: la escena dejaría de leerse. */
export const MAX_DRAWN_ELEMENTS = 40

/**
 * Posiciones de los elementos de 𝒟 en la escena. Hasta 12 elementos se ponen en un anillo
 * horizontal (se lee bien con la cámara inclinada); con más, sobre una esfera de Fibonacci
 * para que ninguno quede tapado.
 */
export function layoutDomain(size: number): Vec3[] {
  if (size <= 0) return []
  if (size === 1) return [[0, 0, 0]]
  if (size <= 12) {
    const radius = Math.max(1.8, size * 0.42)
    return Array.from({ length: size }, (_, i) => {
      const angle = (2 * Math.PI * i) / size - Math.PI / 2
      return [radius * Math.cos(angle), 0, radius * Math.sin(angle)]
    })
  }
  const radius = 1.2 * Math.sqrt(size)
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: size }, (_, i) => {
    const y = 1 - (2 * i + 1) / size
    const r = Math.sqrt(1 - y * y)
    const theta = golden * i
    return [radius * r * Math.cos(theta), radius * y, radius * r * Math.sin(theta)]
  })
}

/** Elemento destacado al concluir un cuantificador: su testigo o su contraejemplo. */
export interface Focus {
  var: string
  value: string
  kind: 'testigo' | 'contraejemplo'
}

/**
 * Un paso de la animación. Cada nodo se "visita" (se fija su entorno) y, si tiene hijos,
 * se "concluye" después de recorrerlos, igual que la definición recursiva de ⊨.
 */
export interface Step {
  node: ExplainNode
  phase: 'visit' | 'conclude'
  depth: number
  focus: Focus | null
}

/**
 * Qué subfórmulas se recorren:
 * - `natural`: como lo haría una persona; se detiene en cuanto el resultado queda decidido
 *   (∃ al hallar un testigo, ∀ al hallar un contraejemplo, ∧ con el primer lado falso…).
 * - `completo`: todo lo que calculó el evaluador.
 * - `decisivo`: solo las razones decisivas.
 */
export type TimelineMode = 'natural' | 'completo' | 'decisivo'

export interface Timeline {
  steps: Step[]
  mode: TimelineMode
  /** true si se pasó a `decisivo` porque el recorrido pedido superaba el máximo de pasos. */
  fellBack: boolean
  /** true si incluso así hubo que cortar la animación. */
  cut: boolean
  /** Primer y último paso de cada nodo recorrido (por id). */
  spans: Map<string, { start: number; end: number }>
  /** Padre de cada nodo del árbol (por id). */
  parents: Map<string, ExplainNode>
}

export const MAX_STEPS = 120

function focusOf(node: ExplainNode): Focus | null {
  if (node.justification !== 'testigo' && node.justification !== 'contraejemplo') return null
  const child = node.children.find((c) => c.decisive && c.binding)
  if (!child?.binding) return null
  return { ...child.binding, kind: node.justification }
}

/** Hijos que se recorren según el modo. */
export function visitedChildren(node: ExplainNode, mode: TimelineMode): ExplainNode[] {
  if (mode === 'completo') return node.children
  if (mode === 'decisivo') return node.children.filter((c) => c.decisive)
  // Hasta el último hijo decisivo: lo que viene después no cambia el resultado.
  let last = -1
  node.children.forEach((child, i) => {
    if (child.decisive) last = i
  })
  return node.children.slice(0, last + 1)
}

function walk(node: ExplainNode, mode: TimelineMode, depth: number, out: Step[]): void {
  out.push({ node, phase: 'visit', depth, focus: null })
  const children = visitedChildren(node, mode)
  if (children.length === 0) return
  for (const child of children) walk(child, mode, depth + 1, out)
  out.push({ node, phase: 'conclude', depth, focus: focusOf(node) })
}

function indexTree(node: ExplainNode, parents: Map<string, ExplainNode>): void {
  for (const child of node.children) {
    parents.set(child.id, node)
    indexTree(child, parents)
  }
}

/** Recorre el árbol de explicación en el orden en que se evalúa. */
export function buildTimeline(
  root: ExplainNode,
  { mode = 'natural' as TimelineMode, maxSteps = MAX_STEPS } = {},
): Timeline {
  let steps: Step[] = []
  walk(root, mode, 0, steps)
  if (steps.length > maxSteps && mode !== 'decisivo') {
    return { ...buildTimeline(root, { mode: 'decisivo', maxSteps }), fellBack: true }
  }
  let cut = false
  if (steps.length > maxSteps) {
    // Se conserva la conclusión de la raíz: es el resultado que importa.
    steps = [...steps.slice(0, maxSteps - 1), steps[steps.length - 1]]
    cut = true
  }
  const spans = new Map<string, { start: number; end: number }>()
  steps.forEach((step, i) => {
    const span = spans.get(step.node.id)
    if (span) span.end = i
    else spans.set(step.node.id, { start: i, end: i })
  })
  const parents = new Map<string, ExplainNode>()
  indexTree(root, parents)
  return { steps, mode, fellBack: false, cut, spans, parents }
}

/** Estado de un elemento en el marcador de un cuantificador. */
export type ItemStatus = 'cumple' | 'falla' | 'probando' | 'pendiente' | 'innecesario'

export interface QuantifierProgress {
  node: ExplainNode
  kind: '∀' | '∃'
  var: string
  items: { value: string; status: ItemStatus }[]
  /** El cuantificador ya tiene valor en este paso. */
  done: boolean
}

/**
 * Marcador de cada cuantificador que contiene al paso actual: qué elementos ya se
 * revisaron, cuál se está probando y cuáles no hacen falta.
 */
export function quantifierProgress(timeline: Timeline, index: number): QuantifierProgress[] {
  const step = timeline.steps[index]
  if (!step) return []
  const chain: ExplainNode[] = []
  for (let node: ExplainNode | undefined = step.node; node; node = timeline.parents.get(node.id)) {
    chain.unshift(node)
  }
  return chain
    .filter((node) => node.rule === 'universal' || node.rule === 'existencial')
    .map((node) => progressOf(timeline, node, index))
}

/** Marcador de un cuantificador concreto (una instancia del árbol) en el paso `index`. */
export function progressOf(
  timeline: Timeline,
  node: ExplainNode,
  index: number,
): QuantifierProgress {
  const span = timeline.spans.get(node.id)
  const items = node.children
    .filter((child) => child.binding)
    .map((child) => {
      const childSpan = timeline.spans.get(child.id)
      let status: ItemStatus
      if (!childSpan) status = 'innecesario'
      else if (childSpan.end <= index) status = child.value ? 'cumple' : 'falla'
      else if (childSpan.start <= index) status = 'probando'
      else status = 'pendiente'
      return { value: child.binding!.value, status }
    })
  return {
    node,
    kind: node.rule === 'universal' ? '∀' : '∃',
    var: node.children[0]?.binding?.var ?? node.formula.match(/^[∀∃]\s*(\w+)/)?.[1] ?? '?',
    items,
    done: span !== undefined && span.end <= index,
  }
}

/** Pares de una relación binaria, sin repetidos, listos para dibujar como flechas. */
export function binaryEdges(tuples: readonly string[][], domain: readonly string[]) {
  const seen = new Set<string>()
  const edges: [string, string][] = []
  for (const tuple of tuples) {
    if (tuple.length !== 2) continue
    const [a, b] = tuple
    if (!domain.includes(a) || !domain.includes(b)) continue
    const key = `${a}\u001f${b}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push([a, b])
  }
  return edges
}
