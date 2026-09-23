import { useState, useCallback } from 'react'
import { isDiscreet, setDiscreet } from '../utils/formatters'

const KEY = 'portfolio.discreet.v1'

function initialDiscreet(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The formatters' flag is set synchronously, never in an effect: an effect
 * runs after render, so pages would paint once with the previous state.
 */
export function useDiscreet() {
  const [discreet, setDiscreetState] = useState(() => {
    const on = initialDiscreet()
    setDiscreet(on)
    return on
  })

  const toggle = useCallback(() => {
    const next = !isDiscreet()
    setDiscreet(next)
    setDiscreetState(next)
    try {
      localStorage.setItem(KEY, next ? '1' : '0')
    } catch {
      /* the choice just won't survive a reload */
    }
  }, [])

  return { discreet, toggle }
}
