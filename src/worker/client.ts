import type { Answers, ReadyData, Request, RequestOptions, WorkerMessage } from './protocol.ts'

/** The page's side of the engine worker. Requests are answered in the order they are made. */
export interface EngineClient {
  /** Resolves when the data is loaded; rejects if it cannot be. */
  ready: Promise<ReadyData>
  ask<K extends keyof Answers>(kind: K, text: string, options?: RequestOptions): Promise<Answers[K]>
}

export function createEngineClient(): EngineClient {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, { resolve(answer: never): void; reject(error: Error): void }>()
  let nextId = 0
  let resolve!: (data: ReadyData) => void
  let reject!: (error: Error) => void
  const ready = new Promise<ReadyData>((res, rej) => {
    resolve = res
    reject = rej
  })

  worker.onmessage = ({ data: message }: MessageEvent<WorkerMessage>) => {
    if (message.kind === 'ready') resolve(message.data)
    else if (message.kind === 'failed') reject(new Error(message.message))
    else {
      const request = pending.get(message.id)!
      pending.delete(message.id)
      if (message.kind === 'answer') request.resolve(message.answer as never)
      else request.reject(new Error(message.message))
    }
  }
  worker.onerror = (event) => reject(new Error(event.message))

  function ask<K extends keyof Answers>(kind: K, text: string, options: RequestOptions = {}): Promise<Answers[K]> {
    const request: Request = { ...options, id: nextId++, kind, text }
    return new Promise((resolveAnswer, rejectAnswer) => {
      pending.set(request.id, { resolve: resolveAnswer, reject: rejectAnswer })
      worker.postMessage(request)
    })
  }
  return { ready, ask }
}
