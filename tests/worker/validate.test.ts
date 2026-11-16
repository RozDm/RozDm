import { describe, expect, it } from 'vitest'
import { object, oneOf, parseJson, text } from '../../worker/validate'

describe('worker/validate', () => {
  it('oneOf takes only the listed strings', () => {
    const v = oneOf(['a', 'b'])
    expect(v('a')).toBe('a')
    expect(v('c')).toBeNull()
    expect(v(null)).toBeNull()
    expect(v(1)).toBeNull()
    expect(v('toString')).toBeNull()
  })

  it('text trims, bounds the length and applies the pattern', () => {
    const v = text({ min: 2, max: 4 })
    expect(v('  ab ')).toBe('ab')
    expect(v(' a ')).toBeNull()
    expect(v('abcde')).toBeNull()
    expect(v(5)).toBeNull()
    expect(text({ max: 10, pattern: /^\d+$/ })('12')).toBe('12')
    expect(text({ max: 10, pattern: /^\d+$/ })('1a')).toBeNull()
    expect(text({ max: 10, trim: false })(' a ')).toBe(' a ')
    expect(text({ max: 10 })('   ')).toBeNull()
  })

  it('object needs every field valid and keeps only the shape', () => {
    const v = object({ a: text({ max: 3 }), b: oneOf(['x']) })
    expect(v({ a: ' hi ', b: 'x', extra: 1 })).toEqual({ a: 'hi', b: 'x' })
    expect(v({ a: 'hi' })).toBeNull()
    expect(v(null)).toBeNull()
    expect(v(['hi', 'x'])).toBeNull()
    expect(v('hi')).toBeNull()
  })

  it('parseJson answers undefined for anything but JSON', () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 })
    expect(parseJson('null')).toBeNull()
    expect(parseJson('nope')).toBeUndefined()
    expect(parseJson('')).toBeUndefined()
  })
})
