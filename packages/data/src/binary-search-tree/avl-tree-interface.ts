import { AVLTreeImplementation } from './avl-tree-implementation'

export class AVLTreeInterface {
  tree: AVLTreeImplementation

  constructor(options?) {
    this.tree = new AVLTreeImplementation(options)
  }
  checkIsAVLT() {
    this.tree.checkIsAVLT()
  }

  insert(key: string | number, value?: any) {
    const newTree = this.tree.insert(key, value)

    // If newTree is undefined, that means its structure was not modified
    if (newTree) {
      this.tree = newTree
    }
  }

  delete(key, value?) {
    const newTree = this.tree.delete(key, value)

    // If newTree is undefined, that means its structure was not modified
    if (newTree) {
      this.tree = newTree
    }
  }

  getNumberOfKeys() {
    return this.tree.getNumberOfKeys()
  }

  search(key) {
    return this.tree.search(key)
  }

  betweenBounds(...args) {
    // @ts-ignore
    return this.tree.betweenBounds(...args)
  }

  prettyPrint(...args) {
    // @ts-ignore
    return this.tree.prettyPrint(...args)
  }

  executeOnEveryNode(fn) {
    return this.tree.executeOnEveryNode(fn)
  }
}
