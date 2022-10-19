import { clone } from 'lodash'

export namespace DataStructure {
  export function moveItem(source: any[], fromIndex: number, toIndex: number) {
    if (!Array.isArray(source)) throw new Error('source must be an array')

    if (toIndex > source.length - 1) throw new Error('invalid target index')

    const array = clone(source)

    const [item] = array.splice(fromIndex, 1)

    array.splice(toIndex, 0, item)

    return array
  }
}
