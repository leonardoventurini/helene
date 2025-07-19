export function getPromise() {
  let resolve = null

  const promise = new Promise(r => {
    resolve = r
  })

  return {
    promise,
    resolve,
  }
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function randomSleep(min = 50, max = 200) {
  return sleep(Math.floor(Math.random() * (max - min) + min))
}
