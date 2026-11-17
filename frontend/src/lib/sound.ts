import { useSoundSettings } from '../store/soundStore'

/**
 * Efectos de sonido. Los que tienen archivo (src/assets/sounds) se reproducen desde ahí;
 * el que falta (elegir un elemento) se sintetiza con Web Audio y el de cerrar ventanas es el de
 * abrirlas tocado al revés.
 *
 * El navegador no deja sonar nada antes de que la persona interactúe con la página, así que
 * el AudioContext se crea con el primer clic o tecla. Sin Web Audio (pruebas, navegadores
 * viejos) todo es silencioso y nada falla.
 */

const FILES = {
  verdadero: 'Verdadero',
  falso: 'Falso',
  noEvaluable: 'NOEvaluable',
  arranque: 'MaquinaStart',
  paquete: 'paqueteViaja',
  regresaV: 'ResultadoRegresaV',
  regresaF: 'ResultadoRegresaF',
  compuerta: 'CompuertaProcesa',
  sensor: 'SensorConsulta',
  balanzaOk: 'BalanzaEquilibrio',
  balanzaInclina: 'BalanzaInclina',
  cuentaCumple: 'CuentaCumple',
  cuentaFalla: 'CuentaFalla',
  testigo: 'TEstigo',
  contraejemplo: 'ContraEjemplo',
  todosCumplen: 'TodosCumplen',
  variable: 'VariableDesliza',
  flechaRecorre: 'FlechaRecorre',
  flechaNoExiste: 'FlechaNoExiste',
  engranajes: 'procesando_loop',
  modalAbrir: 'AbrirModal',
  cambiarVista: 'CambiarVista',
  ejemplo: 'EjemploCargado',
  errorSintaxis: 'ErrorSintaxis',
  simbolo: 'SimboloInsertar',
} as const

/** Sonidos que se obtienen tocando al revés otro archivo. */
const REVERSED = { modalCerrar: 'modalAbrir' } as const

const SYNTHS = {
  seleccionar: synthSelect,
} as const

export type FileSound = keyof typeof FILES | keyof typeof REVERSED
export type SynthSound = keyof typeof SYNTHS
export type Sound = FileSound | SynthSound
export type LoopSound = 'engranajes'

/** Volumen de cada sonido: los que se repiten mucho van más bajos para no cansar. */
const GAIN: Partial<Record<Sound, number>> = {
  verdadero: 0.7,
  falso: 0.65,
  noEvaluable: 0.5,
  arranque: 0.45,
  paquete: 0.3,
  regresaV: 0.3,
  regresaF: 0.3,
  compuerta: 0.25,
  sensor: 0.35,
  balanzaOk: 0.4,
  balanzaInclina: 0.4,
  cuentaCumple: 0.35,
  cuentaFalla: 0.35,
  testigo: 0.55,
  contraejemplo: 0.55,
  todosCumplen: 0.5,
  variable: 0.3,
  flechaRecorre: 0.35,
  flechaNoExiste: 0.35,
  modalAbrir: 0.3,
  modalCerrar: 0.25,
  cambiarVista: 0.35,
  ejemplo: 0.4,
  errorSintaxis: 0.3,
  simbolo: 0.2,
}

const urls = import.meta.glob<string>('../assets/sounds/*.wav', {
  eager: true,
  query: '?url',
  import: 'default',
})
const urlOf = (file: string) =>
  Object.entries(urls).find(([path]) => path.endsWith(`/${file}.wav`))?.[1]

interface Clip {
  buffer: AudioBuffer
  /** Desde dónde suena (se salta el silencio inicial) y cuánto dura lo audible. */
  offset: number
  duration: number
  /** Ganancia que deja el pico en el mismo nivel para todos los archivos. */
  normalize: number
}

interface PlayOptions {
  /** Velocidad de reproducción: >1 más agudo. */
  rate?: number
  /** Retraso en segundos. */
  delay?: number
  /** Multiplica el volumen del sonido. */
  gain?: number
}

class SoundEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private clips = new Map<FileSound, Clip>()
  private lastPlayed = new Map<Sound, number>()
  private loops = new Map<LoopSound, { stop: () => void }>()
  private wantedLoop: LoopSound | null = null

  get supported(): boolean {
    return typeof window !== 'undefined' && 'AudioContext' in window
  }

  private get enabled(): boolean {
    return useSoundSettings.getState().enabled
  }

  /** Crea el contexto de audio; debe llamarse durante un gesto de la persona. */
  unlock(): void {
    if (!this.supported) return
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.8
      // Un compresor suave evita que se sature cuando coinciden varios sonidos.
      const limiter = this.ctx.createDynamicsCompressor()
      limiter.threshold.value = -10
      limiter.ratio.value = 6
      this.master.connect(limiter).connect(this.ctx.destination)
      void this.loadAll()
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!
    await Promise.all(
      (Object.entries(FILES) as [keyof typeof FILES, string][]).map(async ([name, file]) => {
        const url = urlOf(file)
        if (!url) return
        try {
          const response = await fetch(url)
          const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
          this.clips.set(name, analyse(buffer, name === 'engranajes'))
        } catch {
          // Un archivo que no carga simplemente no suena.
        }
      }),
    )
    for (const [name, from] of Object.entries(REVERSED) as [FileSound, FileSound][]) {
      const clip = this.clips.get(from)
      if (clip) this.clips.set(name, analyse(reverse(ctx, clip), false))
    }
    if (this.wantedLoop) this.startLoop(this.wantedLoop)
  }

  play(name: Sound, { rate = 1, delay = 0, gain = 1 }: PlayOptions = {}): void {
    const { ctx, master } = this
    if (!ctx || !master || !this.enabled || ctx.state !== 'running') return
    // El mismo sonido dos veces casi a la vez solo suena más fuerte: se omite.
    const now = ctx.currentTime + delay
    const last = this.lastPlayed.get(name)
    if (last !== undefined && Math.abs(now - last) < 0.05) return
    this.lastPlayed.set(name, now)

    if (name in SYNTHS) {
      const out = ctx.createGain()
      out.gain.value = gain
      out.connect(master)
      if (delay > 0) {
        setTimeout(() => SYNTHS[name as SynthSound](ctx, out), delay * 1000)
      } else {
        SYNTHS[name as SynthSound](ctx, out)
      }
      return
    }
    const clip = this.clips.get(name as FileSound)
    if (!clip) return
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.playbackRate.value = rate
    const level = ctx.createGain()
    level.gain.value = clip.normalize * (GAIN[name] ?? 0.4) * gain
    source.connect(level).connect(master)
    source.start(now, clip.offset, clip.duration)
  }

  /** Deja sonando un fondo mientras corre la animación; null lo apaga. */
  setLoop(name: LoopSound | null): void {
    this.wantedLoop = name
    for (const [current, loop] of this.loops) {
      if (current !== name) {
        loop.stop()
        this.loops.delete(current)
      }
    }
    if (name && !this.loops.has(name)) this.startLoop(name)
  }

  private startLoop(name: LoopSound): void {
    const { ctx, master } = this
    if (!ctx || !master || !this.enabled || this.loops.has(name)) return
    const out = ctx.createGain()
    out.gain.value = 0
    out.connect(master)
    const clip = this.clips.get(name)
    if (!clip) return
    const source = ctx.createBufferSource()
    source.buffer = clip.buffer
    source.loop = true
    const level = ctx.createGain()
    level.gain.value = clip.normalize * 0.14
    source.connect(level).connect(out)
    source.start()
    const stopSources = () => source.stop(ctx.currentTime + 0.6)
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.4)
    this.loops.set(name, {
      stop: () => {
        out.gain.cancelScheduledValues(ctx.currentTime)
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
        stopSources()
        setTimeout(() => out.disconnect(), 1000)
      },
    })
  }

  /** Al silenciar apaga lo que esté sonando; al reactivar retoma el fondo pedido. */
  refresh(): void {
    if (!this.enabled) {
      for (const loop of this.loops.values()) loop.stop()
      this.loops.clear()
    } else if (this.wantedLoop) {
      this.startLoop(this.wantedLoop)
    }
  }
}

/** Busca dónde empieza y termina lo audible y cuánto hay que subirlo o bajarlo. */
function analyse(buffer: AudioBuffer, keepWhole: boolean): Clip {
  let peak = 0
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  for (const data of channels) for (const x of data) peak = Math.max(peak, Math.abs(x))
  const normalize = peak > 0 ? 0.9 / peak : 1
  if (keepWhole || peak === 0) return { buffer, offset: 0, duration: buffer.duration, normalize }
  const threshold = peak * 0.02
  let first = buffer.length
  let last = 0
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      if (Math.abs(data[i]) > threshold) {
        first = Math.min(first, i)
        last = Math.max(last, i)
      }
    }
  }
  const margin = Math.round(buffer.sampleRate * 0.005)
  const start = Math.max(0, first - margin)
  const end = Math.min(buffer.length, last + margin * 10)
  return {
    buffer,
    offset: start / buffer.sampleRate,
    duration: (end - start) / buffer.sampleRate,
    normalize,
  }
}

// ------------------------------------------------------------------ sonidos sintetizados

function envelope(ctx: AudioContext, out: AudioNode, at: number, peak: number, attack: number, decay: number) {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay)
  gain.connect(out)
  return gain
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  { freq, to, type = 'sine', at = 0, peak = 0.3, attack = 0.004, decay = 0.3 }: {
    freq: number
    to?: number
    type?: OscillatorType
    at?: number
    peak?: number
    attack?: number
    decay?: number
  },
) {
  const start = ctx.currentTime + at
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + attack + decay)
  osc.connect(envelope(ctx, out, start, peak, attack, decay))
  osc.start(start)
  osc.stop(start + attack + decay + 0.05)
}

/** Copia del clip con lo audible al revés (un barrido que se abre se vuelve uno que cierra). */
function reverse(ctx: AudioContext, clip: Clip): AudioBuffer {
  const from = Math.round(clip.offset * clip.buffer.sampleRate)
  const length = Math.round(clip.duration * clip.buffer.sampleRate)
  const out = ctx.createBuffer(clip.buffer.numberOfChannels, length, clip.buffer.sampleRate)
  for (let c = 0; c < clip.buffer.numberOfChannels; c++) {
    const source = clip.buffer.getChannelData(c).subarray(from, from + length)
    const target = out.getChannelData(c)
    for (let i = 0; i < length; i++) target[i] = source[length - 1 - i]
  }
  return out
}

/** Toque de vidrio sobre una perla. */
function synthSelect(ctx: AudioContext, out: AudioNode) {
  tone(ctx, out, { freq: 1568, peak: 0.18, decay: 0.28 })
  tone(ctx, out, { freq: 3920, peak: 0.05, decay: 0.12 })
}

export const sfx = new SoundEngine()

// El primer gesto de la persona habilita el audio.
if (typeof window !== 'undefined') {
  const unlock = () => sfx.unlock()
  window.addEventListener('pointerdown', unlock, { capture: true })
  window.addEventListener('keydown', unlock, { capture: true })
  useSoundSettings.subscribe(() => sfx.refresh())
}
