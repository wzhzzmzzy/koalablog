export function parseJson<T>(jsonStr: string | null): T | null {
  if (!jsonStr || jsonStr === null)
    return null
  try {
    return JSON.parse(jsonStr) as T
  }
  catch (e) {
    console.error('JSON parse failed', e)
    return null
  }
}
