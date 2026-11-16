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

/** Voz en español, prefiriendo variantes latinoamericanas y voces locales. */
export function pickSpanishVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith('es'))
  const rank = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase()
    const regional = ['es-mx', 'es-us', 'es-419', 'es-gt', 'es-co', 'es-ar'].includes(lang) ? 0 : 1
    return regional * 2 + (v.localService ? 0 : 1)
  }
  return [...spanish].sort((a, b) => rank(a) - rank(b))[0] ?? null
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
