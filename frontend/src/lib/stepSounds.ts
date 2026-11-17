import type { Sound } from './sound'
import type { Timeline } from './universe'

export interface Cue {
  sound: Sound
  /** Velocidad de reproducción: los conteos suben de tono con cada elemento probado. */
  rate?: number
  /** Segundos de espera desde que empieza el paso. */
  delay?: number
}

const isQuantifier = (rule: string | undefined) => rule === 'universal' || rule === 'existencial'

/**
 * Qué suena en un paso de la animación. La idea es que se pueda "oír" la evaluación:
 * - en la máquina: el paquete que baja, la compuerta que procesa, el sensor que consulta;
 * - en el universo: la variable que se mueve, la flecha que existe o no existe;
 * - en ambas: cada elemento probado suena como una cuenta (cristal si cumple, madera si no)
 *   y cada vez más agudo, y el testigo / contraejemplo / veredicto tienen su propio sonido.
 */
export function stepCues(
  timeline: Timeline,
  index: number,
  view: 'universo' | 'maquina',
  binary: ReadonlySet<string>,
): Cue[] {
  const step = timeline.steps[index]
  if (!step) return []
  const { node } = step
  const machine = view === 'maquina'
  const parent = timeline.parents.get(node.id)
  const isLast = index === timeline.steps.length - 1
  // Si con este paso termina de probarse un elemento de un cuantificador, suena su cuenta.
  const itemDone =
    parent !== undefined && isQuantifier(parent.rule) && timeline.spans.get(node.id)?.end === index
  const cues: Cue[] = []

  if (step.phase === 'visit') {
    if (node.atom) {
      const { symbol } = node.atom
      if (symbol === '=') cues.push({ sound: node.value ? 'balanzaOk' : 'balanzaInclina' })
      else if (machine) {
        cues.push({ sound: 'sensor' })
        if (!itemDone) cues.push({ sound: node.value ? 'regresaV' : 'regresaF', delay: 0.55 })
      } else if (binary.has(symbol)) {
        cues.push({ sound: node.value ? 'flechaRecorre' : 'flechaNoExiste' })
      } else if (!itemDone) {
        cues.push({ sound: node.value ? 'regresaV' : 'regresaF' })
      }
    } else if (node.binding) {
      cues.push({ sound: machine ? 'paquete' : 'variable' })
    } else if (machine) {
      cues.push({ sound: 'compuerta' })
    }
  } else if (isQuantifier(node.rule)) {
    if (node.justification === 'testigo') cues.push({ sound: 'testigo' })
    else if (node.justification === 'contraejemplo') cues.push({ sound: 'contraejemplo' })
    else if (node.value) cues.push({ sound: 'todosCumplen' })
    else cues.push({ sound: 'cuentaFalla', rate: 0.8 })
  } else if (!isLast && !itemDone) {
    cues.push({ sound: node.value ? 'regresaV' : 'regresaF' })
  }

  if (parent && itemDone) {
    const position = Math.max(0, parent.children.indexOf(node))
    const rate = Math.min(1.6, 1 + position * 0.06)
    const delay = cues.length ? 0.45 : 0
    cues.push({ sound: node.value ? 'cuentaCumple' : 'cuentaFalla', rate, delay })
  }

  if (isLast) {
    const delay = cues.length ? 0.5 : 0
    cues.push({ sound: timeline.steps[index].node.value ? 'verdadero' : 'falso', delay })
  }
  return cues
}
