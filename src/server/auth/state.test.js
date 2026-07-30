import { createState, validateState } from './state.js'

function createFakeYar() {
  const store = new Map()

  return {
    set: (key, value) => store.set(key, value),
    get: (key, clear) => {
      const value = store.get(key)
      if (clear) {
        store.delete(key)
      }
      return value
    },
    clear: (key) => store.delete(key)
  }
}

describe('#state', () => {
  test('Should validate a state that matches the one stored in yar', () => {
    const request = { yar: createFakeYar() }
    const state = createState(request)

    expect(validateState(request, state)).toBe(true)
  })

  test('Should not validate a state that does not match the stored one', () => {
    const request = { yar: createFakeYar() }
    createState(request)

    expect(validateState(request, 'tampered-state')).toBe(false)
  })

  test('Should not validate when no state was ever stored', () => {
    const request = { yar: createFakeYar() }

    expect(validateState(request, 'any-state')).toBe(false)
  })

  test('Should not validate when no state is provided', () => {
    const request = { yar: createFakeYar() }
    createState(request)

    expect(validateState(request, undefined)).toBe(false)
  })

  test('Should not validate the same state twice (single use)', () => {
    const request = { yar: createFakeYar() }
    const state = createState(request)

    expect(validateState(request, state)).toBe(true)
    expect(validateState(request, state)).toBe(false)
  })
})
