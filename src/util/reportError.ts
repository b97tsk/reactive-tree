export function reportError(e: any) {
    setTimeout(() => {
        throw e
    }, 0)
}
