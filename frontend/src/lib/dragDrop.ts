import { useState, type DragEvent } from 'react'

/** Tipo de los datos que lleva una ficha de elemento al arrastrarla. */
export const DRAG_TYPE = 'application/x-elemento'

export function readDrop(event: DragEvent): string | null {
  return event.dataTransfer.getData(DRAG_TYPE) || null
}

/** Props para que algo acepte fichas soltadas encima. */
export function useDropTarget(onDrop: (element: string) => void) {
  const [over, setOver] = useState(false)
  return {
    over,
    props: {
      onDragOver: (event: DragEvent) => {
        if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        setOver(false)
        const element = readDrop(event)
        if (element !== null) onDrop(element)
      },
    },
  }
}
