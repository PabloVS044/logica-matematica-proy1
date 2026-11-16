import {
  Billboard,
  Environment,
  Lightformer,
  Line,
  OrbitControls,
  Sparkles,
  Stars,
} from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { layoutDomain, type Step, type Vec3 } from '../../lib/universe'
import { TextSprite } from './TextSprite'

/** Radio de la esfera de cada elemento. */
const R = 0.34
const UP = new THREE.Vector3(0, 1, 0)
/** Vector auxiliar para los cálculos de cada cuadro (evita crear objetos 60 veces por segundo). */
const SCRATCH = new THREE.Vector3()

/**
 * Color "más brillante que blanco" para lo que debe resplandecer: el bloom solo actúa sobre
 * lo que supera el umbral, así que el resto de la escena queda nítido.
 */
function glow(color: string, strength = 2.2): THREE.Color {
  return new THREE.Color(color).multiplyScalar(strength)
}

let shadowTexture: THREE.Texture | null = null
/** Degradado radial negro → transparente, compartido por todas las sombras. */
function getShadowTexture(): THREE.Texture {
  if (shadowTexture) return shadowTexture
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(0,0,0,1)')
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.45)')
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  shadowTexture = new THREE.CanvasTexture(canvas)
  return shadowTexture
}

/** Sombra suave bajo un elemento: lo ancla al suelo y da sensación de altura. */
function SoftShadow({ position, opacity }: { position: Vec3; opacity: number }) {
  return (
    <mesh position={position} rotation-x={-Math.PI / 2} renderOrder={-1}>
      <planeGeometry args={[R * 3.2, R * 3.2]} />
      <meshBasicMaterial
        map={getShadowTexture()}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}

export interface ScenePalette {
  dark: boolean
  ink: string
  muted: string
  accent: string
  true: string
  false: string
  sphere: string
  /** Elementos que el entorno asigna a alguna variable. */
  bound: string
}

export interface UnaryLayer {
  name: string
  color: string
  members: ReadonlySet<string>
}

export interface BinaryLayer {
  name: string
  color: string
  edges: readonly [string, string][]
}

export interface UniverseSceneProps {
  domain: readonly string[]
  /** Constantes que nombran cada elemento: elemento → [c, d, …]. */
  names: ReadonlyMap<string, string[]>
  unary: readonly UnaryLayer[]
  binary: readonly BinaryLayer[]
  step: Step | null
  /** Identifica el paso: al cambiar, las animaciones del paso empiezan de nuevo. */
  stepKey: number
  palette: ScenePalette
  /** false con prefers-reduced-motion: todo aparece en su estado final, sin animar. */
  motion: boolean
  /** Giro automático de la cámara. */
  spin: boolean
  /** Elemento elegido con un clic: se resaltan sus flechas y se atenúan las demás. */
  selected: string | null
  onSelect: (element: string | null) => void
  /** Elementos ya revisados por el cuantificador más interno: true cumple, false no. */
  marks: ReadonlyMap<string, { var: string; ok: boolean }>
}

export default function UniverseScene(props: UniverseSceneProps) {
  const positions = useMemo(() => layoutDomain(props.domain.length), [props.domain.length])
  const extent = Math.max(2, ...positions.map(([x, y, z]) => Math.hypot(x, y, z)))
  const { dark, accent } = props.palette
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: [0, extent * 1.05 + 1.5, extent * 2.05 + 2.8], fov: 42 }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <ambientLight intensity={dark ? 0.3 : 0.55} />
      <directionalLight position={[3, 9, 5]} intensity={dark ? 1.1 : 1.5} />
      {/* Entorno hecho con paneles de luz (no descarga texturas): da reflejos suaves. */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, -6]} scale={[12, 4, 1]} />
        <Lightformer
          form="rect"
          intensity={1.4}
          color={accent}
          position={[-7, 1, 2]}
          rotation-y={Math.PI / 2}
          scale={[8, 3, 1]}
        />
        <Lightformer form="circle" intensity={1.8} position={[6, 4, 5]} scale={3} />
      </Environment>
      {dark && props.motion && (
        <Stars radius={60} depth={30} count={1500} factor={3} fade speed={0.6} />
      )}
      {props.motion && (
        <Sparkles
          count={70}
          scale={[extent * 3.2, extent * 1.6, extent * 3.2]}
          size={dark ? 2.5 : 2}
          speed={0.25}
          opacity={dark ? 0.7 : 0.45}
          color={accent}
        />
      )}
      <Universe {...props} positions={positions} />
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.2} intensity={0.85} />
      </EffectComposer>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        autoRotate={props.spin}
        autoRotateSpeed={0.35}
        minDistance={2}
        maxDistance={extent * 6 + 6}
        // Mira un poco por debajo del centro: el universo queda sobre el dock de la fórmula.
        target={[0, -extent * 0.42, 0]}
      />
      <FitCamera extent={extent} targetY={-extent * 0.42} />
    </Canvas>
  )
}

