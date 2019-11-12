import {
    from,
    merge,
    pipe,
    Observable,
    ObservableInput,
    Subject,
    Subscription,
    TeardownLogic,
} from 'rxjs'

import {
    distinctUntilChanged,
    mapTo,
    multicast,
    refCount,
} from 'rxjs/operators'

import { binarySearch } from './util/binarySearch'
import { tryCatch } from './util/tryCatch'

export interface Signal {
    readonly name?: string | symbol
    readonly identity: number
    readonly observable: Observable<Signal>
}

interface Connector {
    connect(signal: Signal): void
    clean?(): void
    dispose?(): void
}

function typeIsTwig(x: Connector): x is Twig<unknown> {
    return typeof x.clean === 'function'
}

function typeIsBranch(x: Connector): x is Branch {
    return typeof x.dispose === 'function'
}

class SignalItem implements Signal {
    discarded?: boolean

    constructor(public signal: Signal) {}

    get identity() {
        return this.signal.identity
    }
    get observable() {
        return this.signal.observable
    }
}

type SignalList = SignalItem[]

export function createSignal<T>(source: ObservableInput<T>): Signal {
    const signalID = generateSignalID()
    let obs: Observable<Signal> | undefined
    return {
        get identity() {
            return signalID
        },
        get observable() {
            return obs || (obs = from(source).pipe(mapTo(this)))
        },
    }
}

export function connectSignal(signal: Signal) {
    const { length } = connectors
    length === 0 || connectors[length - 1].connect(signal)
}

export function collectSignals(cb: () => void) {
    const signals = [] as Signal[]
    connectors.push({
        connect(signal: Signal) {
            signals.push(signal)
        },
    })
    try {
        cb()
    } finally {
        connectors.pop()
    }
    return signals
}

export class Signal {
    static create = createSignal
    static connect = connectSignal
    static collect = collectSignals
}

export function createLeaf<T>(value: T): Leaf<T> {
    return new Leaf(value)
}

export function defineLeaf<T, K extends keyof T>(
    target: T,
    propertyKey: K
): Leaf<T[K]>
export function defineLeaf<T>(
    target: object,
    propertyKey: string | symbol,
    value: T
): Leaf<T>
export function defineLeaf<T>(
    target: object,
    propertyKey: string | symbol,
    value?: T
): Leaf<T> {
    if (arguments.length < 3) {
        const leaf = new Leaf((target as any)[propertyKey])
        leaf.name = propertyKey
        Object.defineProperty(target, propertyKey, {
            get: () => leaf.read(),
            set: value => leaf.write(value),
        })
        return leaf
    }
    const leaf = new Leaf(value as T)
    leaf.name = propertyKey
    Object.defineProperty(target, propertyKey, {
        get: () => leaf.read(),
        set: value => leaf.write(value),
        enumerable: true,
        configurable: true,
    })
    return leaf
}

export class Leaf<T> implements Signal {
    static defaultSelector = distinctUntilChanged()
    static create = createLeaf
    static define = defineLeaf

    name?: string | symbol
    readonly identity = generateSignalID()

    get observable(): Observable<Signal> {
        const subject = this._subject
        if (subject && subject.isStopped) {
            this._subject = undefined
            this._observable = undefined
        }
        return (
            this._observable ||
            (this._observable = this.subject().pipe(
                this.selector || Leaf.defaultSelector,
                mapTo(this)
            ))
        )
    }

    value: T
    selector?: <R>(source: Observable<T>) => Observable<R>

    /** @internal */ _subject?: Subject<T>
    /** @internal */ _observable?: Observable<Signal>
    /** @internal */ _subscription?: Subscription
    /** @internal */ _subscriptionMany?: Subscription

    /** @internal */
    constructor(value: T) {
        this.value = value
    }

    read() {
        connectSignal(this)
        return this.value
    }
    write(value: T) {
        this.unsubscribe()
        const subject = this._subject
        subject ? subject.next(value) : (this.value = value)
    }
    subject() {
        let subject = this._subject
        if (subject === undefined || subject.isStopped) {
            subject = this._subject = new Subject()
            subject.subscribe(value => {
                this.value = value
            })
            this._observable && (this._observable = undefined)
        }
        return subject
    }
    subscribe(source: ObservableInput<T>) {
        const subscription = from(source).subscribe(value => {
            const subject = this._subject
            subject ? subject.next(value) : (this.value = value)
        })
        const single = this._subscription
        if (single === undefined) {
            return (this._subscription = subscription)
        }
        let subscriptionMany = this._subscriptionMany
        if (subscriptionMany === undefined) {
            if (single.closed) {
                return (this._subscription = subscription)
            }
            subscriptionMany = this._subscriptionMany = new Subscription()
            subscriptionMany.add(single)
        }
        return subscriptionMany.add(subscription)
    }
    unsubscribe() {
        const subscriptionMany = this._subscriptionMany
        if (subscriptionMany) {
            this._subscription = subscriptionMany
            this._subscriptionMany = undefined
        }
        return unsubscribeObject(this)
    }
}

