import {
  append,
  defaultCheckValueEquality,
  defaultCompareKeysFunction,
} from './utils'

export class BinarySearchTree {
  // We use `hasOwnProperty` to check if a key has been set on the tree, so we cannot declare it beforehand
  [x: string]: any
  left: BinarySearchTree
  right: BinarySearchTree
  parent: any
  data: any
  unique: any
  compareKeys: any
  checkValueEquality: any

  constructor(options?) {
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

  getMaxKeyDescendant() {
    if (this.right) {
      return this.right.getMaxKeyDescendant()
    } else {
      return this
    }
  }

  getMaxKey() {
    return this.getMaxKeyDescendant().key
  }

  getMinKeyDescendant() {
    if (this.left) {
      return this.left.getMinKeyDescendant()
    } else {
      return this
    }
  }

  getMinKey() {
    return this.getMinKeyDescendant().key
  }

  checkAllNodesFullfillCondition(test) {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return
    }

    test(this.key, this.data)
    if (this.left) {
      this.left.checkAllNodesFullfillCondition(test)
    }
    if (this.right) {
      this.right.checkAllNodesFullfillCondition(test)
    }
  }

  checkNodeOrdering() {
    const self = this

    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return
    }

    if (this.left) {
      this.left.checkAllNodesFullfillCondition(function (k) {
        if (self.compareKeys(k, self.key) >= 0) {
          throw new Error(
            'Tree with root ' + self.key + ' is not a binary search tree',
          )
        }
      })
      this.left.checkNodeOrdering()
    }

