import { AVLTree } from 'avl'

export class AVLTreeWrapper {
  private tree: AVLTree<any, any[]>
  private unique: boolean
  private compareKeys: (a: any, b: any) => number
  private checkValueEquality: (a: any, b: any) => boolean

  constructor(options: {
    unique: boolean
    compareKeys: (a: any, b: any) => number
    checkValueEquality: (a: any, b: any) => boolean
  }) {
    this.unique = options.unique
    this.compareKeys = options.compareKeys
    this.checkValueEquality = options.checkValueEquality

    this.tree = new AVLTree(this.compareKeys, false)
  }

  insert(key: any, value: any) {
    const existingNode = this.tree.find(key)

    if (existingNode) {
      const existingValues = existingNode.data || []

      if (this.unique) {
        throw new Error('Unique Constraint Violation')
      }

      for (const existingValue of existingValues) {
        if (this.checkValueEquality(existingValue, value)) {
          return
        }
      }

      existingValues.push(value)
      this.tree.remove(key)
      this.tree.insert(key, existingValues)
    } else {
      this.tree.insert(key, [value])
    }
  }

  delete(key: any, value: any) {
    const node = this.tree.find(key)
    if (!node || !node.data) return

    const values = node.data
    const newValues = values.filter(v => !this.checkValueEquality(v, value))

    this.tree.remove(key)

    if (newValues.length > 0) {
      this.tree.insert(key, newValues)
    }
  }

  search(key: any): any[] {
    const node = this.tree.find(key)
    return node ? node.data || [] : []
  }

  betweenBounds(query: any): any[] {
    const results: any[] = []

    const { $gte, $gt, $lte, $lt } = query

    this.tree.forEach(node => {
      if (node.data) {
        const key = node.key
        let include = true

        if ($gte !== undefined && this.compareKeys(key, $gte) < 0)
          include = false
        if ($gt !== undefined && this.compareKeys(key, $gt) <= 0)
          include = false
        if ($lte !== undefined && this.compareKeys(key, $lte) > 0)
          include = false
        if ($lt !== undefined && this.compareKeys(key, $lt) >= 0)
          include = false

        if (include) {
          results.push(...node.data)
        }
      }
    })

    return results
  }

  executeOnEveryNode(fn: (node: { data: any[] }) => void) {
    this.tree.forEach(node => {
      if (node.data) {
        fn({ data: node.data })
      }
    })
  }

  getNumberOfKeys(): number {
    return this.tree.size
  }
}
