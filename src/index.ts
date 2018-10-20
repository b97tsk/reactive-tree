import {
    from,
    merge,
    BehaviorSubject,
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
    skip,
} from 'rxjs/operators'
import { tryCatch } from './util/tryCatch'

export const identity = '@@identity'
export const observable = '@@observable'

export interface Signal {
    readonly [identity]: number
    readonly [observable]: Observable<Signal>
}

export function createSignal<T>(source: ObservableInput<T>): Signal {
    let obs: Observable<Signal> | undefined
    return Object.create(Signal.prototype, {
        [identity]: {
            value: generateSignalID(),
            enumerable: true,
            configurable: true,
        },
        [observable]: {
            get() {
                return obs || (obs = from(source).pipe(mapTo(this)))
            },
            enumerable: true,
            configurable: true,
        },
    })
}

export class Signal {
    static create = createSignal
    static connect(signal: Signal) {
        if (currentTwig) {
            addSignal(currentTwig, signal)
        }
        if (currentBranch && currentBranch.ready) {
            addSignal(currentBranch, signal)
        }
    }
}

const Signal_connect = Signal.connect

export function createLeaf<T>(value: T): Leaf<T> {
    return new Leaf(value)
}

export function defineLeaf<T>(
    obj: any,
    prop: string | number | symbol,
    value?: T
): Leaf<T> {
    const leaf = new Leaf(arguments.length < 3 ? obj[prop] : value)
    Object.defineProperty(obj, prop, {
        get() {
            return leaf.read()
        },
        set(value) {
            leaf.write(value)
        },
        enumerable: true,
        configurable: true,
    })
    return leaf
}

const defaultSelector = <R>(source: Observable<R>) =>
    source.pipe(
        distinctUntilChanged(),
        skip(1)
    )

export class Leaf<T> implements Signal {
    static create = createLeaf
    static define = defineLeaf;

    /** @internal */
    readonly [identity] = generateSignalID()
    /** @internal */
    get [observable](): Observable<Signal> {
        return (
            this._signal ||
            (this._signal = this.subject().pipe(
                this.selector || defaultSelector,
                mapTo(this)
            ))
        )
    }

    value: T
    selector?: <R>(source: Observable<T>) => Observable<R>

    /** @internal */ _subject?: BehaviorSubject<T>
    /** @internal */ _signal?: Observable<Signal>
    /** @internal */ _subscription?: Subscription | null
    /** @internal */ _subscriptionMany?: Subscription | null

    /** @internal */
    constructor(value: T) {
        this.value = value
    }

    read() {
        Signal_connect(this)
        return this.value
    }
    write(value: T) {
        this.unsubscribe()
        const subject = this._subject
        subject ? subject.next(value) : (this.value = value)
    }
    subject() {
        let subject = this._subject
        if (subject == null) {
            subject = this._subject = new BehaviorSubject(this.value)
            subject.subscribe(value => {
                this.value = value
            })
        }
        return subject
    }
    subscribe(source: ObservableInput<T>) {
        const subscription = from(source).subscribe(value => {
            const subject = this._subject
            subject ? subject.next(value) : (this.value = value)
        })
        const single = this._subscription
        if (single == null) {
            return (this._subscription = subscription)
        }
        let subscriptionMany = this._subscriptionMany
        if (subscriptionMany == null) {
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
            this._subscription = this._subscriptionMany = null
            tryCatch(subscriptionMany.unsubscribe).call(subscriptionMany)
            return
        }
        return unsubscribeObject(this)
    }
}

export function createTwig<T>(handler?: () => T): Twig<T> {
    return new Twig(handler)
}

export function defineTwig<T>(
    obj: any,
    prop: string | number | symbol,
    handler?: () => T
): Twig<T> {
    const twig = new Twig(handler)
    Object.defineProperty(obj, prop, {
        get() {
            return twig.read()
        },
        enumerable: true,
        configurable: true,
    })
    return twig
}

export class Twig<T> implements Signal {
    static create = createTwig
    static define = defineTwig;

    /** @internal */
    readonly [identity] = generateSignalID()
    /** @internal */
    get [observable]() {
        return this._subject || (this._subject = new Subject())
    }

