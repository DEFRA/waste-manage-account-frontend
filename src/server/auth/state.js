import { randomUUID } from 'node:crypto'

const yarKey = 'defraIdSignOutState'

/**
 * Generates a one-time CSRF state value for the hand-rolled sign-out flow
 * (bell's own sign-in state doesn't cover sign-out) and stores it in yar
 * so it can be checked against the value DEFRA ID echoes back.
 */
export function createState(request) {
  const state = randomUUID()
  request.yar.set(yarKey, state)
  return state
}

/**
 * Validates a returned state value against the one stored in yar. Always
 * clears the stored value so it can't be replayed, and never throws —
 * a missing or tampered state is just invalid.
 */
export function validateState(request, state) {
  const storedState = request.yar.get(yarKey, true)

  if (!storedState || !state) {
    return false
  }

  return storedState === state
}
