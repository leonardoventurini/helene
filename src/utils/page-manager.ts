import { EventEmitter2 } from 'eventemitter2'
import { first, isEmpty, isNaN, last } from 'lodash'
import { Client } from '../client'

export const PLACEHOLDER = 'PLACEHOLDER'

export class PageManager extends EventEmitter2 {
  client: Client
  channel: string
  method: string
  event: string
  totalCount: number
  pages = []
  terms: Record<string, any>
  step: number
  fullStepSimulation = []
  totalPages = 0
  sort = {}

  constructor({ client, channel, method, event, terms = {}, step = 100 }) {
    super()

    this.client = client
    this.channel = channel
    this.method = method
    this.event = event
    this.totalPages = this.size
    this.terms = terms
    this.step = step

    this.fullStepSimulation = this.generateSimulation(this.step)

    this.init().catch(console.error)

    // @ts-ignore
    window.pageManager = this
  }

  async init() {
    this.totalCount = await this.getTotalCount()
    this.pages = this.getPagesObject()

    if (this.pages?.[0]) {
      await this.loadPage(this.pages[0])
    }

    this.emit('update:data')
  }

  async getTotalCount() {
    return this.fetch({ count: true })
  }

  async fetch(terms) {
    return this.client.call(this.method, {
      terms: this.terms,
      sort: this.sort,
      ...terms,
    })
  }

  generateSimulation(size = this.step) {
    return Array.from(Array(size).keys()).map(() => PLACEHOLDER)
  }

  getPagesObject() {
    this.totalPages = Math.ceil(this.totalCount / this.step)

    if (isNaN(this.totalPages)) return []

    return [...new Array(this.totalPages).fill(null).keys()].map(key => {
      const startIndex = key * this.step
      const stopIndex = this.step * (key + 1) - 1

      return {
        index: key,
        startIndex,
        stopIndex,
        skip: startIndex,
        limit: stopIndex - startIndex + 1,
      }
    })
  }

  getIndexRange(startIndex, stopIndex) {
    const rangeStart = this.pages.findIndex(p =>
      this.isBetween(startIndex, p.startIndex, p.stopIndex),
    )
    const rangeStop = this.pages.findIndex(p =>
      this.isBetween(stopIndex, p.startIndex, p.stopIndex),
    )

    return { rangeStart, rangeStop }
  }

  getLoadedRange() {
    const loadedPages = this.pages.filter(f => f.loaded)

    if (isEmpty(loadedPages))
      return { rangeStart: Infinity, rangeStop: -Infinity }

    const rangeStart = first(loadedPages).index
    const rangeStop = last(loadedPages).index

    return { rangeStart, rangeStop }
  }

  isBetween(value, start, stop) {
    return value >= start && value <= stop
  }

  getNewRange(startIndex, stopIndex) {
    const { rangeStart, rangeStop } = this.getIndexRange(startIndex, stopIndex)

    return this.pages.filter(p =>
      this.isBetween(p.index, rangeStart, rangeStop),
    )
  }

  setSort(sort) {
    this.sort = sort
    return this
  }

  getSimulation({ index }) {
    if (index === this.totalPages - 1) {
      return this.generateSimulation(this.lastPageStep)
    }

    return this.fullStepSimulation
  }

  getExpectedCount(index) {
    return index === this.totalPages - 1 ? this.lastPageStep : this.step
  }

  getPartialSimulation({ data, expectedCount }) {
    const partialSimulation = this.generateSimulation(
      expectedCount - data.length,
    )

    return data.concat(partialSimulation)
  }

  async getDocuments() {
    return (
      await Promise.all(
        this.pages.map(async ({ index, loaded, data }) => {
          if (!loaded || !data?.length) {
            return this.getSimulation({ index })
          }

          const expectedCount = this.getExpectedCount(index)

          if (data?.length < expectedCount) {
            return this.getPartialSimulation({ data, expectedCount })
          }

          return data
        }),
      )
    ).flatMap(data => data)
  }

  async loadPage(page) {
    const { limit, skip } = page

    if (limit === 0) return

    page.loaded = true

    page.data = await this.fetch({
      skip,
      limit,
    })
  }

  /**
   * @todo Allow loading of disconnected regions based on last requested range,
   *   keep other documents in memory.
   */
  async loadIncrementally(startIndex, stopIndex) {
    const pages = this.getNewRange(startIndex, stopIndex)

    for (const page of pages) {
      await this.loadPage(page)
    }

    this.emit('update:data')
  }

  async reload() {
    this.totalCount = await this.getTotalCount()

    const loadedPages = []

    this.pages.forEach((page, index) => {
      if (page.loaded) loadedPages.push(index)
    })

    this.pages = this.getPagesObject()

    await Promise.all(
      loadedPages.map(async index => {
        await this.loadPage(this.pages[index])
      }),
    )
  }

  clear() {
    this.pages.forEach(page => {
      page.loaded = false
      page.data = []
    })
  }

  get size() {
    return this.pages.length
  }

  get lastPageStep() {
    return this.totalCount % this.step
  }
}
