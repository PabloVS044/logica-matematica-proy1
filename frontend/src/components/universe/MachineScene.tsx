import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import {
  MACHINE_DX,
  PORT,
  type Machine,
  type MachineState,
  type Packet,
  type Station,
  type StationState,
} from '../../lib/machine'
import { StationModel, type Orientation } from './MachineParts'
import { TextSprite } from './TextSprite'
import type { ScenePalette } from './UniverseScene'

/** Medidas de una estación (caja redondeada). */
const W = 2.3
const H = 1.9
const D = 0.7
/** Altura del puerto de entrada/salida sobre la raíz. */
const PORT_RISE = 1.15

const glow = (color: string, strength = 2) => new THREE.Color(color).multiplyScalar(strength)
/** Auxiliares para los cálculos de cada cuadro (evitan crear objetos 60 veces por segundo). */
const SCALE = new THREE.Vector3()

export interface MachineSceneProps {
  machine: Machine
  /** null si todavía no se evaluó: la máquina se muestra apagada. */
  state: MachineState | null
  stepKey: number
  palette: ScenePalette
  motion: boolean
}

/**
 * Disposición de la máquina en el mundo. En vertical la raíz queda arriba y los sensores abajo;
 * en horizontal, como una línea de producción, la entrada queda a la izquierda.
 */

/** Separaciones de la disposición horizontal: entre hermanos (alto) y entre niveles (ancho). */
const H_SIBLING = 2.45
const H_LEVEL = 3.5

interface Layout {
  orientation: Orientation
  pos: Map<string, THREE.Vector3>
  /** Hacia dónde sale el resultado: arriba (vertical) o a la izquierda (horizontal). */
  out: THREE.Vector3
  width: number
  height: number
}

function layoutOf(machine: Machine, orientation: Orientation): Layout {
  const raw = new Map<string, THREE.Vector3>()
  for (const s of machine.stations) {
    raw.set(
      s.key,
      orientation === 'vertical'
        ? new THREE.Vector3(s.x, s.y, 0)
        : new THREE.Vector3(s.depth * H_LEVEL, -(s.x / MACHINE_DX) * H_SIBLING, 0),
    )
  }
  const out = orientation === 'vertical' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(-1, 0, 0)
  const rootPos = raw.get(machine.stations[0].key)!
  const half = new THREE.Vector3(W / 2, H / 2, 0)
  const box = new THREE.Box3()
  for (const p of raw.values()) {
    box.expandByPoint(p.clone().sub(half))
    box.expandByPoint(p.clone().add(half))
  }
  // El puerto y su rótulo también ocupan lugar.
  const port = rootPos.clone().addScaledVector(out, (orientation === 'vertical' ? H : W) / 2 + PORT_RISE)
  box.expandByPoint(port.clone().add(new THREE.Vector3(-1.2, 1, 0)))
  box.expandByPoint(port.clone().add(new THREE.Vector3(1.2, -0.4, 0)))
  // Se centra en el origen para encuadrar fácil.
  const center = box.getCenter(new THREE.Vector3())
  const pos = new Map([...raw].map(([key, p]) => [key, p.sub(center)]))
  const size = box.getSize(new THREE.Vector3())
  return { orientation, pos, out, width: size.x, height: size.y }
}

/** Parte del alto del lienzo que queda libre entre la barra de arriba y el dock de abajo. */
const FREE_HEIGHT = 0.56
/** Centro de esa zona libre, medido desde arriba (0) hasta abajo (1). */
const FREE_CENTER = 0.4

/** Escala a la que se vería la disposición en un lienzo de `aspect` (ancho / alto). */
function fitScale(layout: Layout, aspect: number) {
  return Math.min(aspect / layout.width, FREE_HEIGHT / layout.height)
}

/** Lado de la estación por donde sale su resultado (hacia la raíz). */
const outSide = (l: Layout, key: string) =>
  l.pos.get(key)!.clone().addScaledVector(l.out, (l.orientation === 'vertical' ? H : W) / 2)
/** Lado por donde entran sus subfórmulas. */
const inSide = (l: Layout, key: string) =>
  l.pos.get(key)!.clone().addScaledVector(l.out, -(l.orientation === 'vertical' ? H : W) / 2)

