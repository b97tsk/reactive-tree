import {
    BehaviorSubject,
    NEVER,
    Observable,
    Subject,
    Subscription,
    TeardownLogic,
    merge,
} from 'rxjs'
import { distinctUntilChanged, share, skip } from 'rxjs/operators'

export interface Leaf<T> {
    value: T
    read(): T
    write(value: T): void
    subject(): Subject<T>
    subscribe(observable: Observable<T>): Subscription
}

export interface Twig<T> {
    handler?: () => T
    readonly value: T
    dirty: boolean
    read(): T
}

export interface Branch {
    handler?: (branch: Branch) => void
    run(): void
    stop(): void
    remove(): void
    freeze(): void
    unfreeze(): void
    schedule(): void
    unschedule(): void
    addTeardown(teardown: TeardownLogic): void
    setInterval(callback: (...args: any[]) => void, interval: number): void
    setTimeout(callback: (...args: any[]) => void, timeout: number): void
}

const Symbol_signal = '@@signal'

class $Leaf$<T> implements Leaf<T> {
    readonly id = generateLeafID()
    _subject?: Subject<T>
    _signal?: Observable<T>
    _subscription?: Subscription | null

    constructor(public value: T) {}

    get [Symbol_signal]() {
        return (
            this._signal ||
            (this._signal = this.subject().pipe(
                distinctUntilChanged(),
                skip(1)
            ))
        )
    }

    read() {
        if (currentTwig) {
            addLeaf(currentTwig, this)
        }
        if (currentBranch && currentBranch.ready) {
            addLeaf(currentBranch, this)
        }
        return this.value
    }
    write(value: T) {
        unsubscribeObject(this)
        this.value = value
        const subject = this._subject
        subject && subject.next(value)
    }
    subject() {
        return (
            this._subject ||
            (this._subject = new BehaviorSubject<T>(this.value))
        )
    }
    subscribe(observable: Observable<T>) {
        return (this._subscription = observable.subscribe(value => {
            this.value = value
            const subject = this._subject
            subject && subject.next(value)
        }))
    }
}

interface LeafLike {
    readonly id: number
    readonly [Symbol_signal]: Observable<any>
}

class $Twig$<T> implements Twig<T> {
    readonly id = generateLeafID()
    dirty = true
    _value?: T
    _leaves?: LeafLike[]
    _running?: boolean
    _signal?: Observable<any>
    _subscription?: Subscription | null

    constructor(public handler?: () => T) {}

    get [Symbol_signal]() {
        return this._signal || NEVER
    }
    get value() {
        this.dirty && runTwig(this)
        return this._value!
    }

    read() {
        if (currentTwig && currentTwig !== this) {
            addLeaf(currentTwig, this)
        }
        if (currentBranch && currentBranch.ready) {
            addLeaf(currentBranch, this)
        }
        this.dirty && runTwig(this)
        return this._value!
    }
}

class $Branch$ implements Branch {
    readonly id = generateBranchID()
    _running?: boolean
    _frozen?: boolean
    _stopped?: boolean
    _removed?: boolean
    _leaves?: LeafLike[]
    _parent?: $Branch$ | null
    _branches?: $Branch$[] | null
    _subscription?: Subscription | null
    _teardownSubscription?: Subscription | null

    constructor(public handler?: (branch: Branch) => void) {}

    get ready() {
        return !this._frozen && !this._stopped && !this._removed
    }

    run() {
        if (this._running) {
            throw new Error('branch is running')
        }
        runBranch(this)
    }
    stop() {
        stopBranch(this)
    }
    remove() {
        removeBranch(this)
    }
    freeze() {
        this._frozen = true
    }
    unfreeze() {
        this._frozen = false
    }
    schedule() {
        this._removed || scheduleBranch(this)
    }
    unschedule() {
        this._removed || unscheduleBranch(this)
    }
    addTeardown(teardown: TeardownLogic) {
        addTeardown(this, teardown)
    }
    setInterval(callback: (...args: any[]) => void, interval: number) {
        addTeardown(this, () => {
            clearInterval(id)
        })
        const id = setInterval(callback, interval)
    }
    setTimeout(callback: (...args: any[]) => void, timeout: number) {
        addTeardown(this, () => {
            clearTimeout(id)
        })
        const id = setTimeout(callback, timeout)
    }
}

