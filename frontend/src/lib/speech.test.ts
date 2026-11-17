import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  pickSpanishVoice,
  spanishVoices,
  voiceQuality,
  recognitionErrorMessage,
  recognitionLanguage,
  toSpeakable,
} from './speech'

afterEach(() => vi.unstubAllGlobals())

describe('voces', () => {
  const named = (name: string, lang: string, localService: boolean) =>
    ({ name, lang, localService }) as SpeechSynthesisVoice

  const espeak = named('eSpeak Spanish (Latin America)', 'es-419', true)
  const google = named('Google español de Estados Unidos', 'es-US', false)
  const edge = named('Microsoft Dalia Online (Natural) - Spanish (Mexico)', 'es-MX', false)
  const spain = named('Google español', 'es-ES', false)

  it('clasifica la calidad por el nombre', () => {
    expect(voiceQuality(espeak)).toBe('robótica')
    expect(voiceQuality(google)).toBe('buena')
    expect(voiceQuality(edge)).toBe('natural')
  })

  it('elige la más natural aunque la robótica sea local', () => {
    expect(pickSpanishVoice([espeak, google])).toBe(google)
    expect(pickSpanishVoice([espeak, google, edge])).toBe(edge)
  })

  it('prefiere el español latinoamericano entre voces de la misma calidad', () => {
    expect(pickSpanishVoice([spain, google])).toBe(google)
  })

  it('respeta la voz elegida por el usuario si existe', () => {
    expect(pickSpanishVoice([espeak, edge], espeak.name)).toBe(espeak)
    expect(pickSpanishVoice([espeak, edge], 'Voz que ya no existe')).toBe(edge)
  })

  it('ordena de la más natural a la más robótica y descarta otros idiomas', () => {
    const english = named('Google US English', 'en-US', false)
    expect(spanishVoices([espeak, english, google, edge])).toEqual([edge, google, espeak])
  })

  it('sin voces en español devuelve null', () => {
    expect(pickSpanishVoice([named('Alex', 'en-US', true)])).toBeNull()
  })
})

describe('toSpeakable', () => {
  it('evita que las mayúsculas se deletreen y pronuncia los símbolos', () => {
    expect(toSpeakable('El resultado es VERDADERA: x ↦ a, s(1) = 2.')).toBe(
      'El resultado es verdadera: x vale a, s(1) igual a 2.',
    )
  })

  it('conserva nombres cortos en mayúscula', () => {
    expect(toSpeakable('¿R(a, b)? «No».')).toBe('R(a, b)? No.')
  })
})

describe('reconocimiento', () => {
  it('ignora el silencio y explica los demás errores', () => {
    expect(recognitionErrorMessage('no-speech')).toBeNull()
    expect(recognitionErrorMessage('not-allowed')).toMatch(/permiso/)
    expect(recognitionErrorMessage('network')).toMatch(/internet/)
    expect(recognitionErrorMessage('raro')).toMatch(/raro/)
  })

  it('usa el español del navegador o es-MX', () => {
    vi.stubGlobal('navigator', { language: 'es-GT' })
    expect(recognitionLanguage()).toBe('es-GT')
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect(recognitionLanguage()).toBe('es-MX')
  })
})