    if (this.right) {
      this.right.checkAllNodesFullfillCondition(function (k) {
        if (self.compareKeys(k, self.key) <= 0) {
          throw new Error(
            'Tree with root ' + self.key + ' is not a binary search tree',
          )
        }
      })
      this.right.checkNodeOrdering()
    }
  }

  checkInternalPointers() {
    if (this.left) {
      if (this.left.parent !== this) {
        throw new Error('Parent pointer broken for key ' + this.key)
      }
      this.left.checkInternalPointers()
    }

    if (this.right) {
      if (this.right.parent !== this) {
        throw new Error('Parent pointer broken for key ' + this.key)
      }
      this.right.checkInternalPointers()
    }
  }

  checkIsBST() {
    this.checkNodeOrdering()
    this.checkInternalPointers()
    if (this.parent) {
      throw new Error("The root shouldn't have a parent")
    }
  }

  getNumberOfKeys() {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return 0
    }

    let res = 1

    if (this.left) {
      res += this.left.getNumberOfKeys()
    }
    if (this.right) {
      res += this.right.getNumberOfKeys()
    }

    return res
  }

  createSimilar(options) {
    options = options || {}
    options.unique = this.unique
    options.compareKeys = this.compareKeys
    options.checkValueEquality = this.checkValueEquality

    // @ts-ignore
    return new this.constructor(options)
  }

  createLeftChild(options) {
    const leftChild = this.createSimilar(options)
    leftChild.parent = this
    this.left = leftChild

    return leftChild
  }

  createRightChild(options: { key: any; value: any }) {
    const rightChild = this.createSimilar(options)
    rightChild.parent = this

    this.right = rightChild

    return rightChild
  }

  insert(key: string | number, value?: any) {
    // Empty tree, insert as root
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      this.key = key
      this.data.push(value)
      return
    }

    // Same key as root
    if (this.compareKeys(this.key, key) === 0) {
      if (this.unique) {
        const err = new Error(
          "Can't insert key " + key + ', it violates the unique constraint',
        ) as any
        err.key = key
        err.errorType = 'uniqueViolated'
        throw err
      } else {
        this.data.push(value)
      }
      return
    }

    if (this.compareKeys(key, this.key) < 0) {
      // Insert in left subtree
      if (this.left) {
        this.left.insert(key, value)
      } else {
        this.createLeftChild({ key: key, value: value })
      }
    } else {
      // Insert in right subtree
      if (this.right) {
        this.right.insert(key, value)
      } else {
        this.createRightChild({ key: key, value: value })
      }
    }
  }

  search(key) {
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return []
    }

    if (this.compareKeys(this.key, key) === 0) {
      return this.data
    }

    if (this.compareKeys(key, this.key) < 0) {
      if (this.left) {
        return this.left.search(key)
      } else {
        return []
      }
    } else {
      if (this.right) {
        return this.right.search(key)
      } else {
        return []
      }
    }
  }

  getLowerBoundMatcher(query) {
    const self = this

    // eslint-disable-next-line no-prototype-builtins
    if (!query.hasOwnProperty('$gt') && !query.hasOwnProperty('$gte')) {
      return function () {
        return true
      }
    }

    // eslint-disable-next-line no-prototype-builtins
    if (query.hasOwnProperty('$gt') && query.hasOwnProperty('$gte')) {
      if (self.compareKeys(query.$gte, query.$gt) === 0) {
        return function (key) {
          return self.compareKeys(key, query.$gt) > 0
        }
      }

      if (self.compareKeys(query.$gte, query.$gt) > 0) {
        return function (key) {
          return self.compareKeys(key, query.$gte) >= 0
        }
      } else {
        return function (key) {
          return self.compareKeys(key, query.$gt) > 0
        }
      }
    }

    // eslint-disable-next-line no-prototype-builtins
    if (query.hasOwnProperty('$gt')) {
      return function (key) {
        return self.compareKeys(key, query.$gt) > 0
      }
    } else {
      return function (key) {
        return self.compareKeys(key, query.$gte) >= 0
      }
    }
  }

  getUpperBoundMatcher(query) {
    const self = this

    // No lower bound
    // eslint-disable-next-line no-prototype-builtins
    if (!query.hasOwnProperty('$lt') && !query.hasOwnProperty('$lte')) {
      return function () {
        return true
      }
    }

    // eslint-disable-next-line no-prototype-builtins
    if (query.hasOwnProperty('$lt') && query.hasOwnProperty('$lte')) {
      if (self.compareKeys(query.$lte, query.$lt) === 0) {
        return function (key) {
          return self.compareKeys(key, query.$lt) < 0
        }
      }

      if (self.compareKeys(query.$lte, query.$lt) < 0) {
        return function (key) {
          return self.compareKeys(key, query.$lte) <= 0
        }
      } else {
        return function (key) {
          return self.compareKeys(key, query.$lt) < 0
        }
      }
    }

    // eslint-disable-next-line no-prototype-builtins
    if (query.hasOwnProperty('$lt')) {
      return function (key) {
        return self.compareKeys(key, query.$lt) < 0
      }
    } else {
      return function (key) {
        return self.compareKeys(key, query.$lte) <= 0
      }
    }
  }

  betweenBounds(query, lbm?, ubm?) {
    const res = []
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return []
    } // Empty tree

    lbm = lbm || this.getLowerBoundMatcher(query)
    ubm = ubm || this.getUpperBoundMatcher(query)

    if (lbm(this.key) && this.left) {
      append(res, this.left.betweenBounds(query, lbm, ubm))
    }
    if (lbm(this.key) && ubm(this.key)) {
      append(res, this.data)
    }
    if (ubm(this.key) && this.right) {
      append(res, this.right.betweenBounds(query, lbm, ubm))
    }

    return res
  }

  deleteIfLeaf() {
    if (this.left || this.right) {
      return false
    }

    // The leaf is itself a root
    if (!this.parent) {
      delete this.key
      this.data = []
      return true
    }

    if (this.parent.left === this) {
      this.parent.left = null
    } else {
      this.parent.right = null
    }

    return true
  }

  deleteIfOnlyOneChild() {
    let child

    if (this.left && !this.right) {
      child = this.left
    }
    if (!this.left && this.right) {
      child = this.right
    }
    if (!child) {
      return false
    }

    // Root
    if (!this.parent) {
      this.key = child.key
      this.data = child.data

      this.left = null
      if (child.left) {
        this.left = child.left
        child.left.parent = this
      }

      this.right = null
      if (child.right) {
        this.right = child.right
        child.right.parent = this
      }

      return true
    }

    if (this.parent.left === this) {
      this.parent.left = child
      child.parent = this.parent
    } else {
      this.parent.right = child
      child.parent = this.parent
    }

    return true
  }

  delete(key, value?) {
    const newData = [],
      self = this
    // eslint-disable-next-line no-prototype-builtins
    if (!this.hasOwnProperty('key')) {
      return
    }

    if (this.compareKeys(key, this.key) < 0) {
      if (this.left) {
        this.left.delete(key, value)
      }
      return
    }

    if (this.compareKeys(key, this.key) > 0) {
      if (this.right) {
        this.right.delete(key, value)
      }
      return
    }

    // @ts-ignore
    if (!this.compareKeys(key, this.key) === 0) {
      return
    }

    // Delete only a value
    if (this.data.length > 1 && value !== undefined) {
      this.data.forEach(function (d) {
        if (!self.checkValueEquality(d, value)) {
          newData.push(d)
        }
      })
      self.data = newData
      return
    }

    // Delete the whole node
    if (this.deleteIfLeaf()) {
      return
    }
    if (this.deleteIfOnlyOneChild()) {
      return
    }

    let replaceWith

    // We are in the case where the node to delete has two children
    if (Math.random() >= 0.5) {
      // Randomize replacement to avoid unbalancing the tree too much
      // Use the in-order predecessor
      replaceWith = this.left.getMaxKeyDescendant()

      this.key = replaceWith.key
      this.data = replaceWith.data

      if (this === replaceWith.parent) {
        // Special case
        this.left = replaceWith.left
        if (replaceWith.left) {
          replaceWith.left.parent = replaceWith.parent
        }
      } else {
        replaceWith.parent.right = replaceWith.left
        if (replaceWith.left) {
          replaceWith.left.parent = replaceWith.parent
        }
      }
    } else {
      // Use the in-order successor
      replaceWith = this.right.getMinKeyDescendant()

      this.key = replaceWith.key
      this.data = replaceWith.data

      if (this === replaceWith.parent) {
        // Special case
        this.right = replaceWith.right
        if (replaceWith.right) {
          replaceWith.right.parent = replaceWith.parent
        }
      } else {
        replaceWith.parent.left = replaceWith.right
        if (replaceWith.right) {
          replaceWith.right.parent = replaceWith.parent
        }
      }
    }
  }

  executeOnEveryNode(fn) {
    if (this.left) {
      this.left.executeOnEveryNode(fn)
    }
    fn(this)
    if (this.right) {
      this.right.executeOnEveryNode(fn)
    }
  }

  prettyPrint(printData, spacing) {
    spacing = spacing || ''

    console.log(spacing + '* ' + this.key)
    if (printData) {
      console.log(spacing + '* ' + this.data)
    }

    if (!this.left && !this.right) {
      return
    }

    if (this.left) {
      this.left.prettyPrint(printData, spacing + '  ')
    } else {
      console.log(spacing + '  *')
    }
    if (this.right) {
      this.right.prettyPrint(printData, spacing + '  ')
    } else {
      console.log(spacing + '  *')
    }
  }
}