export function createTwig<T>(handler: () => T): Twig<T> {
    return new Twig(handler)
}

export function defineTwig<T>(
    target: object,
    propertyKey: string | symbol,
    handler: () => T
): Twig<T> {
    const twig = new Twig(handler)
    twig.name = propertyKey
    Object.defineProperty(target, propertyKey, {
        get: () => twig.read(),
        set: value => twig.write(value),
        enumerable: true,
        configurable: true,
    })
    return twig
}

export class Twig<T> implements Signal {
    static create = createTwig
    static define = defineTwig

    name?: string | symbol
    readonly identity = generateSignalID()

    get observable(): Observable<Signal> {
        let subject = this._subject
        if (subject === undefined || subject.isStopped) {
            subject = this._subject = new Subject()
        }
        return subject
    }

    dirty = true
    handler: () => T

    /** @internal */ _value?: T
    /** @internal */ _signals?: SignalList
    /** @internal */ _running?: boolean
    /** @internal */ _subject?: Subject<Signal>
    /** @internal */ _subscription?: Subscription

    /** @internal */
    constructor(handler: () => T) {
        this.handler = handler
    }

    get value(): T {
        this.clean()
        return this._value!
    }

    read(): T {
        this.clean()
        connectSignal(this)
        return this._value!
    }
    write(value: T) {
        throw new Error('Write on this twig is not defined.')
    }
    clean() {
        this.dirty && runTwig(this)
    }
    notify() {
        const subject = this._subject
        subject && subject.next(this)
    }
    connect(signal: Signal) {
        if (!this._running) {
            return
        }
        return addSignal(this._signals!, signal)
    }
}

export function createBranch(handler?: (branch: Branch) => void): Branch
export function createBranch(
    scheduler?: Scheduler,
    handler?: (branch: Branch) => void
): Branch
export function createBranch(
    schedulerOrHandler?: Scheduler | ((branch: Branch) => void),
    handler?: (branch: Branch) => void
): Branch {
    if (typeof schedulerOrHandler === 'function') {
        return new Branch(schedulerOrHandler)
    }
    if (schedulerOrHandler) {
        const instance = Object.create(Branch.prototype)
        instance.scheduler = schedulerOrHandler
        Branch.call(instance, handler)
        return instance
    }
    return new Branch(handler)
}

export class Branch {
    static create = createBranch

    /** @internal */
    readonly identity = generateBranchID()

    handler?: (branch: Branch) => void
    scheduler?: Scheduler

    /** @internal */ _running?: boolean
    /** @internal */ _frozen?: boolean
    /** @internal */ _stopped?: boolean
    /** @internal */ _disposed?: boolean
    /** @internal */ _signals?: SignalList
    /** @internal */ _parent?: Branch
    /** @internal */ _branches?: Branch[]
    /** @internal */ _scheduledBy?: Scheduler
    /** @internal */ _subscription?: Subscription
    /** @internal */ _teardowns?: Subscription
    /** @internal */ _finalizers?: Subscription

    /** @internal */
    constructor(handler?: (branch: Branch) => void) {
        const { length } = connectors
        if (length > 0) {
            const parent = connectors[length - 1]
            if (typeIsBranch(parent)) {
                if (parent._stopped) {
                    throw new Error('The parent branch is already stopped.')
                }
                const branches = parent._branches || (parent._branches = [])
                branches.push(this)
                this._parent = parent
                const { scheduler } = parent
                scheduler && (this.scheduler || (this.scheduler = scheduler))
            } else {
                if (typeIsTwig(parent)) {
                    throw new Error('Creating branches on a twig is forbidden.')
                }
                throw new Error('Branches can only be nested with branches.')
            }
        }
        this.handler = handler
        handler && runBranch(this)
    }

    get stopped() {
        return this._stopped || false
    }
    get disposed() {
        return this._disposed || false
    }

