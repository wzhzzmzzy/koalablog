interface CliArgumentSchema {
  valueFlags: readonly string[]
  booleanFlags?: readonly string[]
  usage: string
}

export interface ParsedCliArguments {
  values: Map<string, string>
  flags: Set<string>
}

export function parseCliArguments(input: string[], schema: CliArgumentSchema): ParsedCliArguments {
  const valueFlags = new Set(schema.valueFlags)
  const booleanFlags = new Set(schema.booleanFlags ?? [])
  const values = new Map<string, string>()
  const flags = new Set<string>()

  for (let index = 0; index < input.length;) {
    const argument = input[index]
    if (!argument?.startsWith('--'))
      throw new Error(schema.usage)

    const name = argument.slice(2)
    if (booleanFlags.has(name)) {
      flags.add(name)
      index += 1
      continue
    }

    const value = input[index + 1]
    if (!valueFlags.has(name) || !value || value.startsWith('--'))
      throw new Error(schema.usage)
    values.set(name, value)
    index += 2
  }

  return { values, flags }
}
