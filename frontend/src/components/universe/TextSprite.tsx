import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

const FONT_PX = 96
const FORMULA_FONT = `"STIX Two Text", "Logic Symbols", "Cambria Math", serif`

/** Las fuentes de la página cargan después de la escena: al terminar se redibuja el texto. */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded')
  useEffect(() => {
    if (ready || !document.fonts) return
    let alive = true
    void document.fonts.ready.then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [ready])
  return ready
}

/**
 * Texto dibujado en un canvas y mostrado como sprite: siempre mira a la cámara y se dibuja
 * encima de la escena. Sustituye a las etiquetas HTML, que crean una raíz de React cada una.
 */
export function TextSprite({
  text,
  color,
  background = null,
  height = 0.3,
  weight = 600,
  position,
}: {
  text: string
  color: string
  background?: string | null
  /** Alto del texto en unidades de la escena. */
  height?: number
  weight?: number
  position?: [number, number, number] | THREE.Vector3
}) {
  const fontsReady = useFontsReady()
  const { texture, aspect } = useMemo(() => {
    const font = `${weight} ${FONT_PX}px ${FORMULA_FONT}`
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    context.font = font
    const padX = background ? FONT_PX * 0.45 : FONT_PX * 0.1
    const padY = background ? FONT_PX * 0.2 : FONT_PX * 0.05
    const width = Math.ceil(context.measureText(text).width + 2 * padX)
    const tall = Math.ceil(FONT_PX * 1.25 + 2 * padY)
    canvas.width = width
    canvas.height = tall
    if (background) {
      context.fillStyle = background
      context.beginPath()
      context.roundRect(0, 0, width, tall, tall / 2)
      context.fill()
    }
    context.font = font
    context.fillStyle = color
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, width / 2, tall / 2 + FONT_PX * 0.04)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return { texture, aspect: width / tall }
    // fontsReady fuerza el redibujo cuando llegan las fuentes.
  }, [text, color, background, weight, fontsReady]) // oxlint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => texture.dispose(), [texture])

  const scale = height * (background ? 1.45 : 1.25)
  return (
    <sprite position={position} scale={[scale * aspect, scale, 1]} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  )
}
