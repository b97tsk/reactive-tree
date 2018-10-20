import { concat, EMPTY, NEVER, Observable } from 'rxjs'
import { catchError } from 'rxjs/operators'
import { reportError } from './reportError'

function onCaughtError(e: any) {
    reportError(e)
    return EMPTY
}

export function endless<T>(source: Observable<T>) {
    return concat(source.pipe(catchError(onCaughtError)), NEVER)
}
