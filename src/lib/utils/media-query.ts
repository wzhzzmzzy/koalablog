export const REM_SIZE = 16

export const BREAK_POINTS = {
  sm: 40 * REM_SIZE,
  md: 48 * REM_SIZE,
  lg: 64 * REM_SIZE,
  xl: 80 * REM_SIZE,
}

/**
 * Custom hook to track and respond to media query changes for responsive design
 * @param bp - Breakpoint key from BREAK_POINTS (sm, md, lg, xl) to track
 * @param callback - Callback function that executes when the media query state changes
 * @returns Object containing cleanup function and snapshot getter for current media query state
 */
export function useMediaQuery(bp: keyof typeof BREAK_POINTS, callback: (matched: MediaQueryListEvent) => void) {
  if (import.meta.env.SSR) {
    return {
      clean: () => void 0,
      getSnapshot: () => true,
    }
  }

  const query = `(min-width: ${BREAK_POINTS[bp]}px)`
  const matchMedia = window.matchMedia(query)

  matchMedia.addEventListener('change', callback)

  const getSnapshot = () => {
    return window.matchMedia(query).matches
  }

  return {
    clean: () => {
      matchMedia.removeEventListener('change', callback)
    },
    getSnapshot,
  }
}
