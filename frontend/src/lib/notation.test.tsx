import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Notation } from './notation'

describe('Notation', () => {
  it('dibuja el entorno como subíndice', () => {
    const { container } = render(<Notation text="ℐ ⊨_{l[x↦a]} P(x) y ℐ ⊭_{l} Q" />)
    const subs = container.querySelectorAll('sub')
    expect([...subs].map((s) => s.textContent)).toEqual(['l[x↦a]', 'l'])
    expect(container.textContent).toBe('ℐ ⊨l[x↦a] P(x) y ℐ ⊭l Q')
  })

  it('deja el texto sin subíndices igual', () => {
    const { container } = render(<Notation text="(a, b) ∈ Qᴵ" />)
    expect(container.innerHTML).toBe('(a, b) ∈ Qᴵ')
  })
})
