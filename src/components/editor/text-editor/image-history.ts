import type { EditorView, KeyBinding } from '@codemirror/view'
import { invertedEffects, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { StateEffect, type StateEffectType, Transaction } from '@codemirror/state'
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
  fileId: number
  historyDepth: number
  redoDepth?: number
  anchor: number
  active: boolean
  items: TrackedImage[]
}

type ImageHistoryDirection = 'apply' | 'undo' | 'redo'

interface ImageHistoryOptions {
  getView: () => EditorView | undefined
  getActiveFileId: () => number
}

function invertedDirection(direction: ImageHistoryDirection): ImageHistoryDirection {
  return direction === 'apply' || direction === 'redo' ? 'undo' : 'redo'
}

function markerExtension(marker: StateEffectType<ImageHistoryDirection>) {
  return invertedEffects.of((transaction) => {
    const effects: StateEffect<ImageHistoryDirection>[] = []
    for (const effect of transaction.effects) {
      if (effect.is(marker))
        effects.push(marker.of(invertedDirection(effect.value)))
    }
    return effects
  })
}

function historyDirection(transaction: Transaction, marker: StateEffectType<ImageHistoryDirection>) {
  return transaction.effects.find(effect => effect.is(marker))?.value
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

function trackImageBatches(
  batches: Set<TrackedImageBatch>,
  activeFileId: number,
  marker: StateEffectType<ImageHistoryDirection>,
  transactions: readonly Transaction[],
) {
  for (const transaction of transactions) {
    if (transaction.changes.empty)
      continue
    const internal = transaction.annotation(Transaction.addToHistory) === false
    const direction = historyDirection(transaction, marker)
    if (!internal && direction !== 'undo' && direction !== 'redo') {
      for (const batch of batches) {
        if (batch.fileId === activeFileId && !batch.active)
          batches.delete(batch)
      }
    }
    for (const batch of batches) {
      if (batch.fileId !== activeFileId || !batch.active)
        continue
      for (const item of batch.items) {
        if (!item.valid)
          continue
        if (transaction.startState.doc.sliceString(item.from, item.to) !== item.text) {
          item.valid = false
          continue
        }
        if (!internal && direction === undefined && touchesOwnedRange(transaction, item)) {
          item.valid = false
          continue
        }
        item.from = transaction.changes.mapPos(item.from, 1)
        item.to = transaction.changes.mapPos(item.to, -1)
      }
    }
  }
}

function applyChange(
  view: EditorView,
  internalChange: ReturnType<typeof Transaction.addToHistory.of>,
  from: number,
  to: number,
  insert: string,
) {
  view.dispatch({ changes: { from, to, insert }, annotations: internalChange })
}

function settlePendingImage(
  view: EditorView,
  batches: Set<TrackedImageBatch>,
  internalChange: ReturnType<typeof Transaction.addToHistory.of>,
  pending: PendingImage,
  url?: string,
) {
  const batch = [...batches].find(candidate => candidate.items.some(item => item.pending === pending))
  const item = batch?.items.find(candidate => candidate.pending === pending)
  if (!batch || !item || !item.valid)
    return

  const redoneWithoutPlaceholder = batch.active && item.text === '' && item.result === undefined
  item.result = url ? markdownImage(url) : ''
  if (!batch.active)
    return
  if (redoneWithoutPlaceholder) {
    applyChange(view, internalChange, item.from, item.to, item.result)
    item.to = item.from + item.result.length
    item.text = item.result
    return
  }

  const source = view.state.doc.toString()
  const change = url ? findImageReplacement(source, pending, url) : findImageRemoval(source, pending)
  if (!change || change.from !== item.from || change.to !== item.to) {
    item.valid = false
    return
  }
  applyChange(view, internalChange, change.from, change.to, change.insert)
  item.from = change.from
  item.to = change.from + change.insert.length
  item.text = change.insert
}

function registerBatch(
  batches: Set<TrackedImageBatch>,
  fileId: number,
  batch: ImageBatch,
  anchor: number,
  historyDepth: number,
) {
  let offset = anchor
  batches.add({
    fileId,
    historyDepth,
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

function currentUndoBatch(batches: Set<TrackedImageBatch>, view: EditorView, fileId: number) {
  const depth = undoDepth(view.state)
  return [...batches].find(batch => batch.fileId === fileId && batch.active && batch.historyDepth === depth)
}

function cleanupUndoneBatch(
  view: EditorView,
  batch: TrackedImageBatch,
  internalChange: ReturnType<typeof Transaction.addToHistory.of>,
) {
  const changes = batch.items
    .filter(item => item.valid && item.text && view.state.doc.sliceString(item.from, item.to) === item.text)
    .map(item => ({ from: item.from, to: item.to, insert: '' }))
  const anchor = Math.min(...batch.items.map(item => item.from))
  if (changes.length > 0)
    view.dispatch({ changes, annotations: internalChange })

  batch.active = false
  batch.redoDepth = redoDepth(view.state)
  batch.anchor = anchor
  for (const item of batch.items) {
    item.from = anchor
    item.to = anchor
    item.text = ''
  }
}

function currentRedoBatch(batches: Set<TrackedImageBatch>, view: EditorView, fileId: number) {
  const depth = redoDepth(view.state)
  return [...batches].find(batch => batch.fileId === fileId && !batch.active && batch.redoDepth === depth)
}

function projectRedoneBatch(
  view: EditorView,
  batch: TrackedImageBatch,
  internalChange: ReturnType<typeof Transaction.addToHistory.of>,
) {
  const parts = batch.items.map(item => item.valid ? item.result ?? '' : '')
  const projection = parts.join('\n')
  const residual = batch.items.map(item => item.valid && item.result === undefined ? item.pending.placeholder : '').join('\n')
  const removeResidual = view.state.doc.sliceString(batch.anchor, batch.anchor + residual.length) === residual
  const from = batch.anchor
  applyChange(view, internalChange, from, from + (removeResidual ? residual.length : 0), projection)

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

function imageHistoryKeyBindings(
  options: ImageHistoryOptions,
  batches: Set<TrackedImageBatch>,
  internalChange: ReturnType<typeof Transaction.addToHistory.of>,
): readonly KeyBinding[] {
  function undoImageAware(view: EditorView) {
    const batch = currentUndoBatch(batches, view, options.getActiveFileId())
    if (!batch)
      return undo(view)
    if (!undo(view))
      return false
    cleanupUndoneBatch(view, batch, internalChange)
    return true
  }

  function redoImageAware(view: EditorView) {
    const batch = currentRedoBatch(batches, view, options.getActiveFileId())
    if (!batch)
      return redo(view)
    if (!redo(view))
      return false
    projectRedoneBatch(view, batch, internalChange)
    return true
  }

  return [
    { key: 'Mod-z', run: undoImageAware, preventDefault: true },
    { key: 'Mod-y', mac: 'Mod-Shift-z', run: redoImageAware, preventDefault: true },
    { linux: 'Ctrl-Shift-z', run: redoImageAware, preventDefault: true },
  ]
}

export function createImageHistoryController(options: ImageHistoryOptions) {
  const batches = new Set<TrackedImageBatch>()
  const internalChange = Transaction.addToHistory.of(false)
  const marker = StateEffect.define<ImageHistoryDirection>()

  return {
    extension: markerExtension(marker),
    keyBindings: imageHistoryKeyBindings(options, batches, internalChange),
    appliedEffect: () => marker.of('apply'),
    register(fileId: number, batch: ImageBatch, anchor: number) {
      const view = options.getView()
      if (view)
        registerBatch(batches, fileId, batch, anchor, undoDepth(view.state))
    },
    settle(pending: PendingImage, url?: string) {
      const view = options.getView()
      if (view)
        settlePendingImage(view, batches, internalChange, pending, url)
    },
    track(transactions: readonly Transaction[]) {
      trackImageBatches(batches, options.getActiveFileId(), marker, transactions)
    },
  }
}