/**
 * Aleja la cámara lo necesario para que el universo quepa a lo ancho y a lo alto del lienzo,
 * que se angosta cuando hay paneles a los lados. Conserva la dirección desde la que se mira.
 */
function FitCamera({ extent, targetY }: { extent: number; targetY: number }) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera
  const width = useThree((state) => state.size.width)
  const height = useThree((state) => state.size.height)
  useEffect(() => {
    const vertical = THREE.MathUtils.degToRad(camera.fov) / 2
    const horizontal = Math.atan(Math.tan(vertical) * (width / height))
    const reach = extent + R + 0.4 // radio del universo más la esfera y su marca
    const base = Math.hypot(extent * 1.05 + 1.5 - targetY, extent * 2.05 + 2.8)
    const distance = Math.max(base, (reach / Math.tan(horizontal)) * 1.08)
    const target = new THREE.Vector3(0, targetY, 0)
    const direction = camera.position.clone().sub(target).normalize()
    camera.position.copy(target).addScaledVector(direction, distance)
  }, [camera, width, height, extent, targetY])
  return null
}

function Universe({
  domain,
  names,
  unary,
  binary,
  step,
  stepKey,
  palette,
  motion,
  positions,
  selected,
  onSelect,
  marks,
}: Omit<UniverseSceneProps, 'spin'> & { positions: Vec3[] }) {
  // Vectores estables (no se mutan): las curvas se recalculan solo si cambia el dominio.
  const vectors = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    domain.forEach((element, i) => map.set(element, new THREE.Vector3(...positions[i])))
    return map
  }, [domain, positions])
  const at = (element: string): THREE.Vector3 | null => vectors.get(element) ?? null

  const node = step?.node ?? null
  const bindings = node?.env ?? []
  const bound = new Set(bindings.map((b) => b.value))
  const atom = step?.phase === 'visit' ? (node?.atom ?? null) : null
  const atomColor = node?.value ? palette.true : palette.false
  const focus = step?.focus ?? null

  // En el anillo se dibuja la órbita: da estructura sin competir con las flechas.
  const orbit = domain.length >= 3 && domain.length <= 12 ? Math.hypot(...positions[0]) : null
  const floor = Math.min(...positions.map(([, y]) => y)) - R - 0.5

  return (
    <group>
      {orbit !== null && (
        <mesh rotation-x={-Math.PI / 2} position-y={floor}>
          <ringGeometry args={[orbit - 0.012, orbit + 0.012, 160]} />
          <meshBasicMaterial color={palette.muted} transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {positions.map(([x, , z], i) => (
        <SoftShadow
          key={`sombra-${i}`}
          position={[x, floor, z]}
          opacity={palette.dark ? 0.55 : 0.22}
        />
      ))}
      {domain.map((element, i) => (
        <ElementNode
          key={element}
          label={element}
          names={names.get(element) ?? []}
          position={positions[i]}
          rings={unary.map((layer) => (layer.members.has(element) ? layer.color : null))}
          selected={selected === element}
          onSelect={() => onSelect(selected === element ? null : element)}
          highlight={
            focus?.value === element
              ? focus.kind === 'testigo'
                ? palette.true
                : palette.false
              : bound.has(element)
                ? palette.bound
                : null
          }
          palette={palette}
        />
      ))}

      {binary.map((layer, k) =>
        layer.edges.map(([a, b]) => {
          const from = at(a)
          const to = at(b)
          if (!from || !to) return null
          const active =
            atom?.symbol === layer.name && atom.args[0] === a && atom.args[1] === b
          const dim = selected !== null && a !== selected && b !== selected && !active
          return (
            <Edge
              key={`${layer.name}:${a}:${b}`}
              from={from}
              to={to}
              lane={k}
              color={active ? palette.true : layer.color}
              width={active ? 4.5 : selected !== null && !dim ? 2.6 : 1.6}
              opacity={dim ? 0.15 : 1}
              traveler={active ? { color: palette.true, key: stepKey } : null}
              motion={motion}
            />
          )
        }),
      )}

      {atom && node && (
        <AtomHighlight
          key={stepKey}
          atom={atom}
          value={node.value}
          at={at}
          unary={unary}
          binary={binary}
          color={atomColor}
          palette={palette}
          motion={motion}
        />
      )}

      {focus && at(focus.value) && (
        <group key={`focus-${stepKey}`} position={at(focus.value)!}>
          <Pulse color={focus.kind === 'testigo' ? palette.true : palette.false} motion={motion} />
          <TextSprite
            position={[0, -R - 0.75, 0]}
            text={`${focus.kind}: ${focus.var} ↦ ${focus.value}`}
            color="#ffffff"
            background={focus.kind === 'testigo' ? palette.true : palette.false}
            height={0.2}
            weight={700}
          />
        </group>
      )}

      {[...marks].map(([element, { var: name, ok }]) => {
        const at0 = at(element)
        if (!at0) return null
        // En el plano de la pantalla, arriba a la derecha de la esfera.
        return (
          <Billboard key={`marca-${element}`} position={at0}>
            <TextSprite
              position={[R * 1.15, R * 0.8, 0]}
              text={`${name} ${ok ? '✓' : '✗'}`}
              color="#ffffff"
              background={ok ? palette.true : palette.false}
              height={0.17}
              weight={700}
            />
          </Billboard>
        )
      })}

      {bindings.map((binding, i) => {
        const target = at(binding.value)
        if (!target) return null
        // Varias variables sobre el mismo elemento se apilan en el orden del entorno.
        const stack = bindings.slice(0, i).filter((b) => b.value === binding.value).length
        return (
          <VarTag
            key={binding.var}
            name={binding.var}
            target={target.clone().add(new THREE.Vector3(0, R + 0.42 + stack * 0.42, 0))}
            color={palette.bound}
            motion={motion}
          />
        )
      })}
    </group>
  )
}

function ElementNode({
  label,
  names,
  position,
  rings,
  highlight,
  selected,
  onSelect,
  palette,
}: {
  label: string
  names: string[]
  position: Vec3
  rings: (string | null)[]
  highlight: string | null
  selected: boolean
  onSelect: () => void
  palette: ScenePalette
}) {
  const [hovered, setHovered] = useState(false)
  const group = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!hovered) return
    document.body.style.cursor = 'pointer'
    return () => {
      document.body.style.cursor = ''
    }
  }, [hovered])
  // Crece un poco al pasar el mouse o al estar seleccionado, con una transición suave.
  const scale = selected ? 1.22 : hovered ? 1.12 : 1
  useFrame((_, delta) => {
    group.current?.scale.lerp(SCRATCH.setScalar(scale), 1 - Math.exp(-delta * 12))
  })
  return (
    <group position={position}>
    <group ref={group}>
      {selected && (
        <Billboard>
          <mesh>
            <ringGeometry args={[R * 1.32, R * 1.45, 64]} />
            <meshBasicMaterial color={glow(palette.accent, 1.6)} toneMapped={false} transparent />
          </mesh>
        </Billboard>
      )}
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <sphereGeometry args={[R, 64, 48]} />
        <meshPhysicalMaterial
          color={highlight ?? palette.sphere}
          emissive={highlight ?? '#000000'}
          emissiveIntensity={highlight ? 0.55 : 0}
          roughness={0.28}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.12}
          sheen={0.6}
          sheenColor={palette.accent}
          envMapIntensity={palette.dark ? 0.9 : 1.1}
        />
      </mesh>
      {rings.map(
        (color, i) =>
          color && (
            <mesh key={i} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[R + 0.12 + i * 0.1, 0.03, 12, 64]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
            </mesh>
          ),
      )}
      <TextSprite text={label} color={highlight ? '#ffffff' : palette.ink} height={0.3} />
      {names.length > 0 && (
        <TextSprite
          position={[0, -R - 0.3, 0]}
          text={names.join(', ')}
          color={palette.muted}
          height={0.22}
          weight={400}
        />
      )}
    </group>
    </group>
  )
}

