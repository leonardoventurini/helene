import { BinarySearchTree } from './bst'
import { defaultCheckValueEquality, defaultCompareKeysFunction } from './utils'

export class _AVLTree extends BinarySearchTree {
  left: any
  right: any
  parent: any
  key: any
  data: any
  unique: any
  compareKeys: any
  checkValueEquality: any

  height: any

  constructor(options) {
    super(options)

    options = options || {}

    this.left = null
    this.right = null
    this.parent = options.parent !== undefined ? options.parent : null
    // eslint-disable-next-line no-prototype-builtins
    if (options.hasOwnProperty('key')) {
      this.key = options.key
    }
    // eslint-disable-next-line no-prototype-builtins
    this.data = options.hasOwnProperty('value') ? [options.value] : []
    this.unique = options.unique || false

    this.compareKeys = options.compareKeys || defaultCompareKeysFunction
    this.checkValueEquality =
      options.checkValueEquality || defaultCheckValueEquality
  }

  checkHeightCorrect() {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return
    } // Empty tree

    if (this.left && this.left.height === undefined) {
      throw new Error('Undefined height for node ' + this.left.key)
    }
    if (this.right && this.right.height === undefined) {
      throw new Error('Undefined height for node ' + this.right.key)
    }
    if (this.height === undefined) {
      throw new Error('Undefined height for node ' + this.key)
    }

    const leftH = this.left ? this.left.height : 0
    const rightH = this.right ? this.right.height : 0

