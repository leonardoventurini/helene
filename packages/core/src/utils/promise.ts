export const getPromise = () => {
  let resolve = null

  const promise = new Promise(r => {
    resolve = r
  })

  return {
    promise,
    resolve,
  }
}

export const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms))
