import { RoundedBox } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'

import type { Station, StationState } from '../../lib/machine'
import type { ItemStatus } from '../../lib/universe'
import { TextSprite } from './TextSprite'
import type { ScenePalette } from './UniverseScene'

/**
 * Las piezas de la máquina, cada una con la forma de lo que hace:
 * - ∀ / ∃: una rueda con engranaje; los elementos de 𝒟 son cuentas que se encienden al probarse.
 * - ∧ ∨ ¬: compuertas lógicas con su símbolo de circuito.
 * - →: una compuerta O con una burbuja de negación en la entrada A, porque A → B ≡ ¬A ∨ B.
 * - =: una balanza; queda equilibrada si los dos valores son el mismo elemento.
 * - P(x), R(x, y): un terminal que muestra la consulta a la interpretación.
 */

export type Orientation = 'vertical' | 'horizontal'

const glow = (color: string, strength = 2) => new THREE.Color(color).multiplyScalar(strength)
const LAMP = new THREE.Color()

const COLORS = {
  loop: { light: '#6f63e8', dark: '#6a5ff0' },
  gate: { light: '#5d6b86', dark: '#56637f' },
  sensor: { light: '#1b8fb0', dark: '#1a86a6' },
  metal: { light: '#c9cfdf', dark: '#8c95b3' },
}
const tone = (key: keyof typeof COLORS, palette: ScenePalette) => COLORS[key][palette.dark ? 'dark' : 'light']

interface PartProps {
  station: Station
  state: StationState
  palette: ScenePalette
  motion: boolean
  orientation: Orientation
}

export function StationModel(props: PartProps) {
  switch (props.station.kind) {
    case 'forall':
    case 'exists':
      return <LoopPart {...props} />
    case 'eq':
      return <ScalePart {...props} />
    case 'pred':
      return <SensorPart {...props} />
    default:
      return <GatePart {...props} />
  }
}

// ------------------------------------------------------------------ lámpara

/** Luz de estado: late mientras la pieza trabaja y queda verde o roja con su resultado. */
function Lamp({
  position,
  state,
  palette,
  motion,
  radius = 0.14,
}: {
  position: [number, number, number]
  state: StationState
  palette: ScenePalette
  motion: boolean
  radius?: number
}) {
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const active = state.status === 'active'
  const color =
    state.value !== null ? (state.value ? palette.true : palette.false) : active ? palette.bound : palette.muted
  useFrame(({ clock }) => {
    if (!material.current) return
    const pulse =
      active && state.value === null && motion ? 1.6 + Math.sin(clock.elapsedTime * 6) * 0.8 : 2.2
    LAMP.set(color)
    material.current.color.copy(state.status === 'idle' ? LAMP : LAMP.multiplyScalar(pulse))
  })
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial ref={material} color={color} toneMapped={false} />
      </mesh>
      {state.value !== null && (
        <TextSprite position={[0, 0, 0.2]} text={state.value ? 'V' : 'F'} color="#ffffff" height={radius * 1.1} weight={700} />
      )}
    </group>
  )
}

// ------------------------------------------------------------------ ∀ / ∃: rueda con engranaje

let gearGeometry: THREE.ExtrudeGeometry | null = null
function getGear(): THREE.ExtrudeGeometry {
  if (gearGeometry) return gearGeometry
  const teeth = 14
  const outer = 0.56
  const inner = 0.46
  const shape = new THREE.Shape()
  const step = (Math.PI * 2) / teeth
  for (let i = 0; i < teeth; i++) {
    const a = i * step
    const point = (r: number, angle: number) => [r * Math.cos(angle), r * Math.sin(angle)] as const
    const p0 = point(inner, a)
    if (i === 0) shape.moveTo(...p0)
    else shape.lineTo(...p0)
    shape.lineTo(...point(outer, a + step * 0.2))
    shape.lineTo(...point(outer, a + step * 0.5))
    shape.lineTo(...point(inner, a + step * 0.7))
  }
  shape.closePath()
  shape.holes.push(new THREE.Path().absarc(0, 0, 0.12, 0, Math.PI * 2, true))
  gearGeometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  })
  gearGeometry.center()
  return gearGeometry
}

const BEAD: Record<ItemStatus, { size: number; glow: boolean }> = {
  cumple: { size: 0.11, glow: true },
  falla: { size: 0.11, glow: true },
  probando: { size: 0.15, glow: true },
  pendiente: { size: 0.09, glow: false },
  innecesario: { size: 0.07, glow: false },
}