    run() {
        if (this._running) {
            throw new Error('The branch is already running.')
        }
        return runBranch(this)
    }
    stop() {
        return stopBranch(this)
    }
    dispose() {
        if (this._disposed) {
            return
        }
        const parent = this._parent
        if (parent) {
            const branches = parent._branches
            if (branches) {
                const index = branches.indexOf(this)
                index > -1 && branches.splice(index, 1)
            }
            this._parent = undefined
        }
        this._disposed = true
        return stopBranch(this)
    }
    freeze() {
        this._frozen = true
    }
    unfreeze() {
        this._frozen = false
    }
    schedule() {
        if (this._disposed) {
            return
        }
        return scheduleBranch(this)
    }
    unschedule() {
        if (this._disposed) {
            return
        }
        return unscheduleBranch(this)
    }
    connect(signal: Signal) {
        if (!this._running || this._frozen || this._stopped) {
            return
        }
        return addSignal(this._signals!, signal)
    }
    teardown(x: TeardownLogic) {
        let teardowns = this._teardowns
        if (teardowns === undefined) {
            teardowns = this._teardowns = new Subscription()
            this._stopped && teardowns.unsubscribe()
        }
        return teardowns.add(x)
    }
    finalize(x: TeardownLogic) {
        let finalizers = this._finalizers
        if (finalizers === undefined) {
            finalizers = this._finalizers = new Subscription()
            this._disposed && finalizers.unsubscribe()
        }
        return finalizers.add(x)
    }
}

export type ScheduleFunc = (cb: () => void) => void

export function createScheduler(schedule?: ScheduleFunc): Scheduler {
    return new Scheduler(schedule)
}

export class Scheduler {
    static create = createScheduler
    static async = new Scheduler()
    static sync = new Scheduler(cb => cb())
    static default = Scheduler.async

    /** @internal */ _scheduled = false
    /** @internal */ _scheduledBranches = [] as Branch[]
    /** @internal */ _runningBranches?: Branch[]
    /** @internal */ _runningBranch?: Branch
    /** @internal */ _flush?: () => void

    /** @internal */
    constructor(schedule?: ScheduleFunc) {
        schedule && (this.schedule = schedule)
    }

    flush() {
        const runningBranches = this._scheduledBranches
        this._scheduled = false
        this._scheduledBranches = []
        this._runningBranches = runningBranches
        let runningBranch: Branch | undefined
        // tslint:disable-next-line:no-conditional-assignment
        while ((runningBranch = runningBranches.pop())) {
            if (runningBranch._scheduledBy === this) {
                runningBranch._scheduledBy = undefined
            }
            this._runningBranch = runningBranch
            tryCatch(runBranch)(runningBranch)
        }
        this._runningBranch = this._runningBranches = undefined
    }
    schedule(cb: () => void) {
        setTimeout(cb, 0)
    }
    scheduleBranch(branch: Branch) {
        if (branch._scheduledBy === this) {
            return
        }
        branch._scheduledBy = this

        const branchID = branch.identity
        const compare = (branch: Branch) => branch.identity <= branchID

        const runningBranch = this._runningBranch
        if (runningBranch && branchID > runningBranch.identity) {
            const runningBranches = this._runningBranches!
            const index = binarySearch(runningBranches, compare)
            if (branch !== runningBranches[index]) {
                runningBranches.splice(index, 0, branch)
            }
            return
        }

        const scheduledBranches = this._scheduledBranches
        const index = binarySearch(scheduledBranches, compare)
        if (branch === scheduledBranches[index]) {
            return
        }

        scheduledBranches.splice(index, 0, branch)

        if (this._scheduled) {
            return
        }
        this._scheduled = true

        tryCatch(this.schedule).call(
            this,
            this._flush || (this._flush = this.flush.bind(this))
        )
    }
    unscheduleBranch(branch: Branch) {
        if (branch._scheduledBy === this) {
            branch._scheduledBy = undefined
        }

        const branchID = branch.identity
        const compare = (branch: Branch) => branch.identity <= branchID

        const scheduledBranches = this._scheduledBranches
        const index = binarySearch(scheduledBranches, compare)
        if (branch === scheduledBranches[index]) {
            scheduledBranches.splice(index, 1)
        }

        const runningBranches = this._runningBranches
        if (runningBranches) {
            const index = binarySearch(runningBranches, compare)
            if (branch === runningBranches[index]) {
                runningBranches.splice(index, 1)
            }
        }
    }
}

export function reactive(target: object, propertyKey: string | symbol) {
    Object.defineProperty(target, propertyKey, {
        set(value: any) {
            const leaf = createLeaf(value)
            leaf.name = propertyKey
            Object.defineProperty(this, propertyKey, {
                get: () => leaf.read(),
                set: value => leaf.write(value),
                enumerable: true,
                configurable: true,
            })
        },
        enumerable: true,
        configurable: true,
    })
}

export function computed(
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
) {
    const { get, set, enumerable, configurable } = descriptor
    if (typeof get !== 'function') {
        throw new Error('Expect a getter accessor.')
    }
    descriptor.get = function(this: any) {
        const twig = createTwig(get.bind(this))
        set && (twig.write = set.bind(this))
        twig.name = propertyKey
        Object.defineProperty(this, propertyKey, {
            get: () => twig.read(),
            set: value => twig.write(value),
            enumerable,
            configurable,
        })
        return twig.read()
    }
}

