// Shared CLI conventions for scripts/: a `usage:` line on bad arguments, a one-line reason and exit 1 on failure.

// Prints the reason (one line, to stderr) and exits 1.
export function die(reason) {
  console.error(reason)
  process.exit(1)
}

// The script's arguments, each one of `allowed` (flags only); anything else
// prints `usage: <usage>` and exits 1.
export function flags(allowed, usage) {
  const args = process.argv.slice(2)
  if (args.some((a) => !allowed.includes(a))) die(`usage: ${usage}`)
  return new Set(args)
}