/** Curva de una flecha a → b. Las relaciones distintas sobre el mismo par usan carriles. */
function edgeCurve(from: THREE.Vector3, to: THREE.Vector3, lane: number): THREE.Curve<THREE.Vector3> {
  if (from.distanceTo(to) < 1e-6) {
    // Lazo: sale y vuelve al elemento hacia afuera del universo.
    const out = from.clone().setY(0)
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0)
    out.normalize()
    const side = new THREE.Vector3().crossVectors(out, UP).normalize()
    const reach = R + 0.9 + lane * 0.3
    const lift = UP.clone().multiplyScalar(lane * 0.12)
    return new THREE.CubicBezierCurve3(
      from.clone().addScaledVector(out, R).addScaledVector(side, -0.14),
      from.clone().addScaledVector(out, reach).addScaledVector(side, -0.65).add(lift),
      from.clone().addScaledVector(out, reach).addScaledVector(side, 0.65).add(lift),
      from.clone().addScaledVector(out, R).addScaledVector(side, 0.14),
    )
  }
  const direction = to.clone().sub(from)
  const length = direction.length()
  const perpendicular = new THREE.Vector3().crossVectors(direction, UP)
  if (perpendicular.lengthSq() < 1e-6) perpendicular.set(1, 0, 0)
  perpendicular.normalize()
  const middle = from
    .clone()
    .add(to)
    .multiplyScalar(0.5)
    .addScaledVector(perpendicular, length * (0.16 + 0.1 * lane))
    .addScaledVector(UP, 0.12 * lane)
  return new THREE.QuadraticBezierCurve3(from.clone(), middle, to.clone())
}

