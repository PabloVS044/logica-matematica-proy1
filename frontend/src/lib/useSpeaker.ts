import { useCallback, useEffect, useRef, useState } from 'react'

import { useVoiceSettings } from '../store/voiceStore'
import { pickSpanishVoice, spanishVoices, synthesisSupported, toSpeakable } from './speech'

/** Voces en español disponibles (el navegador las carga de forma asíncrona). */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (!synthesisSupported()) return
    const synth = window.speechSynthesis
    const load = () => setVoices(spanishVoices(synth.getVoices()))
    load()
    synth.addEventListener?.('voiceschanged', load)
    return () => synth.removeEventListener?.('voiceschanged', load)
  }, [])
  return voices
}

export interface Speaker {
  supported: boolean
  speaking: boolean
  /** Lee el texto (cancela lo anterior). La promesa se cumple al terminar o cancelar. */
  speak: (text: string) => Promise<void>
  stop: () => void
}

export function useSpeaker(): Speaker {
  const [supported] = useState(synthesisSupported)
  const [speaking, setSpeaking] = useState(false)
  const voiceName = useVoiceSettings((s) => s.voiceName)
  const rate = useVoiceSettings((s) => s.rate)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (!supported) return
    const synth = window.speechSynthesis
    return () => synth.cancel()
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    current.current = null
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [supported])

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!supported || !text.trim()) return resolve()
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(toSpeakable(text))
        // La voz se elige en cada lectura: la lista puede cargarse después del primer render.
        const voice = pickSpanishVoice(window.speechSynthesis.getVoices(), voiceName)
        utterance.lang = voice?.lang ?? 'es-MX'
        if (voice) utterance.voice = voice
        utterance.rate = rate
        const finish = () => {
          if (current.current === utterance) {
            current.current = null
            setSpeaking(false)
          }
          resolve()
        }
        utterance.onend = finish
        utterance.onerror = finish
        current.current = utterance
        setSpeaking(true)
        window.speechSynthesis.speak(utterance)
      }),
    [supported, rate, voiceName],
  )

  return { supported, speaking, speak, stop }
}
