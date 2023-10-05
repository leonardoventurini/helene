/**
 * Return an array with the numbers from 0 to n-1, in a random order
 */
export function getRandomArray(n) {
  if (n === 0) {
    return []
  }
  if (n === 1) {
    return [0]
  }

  const res = getRandomArray(n - 1)
  const next = Math.floor(Math.random() * n)
  res.splice(next, 0, n - 1) // Add n-1 at a random position in the array

  return res
}

/*
 * Default compareKeys function will work for numbers, strings and dates
 */
export function defaultCompareKeysFunction(a, b) {
  if (a < b) {
    return -1
  }
  if (a > b) {
    return 1
  }
  if (a === b) {
    return 0
  }

  const err = new Error("Couldn't compare elements") as any
  err.a = a
  err.b = b
  throw err
}

/**
 * Check whether two values are equal (used in non-unique deletion)
 */
export function defaultCheckValueEquality(a, b) {
  return a === b
}

export function append(array, toAppend) {
  let i

  for (i = 0; i < toAppend.length; i += 1) {
    array.push(toAppend[i])
  }
}
