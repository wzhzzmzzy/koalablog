/**
 * Minimal type declaration for pngjs (which ships without bundled types).
 * Only the API surface used by the visual baseline harness is declared.
 */

declare module 'pngjs' {
  interface PNGMetadata {
    width: number
    height: number
    depth: number
    interlace: boolean
    palette: boolean
    color: boolean
    alpha: boolean
    bpp: number
    colorType: number
  }

  class PNG {
    width: number
    height: number
    data: import('node:buffer').Buffer
    gamma: number
    bpp: number

    constructor(options?: {
      width?: number
      height?: number
      fill?: boolean | number
    })

    static parse(data: import('node:buffer').Buffer, callback?: (err: Error | null, png: PNG) => void): PNG
    static sync: {
      read: (buffer: import('node:buffer').Buffer) => PNG
      write: (png: PNG, options?: unknown) => import('node:buffer').Buffer
    }

    parse(data: import('node:buffer').Buffer, callback?: (err: Error | null, png: PNG) => void): PNG
    pack(): NodeJS.ReadableStream
    bitblt(dst: PNG, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void
    adjustGamma(): void
  }

  export { PNG }
}
