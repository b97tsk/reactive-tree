import { reportError } from './reportError'

export interface TryCatchResult<T> {
    readonly val: T
    readonly err: any
}

const result = {} as any
let target = null as any

function tryCatcher(this: any) {
    try {
        result.val = target.apply(this, arguments)
        result.err = null
    } catch (e) {
        result.val = null
        result.err = e
        reportError(e)
    }
    return result
}

export function tryCatch<T extends (...args: any[]) => any>(
    fn: T
): (...args: Parameters<T>) => TryCatchResult<ReturnType<T>> {
    target = fn
    return tryCatcher as any
}