function LoopPart({ station, state, palette, motion }: PartProps) {
  const gear = useRef<THREE.Mesh>(null)
  const working = state.status === 'active' || state.status === 'working'
  const body = tone('loop', palette)
  useFrame((_, delta) => {
    // El engranaje gira mientras el bucle recorre el dominio.
    if (gear.current && working && motion) gear.current.rotation.z -= delta * 1.6
  })
  const items = (state.progress?.items ?? []).slice(0, 16)
  const ring = 0.86
  const beadColor = (status: ItemStatus) =>
    status === 'cumple'
      ? glow(palette.true, 2.2)
      : status === 'falla'
        ? glow(palette.false, 2.2)
        : status === 'probando'
          ? glow(palette.bound, 2.4)
          : new THREE.Color(palette.muted).multiplyScalar(status === 'innecesario' ? 0.45 : 1)
  return (
    <group>
      {/* Aro donde viajan los elementos de 𝒟. */}
      <mesh>
        <torusGeometry args={[ring, 0.04, 12, 96]} />
        <meshStandardMaterial color={tone('metal', palette)} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh ref={gear} geometry={getGear()} position={[0, 0, -0.05]}>
        <meshPhysicalMaterial
          color={body}
          metalness={0.55}
          roughness={0.28}
          clearcoat={0.6}
          emissive={palette.bound}
          emissiveIntensity={state.status === 'active' ? 0.35 : 0}
        />
      </mesh>
      {/* Tapa central con el cuantificador. */}
      <mesh position={[0, 0, 0.1]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.38, 0.38, 0.08, 40]} />
        <meshStandardMaterial color={palette.dark ? '#1d2236' : '#2b3150'} roughness={0.4} />
      </mesh>
      <TextSprite position={[0, 0.07, 0.25]} text={station.label} color="#ffffff" height={0.42} />
      <TextSprite
        position={[0, -0.19, 0.25]}
        text={station.kind === 'forall' ? 'todos' : 'basta uno'}
        color="#ffffffd0"
        height={0.15}
        weight={600}
      />
      {items.map((item, i) => {
        const angle = Math.PI / 2 + (i * Math.PI * 2) / Math.max(items.length, 1)
        const x = ring * Math.cos(angle)
        const y = ring * Math.sin(angle)
        const look = BEAD[item.status]
        return (
          <group key={item.value} position={[x, y, 0.05]}>
            <mesh>
              <sphereGeometry args={[look.size, 20, 14]} />
              <meshBasicMaterial color={beadColor(item.status)} toneMapped={!look.glow} />
            </mesh>
            <TextSprite
              position={[x * 0.3, y * 0.3, 0.15]}
              text={item.value}
              color={item.status === 'innecesario' ? palette.muted : palette.ink}
              height={0.24}
              weight={700}
            />
          </group>
        )
      })}
      <Lamp position={[0.85, 0.82, 0.1]} state={state} palette={palette} motion={motion} />
    </group>
  )
}

// ------------------------------------------------------------------ ∧ ∨ ¬ →: compuertas

/** Silueta de la compuerta mirando hacia +x (la salida a la derecha). */
function gateShape(kind: Station['kind']): THREE.Shape {
  const s = new THREE.Shape()
  if (kind === 'and') {
    s.moveTo(-0.8, -0.58)
    s.lineTo(0.1, -0.58)
    s.absarc(0.1, 0, 0.58, -Math.PI / 2, Math.PI / 2, false)
    s.lineTo(-0.8, 0.58)
    s.closePath()
  } else if (kind === 'not') {
    s.moveTo(-0.7, -0.55)
    s.lineTo(0.5, 0)
    s.lineTo(-0.7, 0.55)
    s.closePath()
  } else {
    // O (también la base de →): espalda curva y punta.
    s.moveTo(-0.85, -0.58)
    s.quadraticCurveTo(0.35, -0.6, 0.85, 0)
    s.quadraticCurveTo(0.35, 0.6, -0.85, 0.58)
    s.quadraticCurveTo(-0.55, 0, -0.85, -0.58)
  }
  return s
}

const gateCache = new Map<string, THREE.ExtrudeGeometry>()
function getGate(kind: Station['kind']): THREE.ExtrudeGeometry {
  const cached = gateCache.get(kind)
  if (cached) return cached
  const geometry = new THREE.ExtrudeGeometry(gateShape(kind), {
    depth: 0.32,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
    curveSegments: 32,
  })
  geometry.translate(0, 0, -0.16)
  gateCache.set(kind, geometry)
  return geometry
}

const GATE_SYMBOL: Record<string, string> = { and: '∧', or: '∨', not: '¬', implies: '→' }
const GATE_ROLE: Record<string, string> = { and: 'Y', or: 'O', not: 'NO', implies: '¬A ∨ B' }

