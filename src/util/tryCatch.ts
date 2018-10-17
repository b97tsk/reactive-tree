type ArgsType<T> = T extends (...args: infer U) => any ? U : never
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never

export interface TryCatchResult<T> {
    readonly val: T
    readonly err: any
}

const errors = [] as any[]
const result = {} as any
let target = null as any
let refCount = 0

function tryCatcher(this: any) {
    const rc = refCount
    try {
        result.val = target.apply(this, arguments)
        result.err = null
    } catch (e) {
        errors.push(e)
        result.val = null
        result.err = e
    }
    refCount = rc
    return result
}

export function tryCatch<T extends (...args: any[]) => any>(
    fn: T
): (...args: ArgsType<T>) => TryCatchResult<ReturnType<T>> {
    target = fn
    return tryCatcher as any
}

export function tryCatchBegin() {
    if (refCount++ > 0) {
        return
    }
    errors.length = 0
}

export function tryCatchThrow(e: any) {
    errors.push(e)
}

export function tryCatchFinally(name: string) {
    if (--refCount > 0 || errors.length === 0) {
        return
    }
    if (errors.length === 1) {
        throw errors[0]
    }
    const re = /\n/g
    throw new Error(
        `${errors.length} errors occurred during ${name}:\n  ${errors
            .map((err, i) => `${i + 1}) ${String(err).replace(re, '\n  ')}`)
            .join('\n  ')}`
    )
}
