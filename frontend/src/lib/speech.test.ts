import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  pickSpanishVoice,
  recognitionErrorMessage,
  recognitionLanguage,
  toSpeakable,
} from './speech'

const voice = (lang: string, localService = true) =>
  ({ lang, localService, name: lang }) as SpeechSynthesisVoice

afterEach(() => vi.unstubAllGlobals())

describe('pickSpanishVoice', () => {
  it('prefiere español latinoamericano y voces locales', () => {
    const voices = [voice('en-US'), voice('es-ES'), voice('es-MX', false), voice('es-MX')]
    expect(pickSpanishVoice(voices)).toBe(voices[3])
  })

  it('usa cualquier español si no hay variante latinoamericana', () => {
    expect(pickSpanishVoice([voice('en-US'), voice('es-ES')])?.lang).toBe('es-ES')
  })

  it('sin voces en español devuelve null', () => {
    expect(pickSpanishVoice([voice('en-US')])).toBeNull()
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
