import { vi } from 'vitest'

import type { RecognitionEvent } from '../lib/speech'

/** Reconocedor de voz falso: las pruebas dictan frases con `say`. */
export class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: RecognitionEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  listening = false
  constructor() {
    FakeRecognition.last = this
  }
  start() {
    this.listening = true
  }
  stop() {
    this.listening = false
    this.onend?.()
  }
  abort() {
    this.listening = false
  }
  say(text: string, isFinal = true) {
    const result = Object.assign([{ transcript: text }], { isFinal })
    this.onresult?.({ resultIndex: 0, results: [result] as never })
  }
  fail(error: string) {
    this.onerror?.({ error })
  }
}

export function installRecognition() {
  vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
}

/** Sintetizador falso: registra lo que se leyó (con su voz) y termina al instante. */
export function installSynthesis(voices: Partial<SpeechSynthesisVoice>[] = []) {
  const spoken: string[] = []
  class Utterance {
    text: string
    lang = ''
    rate = 1
    voice: unknown = null
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor(text: string) {
      this.text = text
    }
  }
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  vi.stubGlobal('speechSynthesis', {
    speak: (u: Utterance) => {
      spoken.push(u.text)
      lastVoice.current = (u.voice as { name?: string } | null)?.name ?? null
      queueMicrotask(() => u.onend?.())
    },
    cancel: vi.fn(),
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
  return spoken
}

/** Nombre de la voz usada en la última lectura del sintetizador falso. */
export const lastVoice: { current: string | null } = { current: null }
