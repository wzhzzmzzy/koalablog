import type { EditorView, KeyBinding } from '@codemirror/view'
import { invertedEffects, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { StateEffect, Transaction } from '@codemirror/state'
import { findImageRemoval, findImageReplacement, type ImageBatch, markdownImage, type PendingImage } from './images'

interface TrackedImage {
  pending: PendingImage
  from: number
  to: number
  text: string
  valid: boolean
  result?: string
}

interface TrackedImageBatch {
  id: string
  fileId: number
  historyDepth: number
  redoDepth?: number
  anchor: number
  active: boolean
  items: TrackedImage[]
}

interface ImageHistoryMarker {
  batchId: string
  direction: 'apply' | 'undo' | 'redo'
}

interface ImageHistoryOptions {
  getView: () => EditorView | undefined
  getActiveFileId: () => number
}

export function createImageHistoryController(options: ImageHistoryOptions) {
  const batches = new Map<string, TrackedImageBatch>()
  const internalChange = Transaction.addToHistory.of(false)
  const marker = StateEffect.define<ImageHistoryMarker>()
  const extension = invertedEffects.of((transaction) => {
    const effects: StateEffect<ImageHistoryMarker>[] = []
    for (const effect of transaction.effects) {
      if (!effect.is(marker))
        continue
      const direction = effect.value.direction === 'apply' || effect.value.direction === 'redo'
        ? 'undo'
        : 'redo'
      effects.push(marker.of({ batchId: effect.value.batchId, direction }))
    }
    return effects
  })

  function isHistoryTransaction(transaction: Transaction) {
    return transaction.effects.some(effect => effect.is(marker))
  }

  function touchesOwnedRange(transaction: Transaction, item: TrackedImage) {
    let touched = false
    transaction.changes.iterChangedRanges((from, to) => {
      if (from < item.to && to > item.from)
        touched = true
      else if (from === to && from > item.from && from < item.to)
        touched = true
    })
    return touched
  }

  function track(transactions: readonly Transaction[]) {
    const activeFileId = options.getActiveFileId()
    for (const transaction of transactions) {
      if (transaction.changes.empty)
        continue
      const internal = transaction.annotation(Transaction.addToHistory) === false
      const history = isHistoryTransaction(transaction)
      for (const batch of batches.values()) {
        if (batch.fileId !== activeFileId || !batch.active)
          continue
        for (const item of batch.items) {
          if (!item.valid)
            continue
          if (transaction.startState.doc.sliceString(item.from, item.to) !== item.text) {
            item.valid = false
            continue
          }
          if (!internal && !history && touchesOwnedRange(transaction, item)) {
            item.valid = false
            continue
          }
          item.from = transaction.changes.mapPos(item.from, 1)
          item.to = transaction.changes.mapPos(item.to, -1)
        }
      }
    }
  }

  function applyChange(view: EditorView, from: number, to: number, insert: string) {
    view.dispatch({
      changes: { from, to, insert },
      annotations: internalChange,
    })
  }

  function settle(pending: PendingImage, url?: string) {
    const view = options.getView()
    if (!view)
      return
    const batch = [...batches.values()].find(candidate => candidate.items.some(item => item.pending === pending))
    const item = batch?.items.find(candidate => candidate.pending === pending)
    if (!batch || !item || !item.valid)
      return

    const redoneWithoutPlaceholder = batch.active && item.text === '' && item.result === undefined
    item.result = url ? markdownImage(url) : ''
    if (!batch.active)
      return
    if (redoneWithoutPlaceholder) {
      applyChange(view, item.from, item.to, item.result)
      item.to = item.from + item.result.length
      item.text = item.result
      return
    }
    const source = view.state.doc.toString()
    const change = url
      ? findImageReplacement(source, pending, url)
      : findImageRemoval(source, pending)
    if (!change || change.from !== item.from || change.to !== item.to) {
      item.valid = false
      return
    }

    applyChange(view, change.from, change.to, change.insert)
    item.from = change.from
    item.to = change.from + change.insert.length
    item.text = change.insert
  }

  function currentUndoBatch(view: EditorView) {
    const depth = undoDepth(view.state)
    return [...batches.values()].find(batch => (
      batch.fileId === options.getActiveFileId()
      && batch.active
      && batch.historyDepth === depth
    ))
  }

  function cleanupUndoneBatch(view: EditorView, batch: TrackedImageBatch) {
    const changes = batch.items
      .filter(item => item.valid && item.text && view.state.doc.sliceString(item.from, item.to) === item.text)
      .map(item => ({ from: item.from, to: item.to, insert: '' }))
    const anchor = Math.min(...batch.items.map(item => item.from))
    if (changes.length > 0) {
      view.dispatch({ changes, annotations: internalChange })
    }

    batch.active = false
    batch.redoDepth = redoDepth(view.state)
    batch.anchor = anchor
    for (const item of batch.items) {
      item.from = anchor
      item.to = anchor
      item.text = ''
    }
  }

  function undoImageAware(view: EditorView) {
    const batch = currentUndoBatch(view)
    if (!batch)
      return undo(view)
    if (!undo(view))
      return false
    cleanupUndoneBatch(view, batch)
    return true
  }

  function currentRedoBatch(view: EditorView) {
    const depth = redoDepth(view.state)
    return [...batches.values()].find(batch => (
      batch.fileId === options.getActiveFileId()
      && !batch.active
      && batch.redoDepth === depth
    ))
  }

  function projectRedoneBatch(view: EditorView, batch: TrackedImageBatch) {
    const parts = batch.items.map(item => item.valid ? item.result ?? '' : '')
    const projection = parts.join('\n')
    const residual = batch.items
      .map(item => item.valid && item.result === undefined ? item.pending.placeholder : '')
      .join('\n')
    const removeResidual = view.state.doc.sliceString(
      batch.anchor,
      batch.anchor + residual.length,
    ) === residual
    const from = batch.anchor
    const to = from + (removeResidual ? residual.length : 0)
    applyChange(view, from, to, projection)

    let offset = from
    for (let index = 0; index < batch.items.length; index++) {
      const item = batch.items[index]
      item.from = offset
      item.to = offset + parts[index].length
      item.text = parts[index]
      offset = item.to + 1
    }
    batch.active = true
    batch.redoDepth = undefined
  }

  function redoImageAware(view: EditorView) {
    const batch = currentRedoBatch(view)
    if (!batch)
      return redo(view)
    if (!redo(view))
      return false
    projectRedoneBatch(view, batch)
    return true
  }

  const keyBindings: readonly KeyBinding[] = [
    { key: 'Mod-z', run: undoImageAware, preventDefault: true },
    { key: 'Mod-y', mac: 'Mod-Shift-z', run: redoImageAware, preventDefault: true },
    { linux: 'Ctrl-Shift-z', run: redoImageAware, preventDefault: true },
  ]

  function batchId(batch: ImageBatch) {
    return batch.items[0].placeholder
  }

  function appliedEffect(id: string) {
    return marker.of({ batchId: id, direction: 'apply' })
  }

  function register(fileId: number, batch: ImageBatch, anchor: number) {
    const view = options.getView()
    if (!view)
      return
    const id = batchId(batch)
    let offset = anchor
    batches.set(id, {
      id,
      fileId,
      historyDepth: undoDepth(view.state),
      active: true,
      anchor,
      items: batch.items.map((pending) => {
        const item = {
          pending,
          from: offset,
          to: offset + pending.placeholder.length,
          text: pending.placeholder,
          valid: true,
        }
        offset = item.to + 1
        return item
      }),
    })
  }

  return {
    extension,
    keyBindings,
    appliedEffect,
    batchId,
    register,
    settle,
    track,
  }
}
