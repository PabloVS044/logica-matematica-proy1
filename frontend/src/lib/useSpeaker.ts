import { useCallback, useEffect, useRef, useState } from 'react'

import { pickSpanishVoice, synthesisSupported, toSpeakable } from './speech'

export interface Speaker {
  supported: boolean
  speaking: boolean
  /** Lee el texto (cancela lo anterior). La promesa se cumple al terminar o cancelar. */
  speak: (text: string) => Promise<void>
  stop: () => void
}

export function useSpeaker(rate = 1): Speaker {
  const [supported] = useState(synthesisSupported)
  const [speaking, setSpeaking] = useState(false)
  const voice = useRef<SpeechSynthesisVoice | null>(null)
  const current = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    if (!supported) return
    const synth = window.speechSynthesis
    const load = () => {
      voice.current = pickSpanishVoice(synth.getVoices())
    }
    load()
    synth.addEventListener?.('voiceschanged', load)
    return () => {
      synth.removeEventListener?.('voiceschanged', load)
      synth.cancel()
    }
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
        utterance.lang = voice.current?.lang ?? 'es-MX'
        if (voice.current) utterance.voice = voice.current
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
    [supported, rate],
  )

  return { supported, speaking, speak, stop }
}