function GatePart({ station, state, palette, motion, orientation }: PartProps) {
  const body = tone('gate', palette)
  // La silueta mira a +x; se gira para que la salida apunte hacia la raíz.
  const rotation = orientation === 'vertical' ? Math.PI / 2 : Math.PI
  // Burbuja de la entrada A (la primera): queda del lado de la primera subfórmula.
  const inputA = orientation === 'vertical' ? 0.3 : -0.3
  const metal = tone('metal', palette)
  return (
    <group>
      <group rotation-z={rotation}>
        <mesh geometry={getGate(station.kind)}>
          <meshPhysicalMaterial
            color={body}
            metalness={0.35}
            roughness={0.3}
            clearcoat={0.9}
            clearcoatRoughness={0.15}
            emissive={palette.bound}
            emissiveIntensity={state.status === 'active' ? 0.4 : 0}
          />
        </mesh>
        {station.kind === 'not' && (
          <mesh position={[0.66, 0, 0]}>
            <sphereGeometry args={[0.14, 24, 16]} />
            <meshStandardMaterial color={metal} metalness={0.6} roughness={0.25} />
          </mesh>
        )}
        {station.kind === 'implies' && (
          // Burbuja de negación en la entrada A: la compuerta es ¬A ∨ B.
          <mesh position={[-0.98, inputA, 0]}>
            <sphereGeometry args={[0.17, 28, 20]} />
            <meshPhysicalMaterial color="#f4f6ff" metalness={0.2} roughness={0.15} clearcoat={1} />
          </mesh>
        )}
      </group>
      <TextSprite position={[0, 0.06, 0.4]} text={GATE_SYMBOL[station.kind] ?? station.label} color="#ffffff" height={0.52} />
      <TextSprite position={[0, -0.3, 0.4]} text={GATE_ROLE[station.kind] ?? ''} color="#ffffffd0" height={0.2} weight={600} />
      <Lamp position={[0.72, 0.6, 0.2]} state={state} palette={palette} motion={motion} />
    </group>
  )
}

// ------------------------------------------------------------------ P(x), R(x, y): terminal

function SensorPart({ station, state, palette, motion }: PartProps) {
  const atom = state.node?.atom
  const query = atom ? `${atom.symbol}(${atom.args.join(', ')}) ?` : 'esperando…'
  const answer = state.value === null ? null : state.value ? 'Sí' : 'No'
  return (
    <group>
      <RoundedBox args={[2.05, 1.2, 0.42]} radius={0.14} smoothness={4}>
        <meshPhysicalMaterial
          color={tone('sensor', palette)}
          metalness={0.3}
          roughness={0.3}
          clearcoat={0.8}
          emissive={palette.bound}
          emissiveIntensity={state.status === 'active' ? 0.35 : 0}
        />
      </RoundedBox>
      {/* Pantalla. */}
      <mesh position={[0, -0.04, 0.22]}>
        <planeGeometry args={[1.72, 0.86]} />
        <meshStandardMaterial color="#0b1222" roughness={0.2} metalness={0.1} />
      </mesh>
      <TextSprite position={[0, 0.17, 0.35]} text={station.text} color="#e8f4ff" height={0.3} />
      <TextSprite
        position={[0, -0.18, 0.35]}
        text={answer ? `${query} ${answer}` : query}
        color={state.value === null ? '#7fd8ff' : state.value ? palette.true : palette.false}
        height={0.25}
        weight={700}
      />
      {/* Ojo del sensor: la lámpara. */}
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 0.12, 20]} />
        <meshStandardMaterial color={tone('metal', palette)} metalness={0.7} roughness={0.25} />
      </mesh>
      <Lamp position={[0, 0.8, 0]} state={state} palette={palette} motion={motion} radius={0.16} />
    </group>
  )
}

// ------------------------------------------------------------------ =: balanza

function ScalePart({ station, state, palette, motion }: PartProps) {
  const beam = useRef<THREE.Group>(null)
  const left = useRef<THREE.Group>(null)
  const right = useRef<THREE.Group>(null)
  const atom = state.node?.atom
  // Equilibrada si los valores son el mismo elemento; si no, se inclina.
  const tilt = state.value === false ? 0.3 : 0
  useFrame((_, delta) => {
    if (!beam.current) return
    const z = motion ? THREE.MathUtils.damp(beam.current.rotation.z, tilt, 5, delta) : tilt
    beam.current.rotation.z = z
    // Los platillos cuelgan siempre derechos.
    if (left.current) left.current.rotation.z = -z
    if (right.current) right.current.rotation.z = -z
  })
  const metal = tone('metal', palette)
  const material = <meshStandardMaterial color={metal} metalness={0.75} roughness={0.22} />
  const pan = (ref: RefObject<THREE.Group | null>, x: number, value: string | undefined) => (
    <group ref={ref} position={[x, 0, 0]}>
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.44, 8]} />
        {material}
      </mesh>
      <mesh position={[0, -0.45, 0]}>
        <cylinderGeometry args={[0.3, 0.22, 0.06, 32]} />
        {material}
      </mesh>
      {value !== undefined && (
        <TextSprite position={[0, -0.28, 0.3]} text={value} color="#ffffff" background={palette.bound} height={0.26} weight={700} />
      )}
    </group>
  )
  return (
    <group position={[0, 0.1, 0]}>
      {/* Pie y columna. */}
      <mesh position={[0, -0.82, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.1, 40]} />
        {material}
      </mesh>
      <mesh position={[0, -0.32, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 1.0, 16]} />
        {material}
      </mesh>
      <group ref={beam} position={[0, 0.2, 0]}>
        <mesh>
          <boxGeometry args={[1.8, 0.06, 0.08]} />
          {material}
        </mesh>
        {pan(left, -0.85, atom?.args[0])}
        {pan(right, 0.85, atom?.args[1])}
      </group>
      <Lamp position={[0, 0.36, 0]} state={state} palette={palette} motion={motion} radius={0.12} />
      <TextSprite position={[0, -1.08, 0.2]} text={station.text} color={palette.ink} height={0.28} />
    </group>
  )
}