    dirty = true
    handler?: () => T

    /** @internal */ _value?: T
    /** @internal */ _signals?: Signal[]
    /** @internal */ _running?: boolean
    /** @internal */ _subject?: Subject<Signal>
    /** @internal */ _subscription?: Subscription | null

    /** @internal */
    constructor(handler?: () => T) {
        this.handler = handler
    }

    get value(): T {
        this.dirty && runTwig(this)
        return this._value!
    }

    read(): T {
        Signal_connect(this)
        this.dirty && runTwig(this)
        return this._value!
    }
    notify() {
        const subject = this._subject
        subject && subject.next(this)
    }
}

export function createBranch(
    handler?: (branch: Branch) => void,
    scheduler?: Scheduler
): Branch {
    return new Branch(handler, scheduler)
}

export class Branch {
    static create = createBranch;

    /** @internal */
    readonly [identity] = generateBranchID()

    handler?: (branch: Branch) => void
    scheduler?: Scheduler

    /** @internal */ _running?: boolean
    /** @internal */ _frozen?: boolean
    /** @internal */ _stopped?: boolean
    /** @internal */ _disposed?: boolean
    /** @internal */ _signals?: Signal[]
    /** @internal */ _parent?: Branch | null
    /** @internal */ _branches?: Branch[] | null
    /** @internal */ _subscription?: Subscription | null
    /** @internal */ _teardownSubscription?: Subscription | null

    /** @internal */
    constructor(handler?: (branch: Branch) => void, scheduler?: Scheduler) {
        if (currentTwig) {
            throw new Error('creating branches on a twig is forbidden')
        }
        if (currentBranch) {
            const parent = currentBranch
            const branches = parent._branches || (parent._branches = [])
            branches.push(this)
            this._parent = parent
            scheduler || (scheduler = parent.scheduler)
        }
        this.handler = handler
        scheduler && (this.scheduler = scheduler)
        handler && runBranch(this)
    }

    /** @internal */
    get ready() {
        return !this._frozen && !this._stopped && !this._disposed
    }