/** Puntos de la curva fuera de las esferas, y la punta de flecha al final. */
function trimmed(curve: THREE.Curve<THREE.Vector3>, from: THREE.Vector3, to: THREE.Vector3) {
  const head = 0.26
  const all = curve.getPoints(48)
  const points = all.filter(
    (p) => p.distanceTo(from) > R + 0.02 && p.distanceTo(to) > R + head,
  )
  const safe = points.length >= 2 ? points : [all[0], all[all.length - 1]]
  const tail = safe[safe.length - 1]
  const tip = all.find((p, i) => i > all.length / 2 && p.distanceTo(to) <= R + 0.01) ?? to
  const direction = tip.clone().sub(tail).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(UP, direction)
  const headPosition = tail.clone().addScaledVector(direction, head / 2)
  return { points: safe, headPosition, quaternion, head }
}

function Edge({
  from,
  to,
  lane,
  color,
  width,
  dashed = false,
  opacity = 1,
  traveler,
  motion,
}: {
  from: THREE.Vector3
  to: THREE.Vector3
  lane: number
  color: string
  width: number
  dashed?: boolean
  opacity?: number
  traveler: { color: string; key: number } | null
  motion: boolean
}) {
  const curve = useMemo(() => edgeCurve(from, to, lane), [from, to, lane])
  const { points, headPosition, quaternion, head } = useMemo(
    () => trimmed(curve, from, to),
    [curve, from, to],
  )
  const tube = useMemo(() => new THREE.CatmullRomCurve3(points), [points])
  // `width` viene en "píxeles" de línea; el tubo usa un radio en unidades de la escena.
  const radius = 0.0095 * width
  const bright = width >= 4
  return (
    <group>
      {dashed ? (
        <Line
          points={points}
          color={color}
          lineWidth={width}
          dashed
          dashSize={0.12}
          gapSize={0.08}
          transparent
          opacity={opacity}
        />
      ) : (
        <mesh>
          <tubeGeometry args={[tube, 64, radius, 10, false]} />
          <meshStandardMaterial
            color={bright ? glow(color, 1.6) : color}
            toneMapped={!bright}
            roughness={0.4}
            transparent
            opacity={opacity}
          />
        </mesh>
      )}
      <mesh position={headPosition} quaternion={quaternion}>
        <coneGeometry args={[Math.max(head * 0.38, radius * 2.6), head, 24]} />
        <meshStandardMaterial
          color={bright ? glow(color, 1.6) : color}
          toneMapped={!bright}
          roughness={0.4}
          transparent
          opacity={opacity}
        />
      </mesh>
      {traveler && <Traveler key={traveler.key} curve={curve} color={traveler.color} motion={motion} />}
    </group>
  )
}

/** Un punto de luz que recorre la flecha: el par se está comprobando. */
function Traveler({
  curve,
  color,
  motion,
  stopAt = 1,
}: {
  curve: THREE.Curve<THREE.Vector3>
  color: string
  motion: boolean
  stopAt?: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    if (!ref.current) return
    elapsed.current += delta
    const t = motion ? Math.min(stopAt, elapsed.current / 0.7) : stopAt
    ref.current.position.copy(curve.getPoint(t))
  })
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.085, 20, 16]} />
      <meshBasicMaterial color={glow(color, 4)} toneMapped={false} />
    </mesh>
  )
}

