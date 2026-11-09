import { describe, expect, it } from 'vitest'

import { applyShortcut, insertAt } from './formulaInput'

describe('insertAt', () => {
  it('inserta en el cursor', () => {
    expect(insertAt('P(x)', 0, 0, '¬')).toEqual({ text: '¬P(x)', cursor: 1 })
  })

  it('reemplaza la selección', () => {
    expect(insertAt('P(x) & Q(x)', 5, 6, '∧')).toEqual({ text: 'P(x) ∧ Q(x)', cursor: 6 })
  })
})

describe('applyShortcut', () => {
  it.each([
    ['P(x) ->', '→'],
    ['P(x) =>', '→'],
    ['P(x) &', '∧'],
    ['P(x) /\\', '∧'],
    ['P(x) |', '∨'],
    ['P(x) \\/', '∨'],
    ['~', '¬'],
    ['!', '¬'],
    ['\\A', '∀'],
    ['\\E', '∃'],
  ])('convierte %s', (text, symbol) => {
    const edit = applyShortcut(text, text.length)
    expect(edit.text.endsWith(symbol)).toBe(true)
    expect(edit.cursor).toBe(edit.text.length)
  })

  it('solo mira lo que está justo antes del cursor', () => {
    expect(applyShortcut('x = y', 5)).toEqual({ text: 'x = y', cursor: 5 })
    expect(applyShortcut('a -> b', 3)).toEqual({ text: 'a -> b', cursor: 3 })
  })

  it('conserva el texto después del cursor', () => {
    expect(applyShortcut('P(x) -> Q(x)', 7)).toEqual({ text: 'P(x) → Q(x)', cursor: 6 })
  })
})
