// The worker tsconfig loads no Node types (they clash with the Workers
// runtime globals), so declare just what the route tests use.
declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
      run(...params: unknown[]): unknown
    }
  }
}
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string
}
// Node's Buffer, as far as the domain tests decode base64 mail bodies.
declare class Buffer extends Uint8Array {
  static from(data: string, encoding: 'base64'): Buffer
  static alloc(size: number): Buffer
  static concat(list: readonly Uint8Array[]): Buffer
  toString(encoding?: 'utf8'): string
}
// Vite's ?raw import: the file's text (e.g. wrangler.jsonc).
declare module '*?raw' {
  const text: string
  export default text
}
// Vite's import.meta.glob (fakes.ts loads migrations/*.sql with it).
interface ImportMeta {
  glob<T>(pattern: string, options: { query: '?raw'; import: 'default'; eager: true }): Record<string, T>
}