    run() {
        if (this._running) {
            throw new Error('branch is running')
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
            this._parent = null
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
    addTeardown(teardown: TeardownLogic) {
        let subscription = this._teardownSubscription
        if (subscription == null) {
            subscription = this._teardownSubscription = new Subscription()
            if (!this._running || this._stopped || this._disposed) {
                subscription.unsubscribe()
            }
        }
        return subscription.add(teardown)
    }
    setInterval(callback: (...args: any[]) => void, interval: number) {
        const id = setInterval(callback, interval)
        return this.addTeardown(() => clearInterval(id))
    }
    setTimeout(callback: (...args: any[]) => void, timeout: number) {
        const id = setTimeout(callback, timeout)
        return this.addTeardown(() => clearTimeout(id))
    }
}

export type ScheduleFunc = (callback: (...args: any[]) => void) => void

export function createScheduler(schedule?: ScheduleFunc): Scheduler {
    return new Scheduler(schedule)
}

export class Scheduler {
    static create = createScheduler
    static default = new Scheduler()

    /** @internal */ _scheduled = false
    /** @internal */ _scheduledBranches = [] as Branch[]
    /** @internal */ _runningBranches?: Branch[] | null
    /** @internal */ _runningBranch?: Branch | null

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
            this._runningBranch = runningBranch
            tryCatch(runBranch)(runningBranch)
        }
        this._runningBranch = this._runningBranches = null
    }
    schedule(callback: (...args: any[]) => void) {
        setTimeout(callback, 0)
    }
    scheduleBranch(branch: Branch) {
        const branchID = branch[identity]
        const compare = (branch: Branch) => branch[identity] <= branchID

        const runningBranch = this._runningBranch
        if (runningBranch && branchID > runningBranch[identity]) {
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
        tryCatch(this.schedule).call(this, this.flush.bind(this))
    }
    unscheduleBranch(branch: Branch) {
        const branchID = branch[identity]
        const compare = (branch: Branch) => branch[identity] <= branchID

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

const createCounter = (id: number) => () => ++id
const generateSignalID = createCounter(0)
const generateBranchID = createCounter(0)

let currentTwig = null as Twig<any> | null
let currentBranch = null as Branch | null

function runTwig<T>(twig: Twig<T>) {
    if (twig._running) {
        return
    }

    const previousTwig = currentTwig
    const previousBranch = currentBranch
    currentTwig = twig
    currentBranch = null

    const lastSignals = twig._signals || []
    const latestSignals = [] as typeof lastSignals

    twig._signals = latestSignals
    twig._running = true

    try {
        const { handler } = twig
        if (handler == null) {
            throw new Error('handler is not set')
        }
        twig._value = handler()
        twig.dirty = false
    } finally {
        twig._running = false

        currentTwig = previousTwig
        currentBranch = previousBranch

        // tslint:disable-next-line:label-position
        Finally: {
            if (compareTwoArrays(lastSignals, latestSignals)) {
                break Finally
            }

            unsubscribeObject(twig)

            if (latestSignals.length === 0) {
                break Finally
            }

            const obs = merge(...latestSignals.map(x => x[observable])).pipe(
                multicast(() => twig[observable]),
                refCount()
            )

            twig._subscription = obs.subscribe(() => {
                twig.dirty = true
            })
        }
    }
}

function runBranch(branch: Branch) {
    if (branch._disposed) {
        return
    }

    const previousBranch = currentBranch
    currentBranch = branch

    const lastSignals = branch._signals || []
    const latestSignals = [] as typeof lastSignals

    branch._signals = latestSignals
    branch._running = true
    branch._frozen = false
    branch._stopped = false

    removeAllBranches(branch)
    removeAllTeardowns(branch)

    try {
        const { handler } = branch
        handler && handler(branch)
    } finally {
        branch._running = false

        currentBranch = previousBranch

        // tslint:disable-next-line:label-position
        Finally: {
            if (branch._stopped || branch._disposed) {
                break Finally
            }

            if (compareTwoArrays(lastSignals, latestSignals)) {
                break Finally
            }

            unsubscribeObject(branch)

            if (latestSignals.length === 0) {
                break Finally
            }

            const obs = merge(...latestSignals.map(x => x[observable]))

            branch._subscription = obs.subscribe(() => scheduleBranch(branch))
        }
    }
}

function stopBranch(branch: Branch) {
    const signals = branch._signals
    signals && (signals.length = 0)
    branch._stopped = true
    unscheduleBranch(branch)
    unsubscribeObject(branch)
    removeAllBranches(branch)
    removeAllTeardowns(branch)
}

function removeAllBranches(branch: Branch) {
    const branches = branch._branches
    if (branches) {
        branches.forEach(stopBranch)
        branches.length = 0
    }
}

function removeAllTeardowns(branch: Branch) {
    const subscription = branch._teardownSubscription
    if (subscription) {
        branch._teardownSubscription = null
        tryCatch(subscription.unsubscribe).call(subscription)
    }
}

function scheduleBranch(branch: Branch) {
    return (branch.scheduler || Scheduler.default).scheduleBranch(branch)
}

function unscheduleBranch(branch: Branch) {
    return (branch.scheduler || Scheduler.default).unscheduleBranch(branch)
}

function addSignal(x: { _signals?: Signal[] }, signal: Signal) {
    const signalID = signal[identity]
    const compare = (signal: Signal) => signal[identity] >= signalID

    const signals = x._signals!
    const index = binarySearch(signals, compare)
    if (signal === signals[index]) {
        return
    }

    signals.splice(index, 0, signal)
}

function unsubscribeObject(x: { _subscription?: Subscription | null }) {
    const subscription = x._subscription
    if (subscription) {
        x._subscription = null
        tryCatch(subscription.unsubscribe).call(subscription)
    }
}

function binarySearch<T>(array: T[], pred: (x: T) => boolean) {
    let lo = -1
    let hi = array.length
    while (1 + lo !== hi) {
        const mi = lo + ((hi - lo) >> 1)
        pred(array[mi]) ? (hi = mi) : (lo = mi)
    }
    return hi
}

function compareTwoArrays<T>(a: T[], b: T[]) {
    const { length } = a
    if (length !== b.length) {
        return false
    }
    for (let i = 0; i < length; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}
