export namespace Time {
  export function formatMinutes(millis: number) {
    const date = new Date(0)
    date.setMilliseconds(millis)
    return date.toISOString().substr(11, 8)
  }
}