/** Cable de una entrada a su estación, en forma de S suave. Va de t = 0 (entrada) a t = 1. */
function wire(l: Layout, child: string, parent: string): THREE.CubicBezierCurve3 {
  const a = outSide(l, child)
  const b = inSide(l, parent)
  const vertical = l.orientation === 'vertical'
  const middle = vertical ? (a.y + b.y) / 2 : (a.x + b.x) / 2
  return new THREE.CubicBezierCurve3(
    a,
    vertical ? new THREE.Vector3(a.x, middle, 0) : new THREE.Vector3(middle, a.y, 0),
    vertical ? new THREE.Vector3(b.x, middle, 0) : new THREE.Vector3(middle, b.y, 0),
    b,
  )
}

export default function MachineScene(props: MachineSceneProps) {
  const { palette } = props
  return (
    <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} camera={{ position: [0, 0, 14], fov: 40 }}>
      <ambientLight intensity={palette.dark ? 0.35 : 0.6} />
      <directionalLight position={[3, 6, 8]} intensity={palette.dark ? 1.1 : 1.4} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 5, 6]} scale={[12, 4, 1]} />
        <Lightformer form="circle" intensity={1.5} color={palette.accent} position={[-6, 2, 4]} scale={3} />
      </Environment>
      <Factory {...props} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.8} />
      </EffectComposer>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        minAzimuthAngle={-0.7}
        maxAzimuthAngle={0.7}
        minPolarAngle={Math.PI / 2 - 0.5}
        maxPolarAngle={Math.PI / 2 + 0.3}
      />
    </Canvas>
  )
}

/**
 * Encuadra la máquina en la zona libre del lienzo (la barra superior y el dock de la fórmula
 * tapan arriba y abajo): calcula la distancia y desplaza el punto de mira hacia abajo.
 */
function FitMachine({ layout }: { layout: Layout }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3
    update: () => void
  } | null
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    const horizontal = vertical * (width / height)
    const distance =
      Math.max(
        (layout.width / 2 + 0.4) / horizontal,
        (layout.height / 2 + 0.3) / (vertical * FREE_HEIGHT),
        5,
      ) + D
    // Para que el centro de la máquina caiga en el centro de la zona libre.
    const lookY = -(0.5 - FREE_CENTER) * 2 * vertical * distance
    camera.position.set(0, lookY + distance * 0.05, distance)
    if (controls) {
      controls.target.set(0, lookY, 0)
      controls.update()
    } else {
      camera.lookAt(0, lookY, 0)
    }
  }, [camera, controls, width, height, layout])
  return null
}

