import { useEffect, useRef } from 'react'

import { sfx } from './sound'
import { stepCues } from './stepSounds'
import type { Player } from './useUniverse'
import type { Timeline } from './universe'

/**
 * Hace sonar la animación: cada paso tiene su sonido y, mientras se reproduce, queda de
 * fondo el ruido de la máquina (engranajes) o del universo (un colchón suave).
 */
export function useSoundCues(
  player: Player,
  view: 'universo' | 'maquina',
  binary: ReadonlySet<string>,
): void {
  const { timeline, index, playing } = player
  const heard = useRef<{ timeline: Timeline | null; index: number }>({ timeline: null, index: -1 })

  useEffect(() => {
    if (!timeline) {
      heard.current = { timeline: null, index: -1 }
      return
    }
    const previous = heard.current
    if (previous.timeline === timeline && previous.index === index) return
    heard.current = { timeline, index }
    const fresh = previous.timeline !== timeline

    if (fresh && !playing) {
      // Sin animación (movimiento reducido) solo se oye el veredicto.
      sfx.play(timeline.steps.at(-1)?.node.value ? 'verdadero' : 'falso')
      return
    }
    let offset = 0
    if (fresh && view === 'maquina') {
      sfx.play('arranque')
      offset = 0.5
    }
    for (const cue of stepCues(timeline, index, view, binary)) {
      sfx.play(cue.sound, { rate: cue.rate, delay: (cue.delay ?? 0) + offset })
    }
    // Solo cuando cambia el paso o la evaluación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeline, index])

  useEffect(() => {
    sfx.setLoop(playing && view === 'maquina' ? 'engranajes' : null)
  }, [playing, view])
  useEffect(() => () => sfx.setLoop(null), [])
}