    if (this.height !== 1 + Math.max(leftH, rightH)) {
      throw new Error('Height constraint failed for node ' + this.key)
    }
    if (this.left) {
      this.left.checkHeightCorrect()
    }
    if (this.right) {
      this.right.checkHeightCorrect()
    }
  }

  balanceFactor() {
    const leftH = this.left ? this.left.height : 0,
      rightH = this.right ? this.right.height : 0
    return leftH - rightH
  }

  checkBalanceFactors() {
    if (Math.abs(this.balanceFactor()) > 1) {
      throw new Error('Tree is unbalanced at node ' + this.key)
    }

    if (this.left) {
      this.left.checkBalanceFactors()
    }
    if (this.right) {
      this.right.checkBalanceFactors()
    }
  }

  checkIsAVLT() {
    this.checkIsBST()
    this.checkHeightCorrect()
    this.checkBalanceFactors()
  }

  rightRotation() {
    const q = this,
      p = this.left

    if (!p) {
      return this
    } // No change

    const b = p.right

    // Alter tree structure
    if (q.parent) {
      p.parent = q.parent
      if (q.parent.left === q) {
        q.parent.left = p
      } else {
        q.parent.right = p
      }
    } else {
      p.parent = null
    }
    p.right = q
    q.parent = p
    q.left = b
    if (b) {
      b.parent = q
    }

    // Update heights
    const ah = p.left ? p.left.height : 0
    const bh = b ? b.height : 0
    const ch = q.right ? q.right.height : 0
    q.height = Math.max(bh, ch) + 1
    p.height = Math.max(ah, q.height) + 1

    return p
  }

  leftRotation() {
    const p = this,
      q = this.right

    if (!q) {
      return this
    } // No change

    const b = q.left

    // Alter tree structure
    if (p.parent) {
      q.parent = p.parent
      if (p.parent.left === p) {
        p.parent.left = q
      } else {
        p.parent.right = q
      }
    } else {
      q.parent = null
    }
    q.left = p
    p.parent = q
    p.right = b
    if (b) {
      b.parent = p
    }

    // Update heights
    const ah = p.left ? p.left.height : 0
    const bh = b ? b.height : 0
    const ch = q.right ? q.right.height : 0
    p.height = Math.max(ah, bh) + 1
    q.height = Math.max(ch, p.height) + 1

    return q
  }

  rightTooSmall() {
    if (this.balanceFactor() <= 1) {
      return this
    } // Right is not too small, don't change

    if (this.left.balanceFactor() < 0) {
      this.left.leftRotation()
    }

    return this.rightRotation()
  }

  leftTooSmall() {
    if (this.balanceFactor() >= -1) {
      return this
    } // Left is not too small, don't change

    if (this.right.balanceFactor() > 0) {
      this.right.rightRotation()
    }

    return this.leftRotation()
  }

  rebalanceAlongPath(path) {
    let newRoot = this,
      rotated,
      i

    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      delete this.height
      return this
    } // Empty tree

    // Rebalance the tree and update all heights
    for (i = path.length - 1; i >= 0; i -= 1) {
      path[i].height =
        1 +
        Math.max(
          path[i].left ? path[i].left.height : 0,
          path[i].right ? path[i].right.height : 0,
        )

      if (path[i].balanceFactor() > 1) {
        rotated = path[i].rightTooSmall()
        if (i === 0) {
          newRoot = rotated
        }
      }

      if (path[i].balanceFactor() < -1) {
        rotated = path[i].leftTooSmall()
        if (i === 0) {
          newRoot = rotated
        }
      }
    }

    return newRoot
  }

  insert(key, value) {
    const insertPath = []
    let currentNode = this
    // Empty tree, insert as root
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      this.key = key
      this.data.push(value)
      this.height = 1
      return this
    }

    // Insert new leaf at the right place
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // Same key: no change in the tree structure
      if (currentNode.compareKeys(currentNode.key, key) === 0) {
        if (currentNode.unique) {
          const err = new Error(
            "Can't insert key " + key + ', it violates the unique constraint',
          ) as any
          err.key = key
          err.errorType = 'uniqueViolated'
          throw err
        } else {
          currentNode.data.push(value)
        }
        return this
      }

      insertPath.push(currentNode)

      if (currentNode.compareKeys(key, currentNode.key) < 0) {
        if (!currentNode.left) {
          insertPath.push(
            currentNode.createLeftChild({ key: key, value: value }),
          )
          break
        } else {
          currentNode = currentNode.left
        }
      } else {
        if (!currentNode.right) {
          insertPath.push(
            currentNode.createRightChild({ key: key, value: value }),
          )
          break
        } else {
          currentNode = currentNode.right
        }
      }
    }

    return this.rebalanceAlongPath(insertPath)
  }

  delete(key, value) {
    const newData = [],
      self = this,
      deletePath = []

    let currentNode = this

    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return this
    } // Empty tree

    // Either no match is found and the function will return from within the loop
    // Or a match is found and deletePath will contain the path from the root to the node to delete after the loop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (currentNode.compareKeys(key, currentNode.key) === 0) {
        break
      }

      deletePath.push(currentNode)

      if (currentNode.compareKeys(key, currentNode.key) < 0) {
        if (currentNode.left) {
          currentNode = currentNode.left
        } else {
          return this // Key not found, no modification
        }
      } else {
        // currentNode.compareKeys(key, currentNode.key) is > 0
        if (currentNode.right) {
          currentNode = currentNode.right
        } else {
          return this // Key not found, no modification
        }
      }
    }

    // Delete only a value (no tree modification)
    if (currentNode.data.length > 1 && value !== undefined) {
      currentNode.data.forEach(function (d) {
        if (!currentNode.checkValueEquality(d, value)) {
          newData.push(d)
        }
      })
      currentNode.data = newData
      return this
    }

    // Delete a whole node

    // Leaf
    if (!currentNode.left && !currentNode.right) {
      if (currentNode === this) {
        // This leaf is also the root
        delete currentNode.key
        currentNode.data = []
        delete currentNode.height
        return this
      } else {
        if (currentNode.parent.left === currentNode) {
          currentNode.parent.left = null
        } else {
          currentNode.parent.right = null
        }
        return this.rebalanceAlongPath(deletePath)
      }
    }

    let replaceWith

    // Node with only one child
    if (!currentNode.left || !currentNode.right) {
      replaceWith = currentNode.left ? currentNode.left : currentNode.right

      if (currentNode === this) {
        // This node is also the root
        replaceWith.parent = null
        return replaceWith // height of replaceWith is necessarily 1 because the tree was balanced before deletion
      } else {
        if (currentNode.parent.left === currentNode) {
          currentNode.parent.left = replaceWith
          replaceWith.parent = currentNode.parent
        } else {
          currentNode.parent.right = replaceWith
          replaceWith.parent = currentNode.parent
        }

        return this.rebalanceAlongPath(deletePath)
      }
    }

    // Node with two children
    // Use the in-order predecessor (no need to randomize since we actively rebalance)
    deletePath.push(currentNode)
    replaceWith = currentNode.left

    // Special case: the in-order predecessor is right below the node to delete
    if (!replaceWith.right) {
      currentNode.key = replaceWith.key
      currentNode.data = replaceWith.data
      currentNode.left = replaceWith.left
      if (replaceWith.left) {
        replaceWith.left.parent = currentNode
      }
      return this.rebalanceAlongPath(deletePath)
    }

    // After this loop, replaceWith is the right-most leaf in the left subtree
    // and deletePath the path from the root (inclusive) to replaceWith (exclusive)
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (replaceWith.right) {
        deletePath.push(replaceWith)
        replaceWith = replaceWith.right
      } else {
        break
      }
    }

    currentNode.key = replaceWith.key
    currentNode.data = replaceWith.data

    replaceWith.parent.right = replaceWith.left
    if (replaceWith.left) {
      replaceWith.left.parent = replaceWith.parent
    }

    return this.rebalanceAlongPath(deletePath)
  }
}

export class AVLTree {
  tree: _AVLTree

  constructor(options?) {
    this.tree = new _AVLTree(options)
  }
  checkIsAVLT() {
    this.tree.checkIsAVLT()
  }

  insert(key, value?) {
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