function Factory({ machine, state, stepKey, palette, motion }: MachineSceneProps) {
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  const layouts = useMemo(
    () => ({ vertical: layoutOf(machine, 'vertical'), horizontal: layoutOf(machine, 'horizontal') }),
    [machine],
  )
  // La orientación que deja la máquina más grande en el espacio libre.
  const aspect = width / Math.max(1, height)
  const layout =
    fitScale(layouts.horizontal, aspect) > fitScale(layouts.vertical, aspect) * 1.05
      ? layouts.horizontal
      : layouts.vertical
  const rootKey = machine.stations[0].key

  const curves = useMemo(() => {
    const map = new Map<string, THREE.Curve<THREE.Vector3>>()
    for (const station of machine.stations) {
      if (station.parent) map.set(station.key, wire(layout, station.key, station.parent))
    }
    const from = outSide(layout, rootKey)
    map.set(PORT, new THREE.LineCurve3(from, from.clone().addScaledVector(layout.out, PORT_RISE - 0.35)))
    return map
  }, [machine, layout, rootKey])

  const idle: StationState = { status: 'idle', value: null, node: null, progress: null }
  const output = state?.output ?? null
  const portAt = outSide(layout, rootKey).addScaledVector(layout.out, PORT_RISE)
  const vertical = layout.orientation === 'vertical'

  return (
    <group>
      <FitMachine layout={layout} />
      {/* Cables: se tiñen con el resultado que ya pasó por ellos. */}
      {machine.stations.map((station) => {
        if (!station.parent) return null
        const s = state?.stations.get(station.key) ?? idle
        const color =
          s.status === 'done' && s.value !== null ? (s.value ? palette.true : palette.false) : palette.muted
        return <Cable key={`cable-${station.key}`} curve={curves.get(station.key)!} color={color} />
      })}
      <Cable curve={curves.get(PORT)!} color={output === null ? palette.muted : output ? palette.true : palette.false} />

      {/* Puerto: entra el entorno, sale el resultado final. */}
      <group position={portAt}>
        <mesh rotation={vertical ? [Math.PI / 2, 0, 0] : [0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.32, 0.07, 16, 48]} />
          <meshStandardMaterial color={palette.muted} roughness={0.35} metalness={0.4} />
        </mesh>
        {output === null ? (
          <TextSprite position={[0, 0.62, 0]} text="entrada / salida" color={palette.muted} height={0.26} weight={500} />
        ) : (
          <TextSprite
            position={[0, 0.72, 0]}
            text={output ? 'VERDADERA' : 'FALSA'}
            color="#ffffff"
            background={output ? palette.true : palette.false}
            height={0.38}
            weight={700}
          />
        )}
      </group>

      {machine.stations.map((station) => (
        <StationBox
          key={station.key}
          station={station}
          position={layout.pos.get(station.key)!}
          state={state?.stations.get(station.key) ?? idle}
          palette={palette}
          motion={motion}
          orientation={layout.orientation}
        />
      ))}

      {state?.packets.map((packet, i) => {
        // Cada cable se guarda con la clave de la estación de abajo; el del puerto, con PORT.
        const upper = packet.direction === 'down' ? packet.from : packet.to
        const lower = packet.direction === 'down' ? packet.to : packet.from
        const curve = curves.get(upper === PORT ? PORT : lower)
        if (!curve) return null
        return (
          <PacketBall
            key={`${stepKey}-${i}`}
            packet={packet}
            curve={curve}
            delay={i * 0.8}
            labelOffset={vertical ? [-0.95, 0.05, 0.2] : [0, 0.48, 0.2]}
            palette={palette}
            motion={motion}
          />
        )
      })}
    </group>
  )
}

function Cable({ curve, color }: { curve: THREE.Curve<THREE.Vector3>; color: string }) {
  return (
    <mesh>
      <tubeGeometry args={[curve, 48, 0.05, 10, false]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.2} />
    </mesh>
  )
}

function StationBox({
  station,
  position,
  state,
  palette,
  motion,
  orientation,
}: {
  station: Station
  position: THREE.Vector3
  state: StationState
  palette: ScenePalette
  motion: boolean
  orientation: Orientation
}) {
  const group = useRef<THREE.Group>(null)
  const scale = state.status === 'active' ? 1.08 : 1
  useFrame((_, delta) => {
    group.current?.scale.lerp(SCALE.setScalar(scale), 1 - Math.exp(-delta * 10))
  })
  return (
    <group position={position}>
      <group ref={group}>
        <StationModel
          station={station}
          state={state}
          palette={palette}
          motion={motion}
          orientation={orientation}
        />
      </group>
    </group>
  )
}

/** Bolita que recorre un cable: valores que bajan o un resultado que sube. */
function PacketBall({
  packet,
  curve,
  delay,
  labelOffset,
  palette,
  motion,
}: {
  packet: Packet
  curve: THREE.Curve<THREE.Vector3>
  delay: number
  labelOffset: [number, number, number]
  palette: ScenePalette
  motion: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const elapsed = useRef(0)
  const down = packet.direction === 'down'
  // Los cables van de la entrada (t = 0, abajo) a la estación (t = 1, arriba).
  const at = (t: number) => curve.getPoint(down ? 1 - t : t)
  const color = down ? palette.bound : packet.value ? palette.true : palette.false

  useFrame((_, deltaTime) => {
    if (!ref.current) return
    elapsed.current += deltaTime
    const t = motion ? Math.min(1, Math.max(0, (elapsed.current - delay) / 0.75)) : 1
    ref.current.visible = !motion || elapsed.current >= delay
    ref.current.position.copy(at(t))
  })

  return (
    <group ref={ref} position={at(motion ? 0 : 1)} visible={!motion}>
      <mesh>
        <sphereGeometry args={[0.16, 24, 16]} />
        <meshBasicMaterial color={glow(color, 2.6)} toneMapped={false} />
      </mesh>
      {packet.label && (
        <TextSprite
          position={labelOffset}
          text={packet.label}
          color="#ffffff"
          background={color}
          height={0.3}
          weight={700}
        />
      )}
    </group>
  )
}
