type ArgsType<T> = T extends (...args: infer U) => any ? U : never
type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never

export interface TryCatchResult<T> {
    readonly val: T
    readonly err: any
}

const result = {} as any
let target = null as any

function reportError(e: any) {
    setTimeout(() => {
        throw e
    }, 0)
}

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
): (...args: ArgsType<T>) => TryCatchResult<ReturnType<T>> {
    target = fn
    return tryCatcher as any
}
