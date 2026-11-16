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
// Vite's ?raw import: the file's text (e.g. wrangler.jsonc).
declare module '*?raw' {
  const text: string
  export default text
}
// Vite's import.meta.glob (fakes.ts loads migrations/*.sql with it).
interface ImportMeta {
  glob<T>(pattern: string, options: { query: '?raw'; import: 'default'; eager: true }): Record<string, T>
}