const createCounter = (id: number) => () => ++id
const generateLeafID = createCounter(0)
const generateBranchID = createCounter(0)

let currentTwig = null as $Twig$<any> | null
let currentBranch = null as $Branch$ | null
let scheduledBranchArray = [] as $Branch$[]
let scheduledBranchArrayScheduled = false
let runningBranchArray = null as $Branch$[] | null
let runningBranch = null as $Branch$ | null | undefined

export function createLeaf<T>(value: T): Leaf<T> {
    return new $Leaf$<T>(value)
}

export function defineLeaf<T>(
    obj: any,
    prop: string | number | symbol,
    value?: T
): Leaf<T> {
    const leaf = new $Leaf$<T>(arguments.length < 3 ? obj[prop] : value)
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

export function createTwig<T>(handler?: () => T): Twig<T> {
    return new $Twig$<T>(handler)
}

export function defineTwig<T>(
    obj: any,
    prop: string | number | symbol,
    handler?: () => T
): Twig<T> {
    const twig = new $Twig$<T>(handler)
    Object.defineProperty(obj, prop, {
        get() {
            return twig.read()
        },
        enumerable: true,
        configurable: true,
    })
    return twig
}

export function createBranch(handler?: (branch: Branch) => void): Branch {
    if (currentTwig) {
        throw new Error('creating branches on a twig is forbidden')
    }
    const branch = new $Branch$(handler)
    if (currentBranch) {
        const parent = currentBranch
        const branches = parent._branches || (parent._branches = [])
        branches.push(branch)
        branch._parent = parent
    }
    handler && runBranch(branch)
    return branch
}

function removeBranch(branch: $Branch$) {
    if (branch._removed) {
        return
    }
    const parent = branch._parent
    if (parent) {
        const branches = parent._branches
        if (branches) {
            const index = branches.indexOf(branch)
            index > -1 && branches.splice(index, 1)
        }
        branch._parent = null
    }
    stopBranch(branch)
    branch._removed = true
}

function removeAllBranches(branch: $Branch$) {
    const branches = branch._branches
    if (branches) {
        branches.forEach(stopBranch)
        branches.length = 0
    }
}

function addTeardown(branch: $Branch$, teardown: TeardownLogic) {
    if (!branch._running) {
        throw new Error('branch is not running')
    }
    if (branch._stopped || branch._removed) {
        throw new Error('branch is stopped or removed')
    }
    const subscription =
        branch._teardownSubscription ||
        (branch._teardownSubscription = new Subscription())
    subscription.add(teardown)
}

function removeAllTeardowns(branch: $Branch$) {
    const subscription = branch._teardownSubscription
    if (subscription) {
        branch._teardownSubscription = null
        subscription.unsubscribe()
    }
}

function runTwig<T>(twig: $Twig$<T>) {
    if (twig._running) {
        return
    }

    const previousTwig = currentTwig
    const previousBranch = currentBranch
    currentTwig = twig
    currentBranch = null

    const lastLeaves = twig._leaves || []
    const latestLeaves = [] as typeof lastLeaves

    twig._leaves = latestLeaves
    twig._running = true

    const handler = twig.handler
    try {
        if (handler == null) {
            throw new Error('handler is not set')
        }
        twig._value = handler()
        twig.dirty = false
    } finally {
        twig._running = false

        currentTwig = previousTwig
        currentBranch = previousBranch

        do {
            if (compareTwoArray(lastLeaves, latestLeaves)) {
                break
            }

            unsubscribeObject(twig)

            if (latestLeaves.length === 0) {
                twig._signal && (twig._signal = NEVER)
                break
            }

            const observable = (twig._signal =
                latestLeaves.length === 1
                    ? latestLeaves[0][Symbol_signal]
                    : merge(...latestLeaves.map(getSignal)).pipe(share()))

            twig._subscription = observable.subscribe(() => {
                twig.dirty = true
            })
        } while (false)
    }
}

function runBranch(branch: $Branch$) {
    if (branch._removed) {
        return
    }

    const previousBranch = currentBranch
    currentBranch = branch

    removeAllBranches(branch)
    removeAllTeardowns(branch)

    const lastLeaves = branch._leaves || []
    const latestLeaves = [] as typeof lastLeaves

    branch._leaves = latestLeaves
    branch._running = true
    branch._frozen = false
    branch._stopped = false

    const handler = branch.handler
    try {
        handler && handler(branch)
    } finally {
        branch._running = false

        currentBranch = previousBranch

        do {
            if (branch._stopped || branch._removed) {
                break
            }

            if (compareTwoArray(lastLeaves, latestLeaves)) {
                break
            }

            unsubscribeObject(branch)
            unscheduleBranch(branch)

            if (latestLeaves.length === 0) {
                break
            }

            const observable = merge(...latestLeaves.map(getSignal))

            branch._subscription = observable.subscribe(() => {
                scheduleBranch(branch)
            })
        } while (false)
    }
}

function stopBranch(branch: $Branch$) {
    const leaves = branch._leaves
    leaves && (leaves.length = 0)
    unsubscribeObject(branch)
    unscheduleBranch(branch)
    removeAllBranches(branch)
    removeAllTeardowns(branch)
    branch._stopped = true
}

function runAllScheduledBranches() {
    runningBranchArray = scheduledBranchArray
    scheduledBranchArray = []
    scheduledBranchArrayScheduled = false
    try {
        while ((runningBranch = runningBranchArray.pop())) {
            runBranch(runningBranch)
        }
    } finally {
        runningBranchArray.forEach(scheduleBranch)
        runningBranch = runningBranchArray = null
    }
}

function scheduleBranch(branch: $Branch$) {
    const branchID = branch.id
    const compare = (branch: $Branch$) => branch.id <= branchID

    if (runningBranch && branchID > runningBranch.id) {
        const index = binarySearch(runningBranchArray!, compare)
        if (branch !== runningBranchArray![index]) {
            runningBranchArray!.splice(index, 0, branch)
        }
        return
    }

    const index = binarySearch(scheduledBranchArray, compare)
    if (branch === scheduledBranchArray[index]) {
        return
    }

    scheduledBranchArray.splice(index, 0, branch)

    if (scheduledBranchArrayScheduled) {
        return
    }

    setTimeout(runAllScheduledBranches, 1)
    scheduledBranchArrayScheduled = true
}

function unscheduleBranch(branch: $Branch$) {
    const branchID = branch.id
    const compare = (branch: $Branch$) => branch.id <= branchID

    const index = binarySearch(scheduledBranchArray, compare)
    if (branch === scheduledBranchArray[index]) {
        scheduledBranchArray.splice(index, 1)
    }

    if (runningBranchArray) {
        const index = binarySearch(runningBranchArray, compare)
        if (branch === runningBranchArray[index]) {
            runningBranchArray.splice(index, 1)
        }
    }
}

function addLeaf(x: { _leaves?: LeafLike[] }, leaf: LeafLike) {
    const leafID = leaf.id
    const compare = (leaf: LeafLike) => leaf.id >= leafID

    const leaves = x._leaves!
    const index = binarySearch(leaves, compare)
    if (leaf === leaves[index]) {
        return
    }

    leaves.splice(index, 0, leaf)
}

function getSignal(leaf: LeafLike) {
    return leaf[Symbol_signal]
}

function unsubscribeObject(x: { _subscription?: Subscription | null }) {
    const subscription = x._subscription
    if (subscription) {
        x._subscription = null
        subscription.unsubscribe()
    }
}

function binarySearch<T>(array: T[], pred: (x: T) => boolean) {
    let lo = -1,
        hi = array.length
    while (1 + lo !== hi) {
        const mi = lo + ((hi - lo) >> 1)
        pred(array[mi]) ? (hi = mi) : (lo = mi)
    }
    return hi
}

function compareTwoArray<T>(a: T[], b: T[]) {
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
