import { useCallback, useEffect, useRef, useState } from 'react'

import {
  recognitionConstructor,
  recognitionErrorMessage,
  recognitionLanguage,
  type Recognition,
} from './speech'

export interface Dictation {
  supported: boolean
  listening: boolean
  /** Lo que se está diciendo y el reconocedor aún no confirma. */
  interim: string
  error: string | null
  start: () => void
  stop: () => void
}

/**
 * Reconocimiento continuo. Cada frase confirmada se entrega a `onPhrase`. Chrome corta la
 * escucha tras un silencio largo; mientras el usuario no la detenga, se reanuda sola.
 */
export function useDictation(onPhrase: (phrase: string) => void): Dictation {
  const [supported] = useState(() => recognitionConstructor() !== null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<Recognition | null>(null)
  const wanted = useRef(false)
  const handler = useRef(onPhrase)
  useEffect(() => {
    handler.current = onPhrase
  }, [onPhrase])

  const stop = useCallback(() => {
    wanted.current = false
    recognition.current?.stop()
    setInterim('')
  }, [])

  const start = useCallback(() => {
    const Constructor = recognitionConstructor()
    if (!Constructor) return
    recognition.current?.abort()
    const r = new Constructor()
    r.lang = recognitionLanguage()
    r.continuous = true
    r.interimResults = true
    r.onresult = (event) => {
      let pending = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0].transcript.trim()
        if (result.isFinal) {
          if (text) handler.current(text)
        } else {
          pending += ` ${text}`
        }
      }
      setInterim(pending.trim())
    }
    r.onerror = (event) => {
      const message = recognitionErrorMessage(event.error)
      if (message) {
        wanted.current = false
        setError(message)
      }
    }
    r.onend = () => {
      if (wanted.current && recognition.current === r) {
        r.start() // pausa larga: se sigue escuchando
        return
      }
      setListening(false)
      setInterim('')
    }
    recognition.current = r
    wanted.current = true
    setError(null)
    setListening(true)
    r.start()
  }, [])

  useEffect(
    () => () => {
      wanted.current = false
      recognition.current?.abort()
    },
    [],
  )

  return { supported, listening, interim, error, start, stop }
}
