/**
 * Acceso a las APIs de voz del navegador: reconocimiento (Web Speech API) y síntesis
 * (speechSynthesis). Solo se encarga del audio: la traducción de lo dictado a una
 * fórmula la hace el backend.
 */

// TypeScript no incluye los tipos de SpeechRecognition (solo existe con prefijo en Chrome).
export interface RecognitionResult {
  readonly isFinal: boolean
  readonly 0: { readonly transcript: string }
}
export interface RecognitionEvent {
  readonly resultIndex: number
  readonly results: ArrayLike<RecognitionResult>
}
export interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

export function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** Español del navegador si lo hay; si no, español de México (variante latinoamericana). */
export function recognitionLanguage(): string {
  const preferred = typeof navigator !== 'undefined' ? navigator.language : ''
  return preferred.toLowerCase().startsWith('es') ? preferred : 'es-MX'
}

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed':
    'El navegador no tiene permiso para usar el micrófono. Permítelo en la barra de direcciones.',
  'service-not-allowed':
    'El navegador no tiene permiso para usar el micrófono. Permítelo en la barra de direcciones.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El reconocimiento de voz de este navegador necesita conexión a internet.',
  'language-not-supported': 'Este navegador no reconoce voz en español.',
}

export function recognitionErrorMessage(code: string): string | null {
  if (code === 'no-speech' || code === 'aborted') return null // silencio o cancelación
  return RECOGNITION_ERRORS[code] ?? `El reconocimiento de voz falló (${code}).`
}

// ------------------------------------------------------------------ síntesis

export function synthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export type VoiceQuality = 'natural' | 'buena' | 'robótica'

/**
 * Calidad aproximada de una voz según su nombre. Las voces neuronales ("Natural",
 * "Online", "Neural") y las de Google suenan humanas; eSpeak, la voz local habitual en
 * Linux, suena robótica.
 */
export function voiceQuality(voice: SpeechSynthesisVoice): VoiceQuality {
  const name = voice.name.toLowerCase()
  if (/espeak|e-speak|festival|pico/.test(name)) return 'robótica'
  if (/natural|neural|online|premium|enhanced|mejorad/.test(name)) return 'natural'
  if (/google|microsoft|apple|siri/.test(name)) return 'buena'
  return voice.localService ? 'robótica' : 'buena'
}

const QUALITY_RANK: Record<VoiceQuality, number> = { natural: 0, buena: 1, robótica: 2 }
const REGIONAL = ['es-mx', 'es-us', 'es-419', 'es-gt', 'es-co', 'es-ar']

/** Voces en español de la más natural a la más robótica (y latinoamericanas primero). */
export function spanishVoices(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) => {
    const regional = REGIONAL.includes(v.lang.toLowerCase().replace('_', '-')) ? 0 : 1
    return QUALITY_RANK[voiceQuality(v)] * 10 + regional
  }
  return voices
    .filter((v) => v.lang.toLowerCase().startsWith('es'))
    .sort((a, b) => rank(a) - rank(b))
}

/** La voz elegida por el usuario si existe; si no, la más natural en español. */
export function pickSpanishVoice(
  voices: readonly SpeechSynthesisVoice[],
  preferred: string | null = null,
): SpeechSynthesisVoice | null {
  const spanish = spanishVoices(voices)
  return spanish.find((v) => v.name === preferred) ?? spanish[0] ?? null
}

/**
 * Ajusta un texto para el sintetizador: las palabras en mayúsculas se leerían letra por
 * letra y algunos símbolos no se pronuncian.
 */
export function toSpeakable(text: string): string {
  return text
    .replace(/\b[A-ZÁÉÍÓÚÑ]{3,}\b/g, (word) => word.toLowerCase())
    .replace(/↦/g, ' vale ')
    .replace(/≠/g, ' distinto de ')
    .replace(/\s*=\s*/g, ' igual a ')
    .replace(/[«»¿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