/** Onda que se expande desde un elemento: ahí está el resultado del paso. */
function Pulse({ color, motion }: { color: string; motion: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const elapsed = useRef(0)
  useFrame((_, delta) => {
    if (!ref.current || !material.current) return
    elapsed.current += delta
    const t = motion ? (elapsed.current % 1.6) / 1.6 : 0.25
    ref.current.scale.setScalar(1.05 + t * 0.9)
    material.current.opacity = 0.85 * (1 - t) ** 2
  })
  return (
    <Billboard>
      <mesh ref={ref}>
        <ringGeometry args={[R * 1.1, R * 1.17, 64]} />
        <meshBasicMaterial
          ref={material}
          color={glow(color, 1.6)}
          toneMapped={false}
          transparent
          depthWrite={false}
        />
      </mesh>
    </Billboard>
  )
}

/** Resalta la fórmula atómica del paso: la flecha, el anillo o la igualdad comprobada. */
function AtomHighlight({
  atom,
  value,
  at,
  unary,
  binary,
  color,
  palette,
  motion,
}: {
  atom: { symbol: string; args: string[] }
  value: boolean
  at: (element: string) => THREE.Vector3 | null
  unary: readonly UnaryLayer[]
  binary: readonly BinaryLayer[]
  color: string
  palette: ScenePalette
  motion: boolean
}) {
  const positions = atom.args.map(at)
  if (positions.some((p) => p === null)) return null
  const points = positions as THREE.Vector3[]
  const pulses = (
    <>
      {[...new Set(atom.args)].map((element) => (
        <group key={element} position={at(element)!}>
          <Pulse color={color} motion={motion} />
        </group>
      ))}
    </>
  )

  const ringIndex = unary.findIndex((layer) => layer.name === atom.symbol)
  if (ringIndex >= 0 && points.length === 1) {
    return (
      <group>
        {pulses}
        {!value && (
          <mesh position={points[0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[R + 0.12 + ringIndex * 0.1, 0.03, 12, 64]} />
            <meshBasicMaterial color={palette.false} wireframe />
          </mesh>
        )}
      </group>
    )
  }

  const lane = binary.findIndex((layer) => layer.name === atom.symbol)
  if (lane >= 0 && points.length === 2 && !value) {
    // El par no está en la relación: una flecha fantasma que no llega.
    return (
      <group>
        {pulses}
        <Edge
          from={points[0]}
          to={points[1]}
          lane={lane}
          color={palette.false}
          width={2.5}
          dashed
          traveler={null}
          motion={motion}
        />
        <TextSprite
          position={points[0].clone().lerp(points[1], 0.5).add(new THREE.Vector3(0, 0.35, 0))}
          text="∉"
          color={palette.false}
          height={0.4}
        />
      </group>
    )
  }

  if (atom.symbol === '=' && points.length === 2 && !points[0].equals(points[1])) {
    return (
      <group>
        {pulses}
        <Line
          points={[points[0], points[1]]}
          color={palette.false}
          lineWidth={2.5}
          dashed
          dashSize={0.12}
          gapSize={0.08}
        />
        <TextSprite
          position={points[0].clone().lerp(points[1], 0.5).add(new THREE.Vector3(0, 0.3, 0))}
          text="≠"
          color={palette.false}
          height={0.45}
        />
      </group>
    )
  }

  return pulses
}

/** Etiqueta de una variable: se desliza hacia el elemento que le asigna el entorno. */
function VarTag({
  name,
  target,
  color,
  motion,
}: {
  name: string
  target: THREE.Vector3
  color: string
  motion: boolean
}) {
  const ref = useRef<THREE.Group>(null)
  const placed = useRef(false)
  useFrame((_, delta) => {
    if (!ref.current) return
    // La primera vez aparece en su lugar; después se desliza al nuevo elemento.
    if (!motion || !placed.current) ref.current.position.copy(target)
    else ref.current.position.lerp(target, 1 - Math.exp(-delta * 9))
    placed.current = true
  })
  return (
    <group ref={ref}>
      <TextSprite text={name} color="#ffffff" background={color} height={0.2} weight={700} />
    </group>
  )
}