const createCounter = (id: number) => () => ++id
const generateSignalID = createCounter(0)
const generateBranchID = createCounter(0)
const connectors = [] as Connector[]

function runTwig<T>(twig: Twig<T>) {
    if (twig._running) {
        return
    }

    connectors.push(twig)

    twig._running = true

    const signals = twig._signals || (twig._signals = [])
    const previousLength = signals.length
    signals.forEach(setDiscarded)

    try {
        const { handler } = twig
        twig._value = handler()
        twig.dirty = false
    } finally {
        const someAdded = previousLength !== signals.length
        const someRemoved = removeDiscardedSignals(signals)
        const signalsChanged = someAdded || someRemoved

        twig._running = false

        connectors.pop()

        // tslint:disable-next-line:label-position
        Finally: {
            if (!signalsChanged) {
                break Finally
            }

            unsubscribeObject(twig)

            if (signals.length === 0) {
                break Finally
            }

            const obs = merge(...signals.map(x => x.observable)).pipe(
                multicast(() => twig.observable as Subject<Signal>),
                refCount()
            )
            const next = () => {
                twig.dirty = true
            }
            twig._subscription = obs.subscribe(next, next, next)
        }
    }
}

function runBranch(branch: Branch) {
    if (branch._disposed) {
        return
    }

    connectors.push(branch)

    branch._running = true
    branch._frozen = false
    branch._stopped = false

    removeAllBranches(branch)
    removeAllTeardowns(branch)

    const signals = branch._signals || (branch._signals = [])
    const previousLength = signals.length
    signals.forEach(setDiscarded)

    try {
        const { handler } = branch
        handler && handler(branch)
    } finally {
        const someAdded = previousLength !== signals.length
        const someRemoved = removeDiscardedSignals(signals)
        const signalsChanged = someAdded || someRemoved

        branch._running = false

        connectors.pop()

        // tslint:disable-next-line:label-position
        Finally: {
            if (branch._stopped) {
                break Finally
            }

            if (!signalsChanged) {
                break Finally
            }

            unsubscribeObject(branch)

            if (signals.length === 0) {
                break Finally
            }

            const obs = merge(...signals.map(x => x.observable))
            const next = () => scheduleBranch(branch)
            branch._subscription = obs.subscribe(next, next, next)
        }
    }
}

function stopBranch(branch: Branch) {
    branch._stopped = true
    unscheduleBranch(branch)
    unsubscribeObject(branch)
    removeAllSignals(branch)
    removeAllBranches(branch)
    removeAllTeardowns(branch)
    branch._disposed && removeAllFinalizers(branch)
}

function removeAllSignals(branch: Branch) {
    const signals = branch._signals
    signals && (signals.length = 0)
}

function removeAllBranches(branch: Branch) {
    const branches = branch._branches
    if (branches) {
        branches.forEach(setDisposed)
        branches.forEach(stopBranch)
        branches.length = 0
    }
}

function removeAllTeardowns(branch: Branch) {
    const teardowns = branch._teardowns
    if (teardowns) {
        branch._teardowns = undefined
        tryCatch(teardowns.unsubscribe).call(teardowns)
    }
}

function removeAllFinalizers(branch: Branch) {
    const finalizers = branch._finalizers
    if (finalizers) {
        branch._finalizers = undefined
        tryCatch(finalizers.unsubscribe).call(finalizers)
    }
}

function scheduleBranch(branch: Branch) {
    return (branch.scheduler || Scheduler.default).scheduleBranch(branch)
}

function unscheduleBranch(branch: Branch) {
    return (branch.scheduler || Scheduler.default).unscheduleBranch(branch)
}

function addSignal(signals: SignalList, signal: Signal) {
    const signalID = signal.identity
    const compare = (signal: Signal) => signal.identity >= signalID
    const index = binarySearch(signals, compare)
    if (index < signals.length) {
        const x = signals[index]
        if (x.signal === signal) {
            x.discarded = false
            return
        }
    }
    signals.splice(index, 0, new SignalItem(signal))
}

function removeDiscardedSignals(signals: SignalList) {
    const { length } = signals
    let k = 0
    for (const x of signals) {
        x.discarded || (signals[k++] = x)
    }
    signals.length = k
    return k < length
}

function setDiscarded(x: { discarded?: boolean }) {
    x.discarded = true
}

function setDisposed(x: { _disposed?: boolean }) {
    x._disposed = true
}

function unsubscribeObject(x: { _subscription?: Subscription }) {
    const subscription = x._subscription
    if (subscription) {
        x._subscription = undefined
        tryCatch(subscription.unsubscribe).call(subscription)
    }
}
