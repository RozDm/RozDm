// Hand-rolled input validators for the /api/* routes: each answers the clean value or null.
// No dependency on purpose (a schema library is a new dependency: the owner's
// word). Pure and DOM-compatible — worker/domain/contact.ts uses it, and the app
// tsconfig checks that file too. A validator never throws: null is "refuse",
// and the route picks the error code (worker/http.ts apiError).

export type Validator<T> = (input: unknown) => T | null

// One of a fixed set of strings (a query parameter such as `metric`).
export function oneOf<const T extends string>(values: readonly T[]): Validator<T> {
  return (input) => (typeof input === 'string' && (values as readonly string[]).includes(input) ? (input as T) : null)
}

// A string, trimmed unless `trim: false`, of `min` (default 1) to `max`
// characters, matching `pattern` when given (anchor it yourself).
export function text(opts: { max: number; min?: number; pattern?: RegExp; trim?: boolean }): Validator<string> {
  const { max, min = 1, pattern, trim = true } = opts
  return (input) => {
    if (typeof input !== 'string') return null
    const s = trim ? input.trim() : input
    if (s.length < min || s.length > max) return null
    if (pattern && !pattern.test(s)) return null
    return s
  }
}

// An object with every field of `shape` valid; extra keys are ignored, the
// answer holds only the shape's fields.
export function object<S extends Record<string, Validator<unknown>>>(
  shape: S,
): Validator<{ [K in keyof S]: S[K] extends Validator<infer T> ? T : never }> {
  return (input) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
    const record = input as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(shape)) {
      const value = shape[key](record[key])
      if (value === null) return null
      out[key] = value
    }
    return out as { [K in keyof S]: S[K] extends Validator<infer T> ? T : never }
  }
}

// A request body parsed as JSON, or undefined when it isn't JSON (no JSON
// text parses to undefined, so it can't be mistaken for a value).
export function parseJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}
