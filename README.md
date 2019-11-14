# reactive-tree

A simple library for reactive programming.

Requires [RxJS 6](https://github.com/ReactiveX/rxjs).

[View changelog](#changelog).

## Installation

```shell
npm install reactive-tree
```

## Definition

### Leaves

A leaf defines a reactive state. It reacts whenever its value changes.

#### Example: Create a leaf

```typescript
import { createLeaf } from "reactive-tree";

const leaf = createLeaf("world");

console.log(`Hello, ${leaf.value}.`); // Hello, world.
```

A second way to create a leaf is using [defineLeaf](#function-defineleaf).

This example doesn't show how a leaf reacts whenever its value changes. Let's
keep reading.

### Twigs

A twig defines a computed state. It has a value that is computed from its
`handler` function. It computes only when someone try to get its value and it's
**dirty**.

A twig gets **dirty** when:

- it's just created, or
- it **reads** leaves (or other twigs) inside its `handler` function and any of
  those leaves (or other twigs) reacts, or
- its `dirty` property is set to true.

A twig also behaves like a reactive state if, inside its `handler` function, it
**reads** values from leaves (or other twigs).

#### Example: Create a twig

```typescript
import { createLeaf, createTwig } from "reactive-tree";

const leaf = createLeaf("world");
const twig = createTwig(() => `Hello, ${leaf.read()}.`);

console.log(twig.value); // Hello, world.
leaf.write("kitty");
console.log(twig.value); // Hello, kitty.
```

Now you can see that this line `leaf.write("kitty");` causes the leaf to react,
which causes the twig to become **dirty**, because the twig **reads** the leaf
inside its `handler` function. As a result, the second `twig.value` now has a
different value.

A second way to create a twig is using [defineTwig](#function-definetwig).

### Branches

A branch starts a reactive procedure: it collects reactive states by calling its
`handler` function; then it waits until any of those reactive states reacts, it
schedules to restart this procedure (by default, using setTimeout function).

#### Example: Create a branch

```typescript
import { createBranch, createLeaf, createTwig } from "reactive-tree";

const leaf = createLeaf("world");
const twig = createTwig(() => `Hello, ${leaf.read()}.`);

createBranch(() => {
  console.log(twig.read());
});

leaf.write("kitty");

// Output:
//   Hello, world.
//   Hello, kitty.
```

Basically, this example illustrates how a branch reacts whenever any of reactive
states inside its `handler` function changes. Things you should know that:

- `createBranch()` immediately calls its sole argument, the `handler` function,
  which produces the first line of output;
- the second line of output does not immediately show up, but the gap is too
  small to be noticed.

Branches can be nested inside each other.

##### Example: Nesting

```typescript
import { createBranch, defineLeaf } from "reactive-tree";

class Book {
  constructor(public name: string) {
    defineLeaf(this, "name");
  }
}

class MyApp {
  showThisBook = null as Book | null;
  constructor() {
    defineLeaf(this, "showThisBook");
  }
}

const myApp = new MyApp();

createBranch(() => {
  const book = myApp.showThisBook;
  if (book === null) {
    console.log("No book is showing.");
    return;
  }
  console.log("We are showing a book.");
  createBranch(() => {
    console.log(`Name of the book is "${book.name}".`);
  });
});

setTimeout(() => {
  const book = new Book("How To Make Cookies");
  myApp.showThisBook = book;
  setTimeout(() => {
    book.name = "How To Plant A Tree";
    setTimeout(() => {
      myApp.showThisBook = null;
      book.name = "This One Will Not Show Up";
    }, 2000);
  }, 2000);
}, 2000);

// Output:
//   (2 seconds later)
//   No book is showing.
//   We are showing a book.
//   Name of the book is "How To Make Cookies".
//   (2 seconds later)
//   Name of the book is "How To Plant A Tree".
//   (2 seconds later)
//   No book is showing.
```

## API

### class Leaf

```typescript
function createLeaf<T>(value: T): Leaf<T>;
function defineLeaf<T, K extends keyof T>(
  target: T,
  propertyKey: K
): Leaf<T[K]>;
function defineLeaf<T>(
  target: object,
  propertyKey: string | symbol,
  value: T
): Leaf<T>;

class Leaf<T> implements Signal {
  static defaultSelector = distinctUntilChanged();
  static create = createLeaf;
  static define = defineLeaf;
  value: T;
  selector: OperatorFunction<T, T>;
  readonly subject: Subject<T>;
  read(): T;
  write(value: T): void;
  observe(observable: ObservableInput<T>): Subscription;
  unobserve(): void;
}
```

#### function createLeaf()

Create a leaf with a value.

#### function defineLeaf()

Create a leaf with a value, like `createLeaf()`, but also defines a property for
an object, which corresponds with this leaf:

- when you get this property, it returns `leaf.read()`;
- when you set this property to something, it calls `leaf.write(something)`.

#### class Leaf: value

Get or set the `value`.

Generally, you should consider using `read()` or `write()` instead of getting or
setting this property.

#### class Leaf: selector

Determine whether the leaf should react when a new value writes to it.

By default, leaves react only when a different value writes to them. You can
change this behavior by setting this property.

Note that setting this property has no effect if the leaf has been read by twigs
or branches. Setting this property just after the leaf is created is the
recommended way.

#### class Leaf: subject

Get a `Subject` for this leaf. Subsequent calls return the same one.

The subject responds to `write()` and `observe()`.

#### class Leaf: read()

`read()` returns `value`. Additionally, calling `read()` inside a `handler`
function causes the leaf to be collected by the owner of that `handler`
function, which must be a twig or a branch.

#### class Leaf: write()

Set `value` property to a new value. It also causes the leaf to react if this
new value differs from the old one (To change this behavior, see
[selector](#class-leaf-selector)).

#### class Leaf: observe()

Subscribe an `Observable` and returns a `Subscription`. A `write()` cancels this
subscription. Each value emitted by this observable is written to the leaf, like
`write()` but without canceling this subscription.

#### class Leaf: unobserve()

Cancel all subscriptions created by `observe()`. A `write()` also cancels all
those subscriptions.

### class Twig

```typescript
function createTwig<T>(handler: () => T): Twig<T>;
function defineTwig<T>(
  target: object,
  propertyKey: string | symbol,
  handler: () => T
): Twig<T>;

class Twig<T> implements Signal {
  static create = createTwig;
  static define = defineTwig;
  dirty: boolean;
  handler: () => T;
  readonly value: T;
  read(): T;
  write(value: T): void;
  clean(): void;
  notify(): void;
  connect(signal: Signal): void;
}
```

#### function createTwig()

Create a twig with a handler.

#### function defineTwig()

Create a twig with a handler, like `createTwig()`, but also defines a property
for an object, which corresponds with this twig:

- when you get this property, it returns `twig.read()`.
- when you set this property to something, it calls `twig.write(something)`.

#### class Twig: dirty

Indicate whether the twig should update the cached value.

#### class Twig: handler

Get or set the `handler`.

If set, you may also want to set `dirty` to true and make a call to `notify()`.

#### class Twig: value

Get the cached value computed from `handler` function.

If `dirty` is true, a new value returned by `handler` function will be cached
and used instead. And then `dirty` is set to false.

Generally, you should consider using `read()` instead of getting this property.

#### class Twig: read()

`read()` returns `value`. Additionally, calling `read()` inside a `handler`
function causes the twig to be collected by the owner of that `handler`
function, which must be a twig or a branch.

#### class Twig: write()

By default, `write()` throws an error. Overwrite this property if you need it.

#### class Twig: clean()

Clean the twig if it's dirty.

#### class Twig: notify()

Force the twig to react.

#### class Twig: connect()

Connect a signal with the twig.

`connect()` should only be called inside the `handler` function.

### class Branch

```typescript
function createBranch(handler?: (branch: Branch) => void): Branch;
function createBranch(
  scheduler?: Scheduler,
  handler?: (branch: Branch) => void
): Branch;

class Branch {
  static create = createBranch;
  handler?: (branch: Branch) => void;
  scheduler?: Scheduler;
  readonly stopped: boolean;
  readonly disposed: boolean;
  run(): void;
  stop(): void;
  dispose(): void;
  freeze(): void;
  unfreeze(): void;
  schedule(): void;
  unschedule(): void;
  connect(signal: Signal): void;
  teardown(x: TeardownLogic): void;
  finalize(x: TeardownLogic): void;
}
```

#### function createBranch()

Create a branch with a handler and/or a scheduler.

If 'scheduler' is not specified, but the parent branch has one, that one will be
used. That is to say, inner branches share the same scheduler from their parent
branch, if their `scheduler` are not set.

Schedulers are used to change the way how branches schedule when they react.

#### class Branch: handler

Get or set the `handler`.

If set, you need to call `run()` or `schedule()` to take effect.

#### class Branch: scheduler

Get or set the `scheduler`.

If `scheduler` is not set, `Scheduler.default` is used.

#### class Branch: stopped

Check if the branch stops.

#### class Branch: disposed

Check if the branch disposes.

#### class Branch: run()

Force the branch to restart [its procedure](#branches) immediately.

An error throws if `run()` is called inside the `handler` function.

#### class Branch: stop()

Stop the branch.

#### class Branch: dispose()

Dispose the branch.

You can `run()` or `schedule()` a stopped branch again, but not a disposed one.

#### class Branch: freeze()

Freeze the branch. Subsequent reactive states will **NOT** be collected by the
branch.

`freeze()` should only be called inside the `handler` function.

#### class Branch: unfreeze()

Unfreeze the branch, ready to collect subsequent reactive states.

`unfreeze()` should only be called inside the `handler` function.

`unfreeze()` need not be called if there is no subsequent reactive states after.

#### class Branch: schedule()

Make a schedule to `run()`.

#### class Branch: unschedule()

Undo `schedule()`.

#### class Branch: connect()

Connect a signal with the branch.

`connect()` should only be called inside the `handler` function.

#### class Branch: teardown()

Add something to do when the branch restarts or stops or disposes. This is
useful if you need to undo something that is done inside the `handler` function.

`teardown()` should only be called inside the `handler` function.

#### class Branch: finalize()

Add something to do when the branch disposes.

`finalize()` should only be called outside the `handler` function.

### class Scheduler

```typescript
type ScheduleFunc = (cb: () => void) => void;

function createScheduler(schedule?: ScheduleFunc): Scheduler;

class Scheduler {
  static create = createScheduler;
  static async: Scheduler;
  static sync: Scheduler;
  static default = Scheduler.async;
  flush(): void;
  schedule(cb: () => void): void;
  scheduleBranch(branch: Branch): void;
  unscheduleBranch(branch: Branch): void;
}
```

#### function createScheduler()

Create a scheduler with a schedule function.

#### class Scheduler: flush()

Run all branches scheduled by this scheduler.

#### class Scheduler: schedule()

The schedule function.

#### class Scheduler: scheduleBranch()

Make a schedule to run a branch.

#### class Scheduler: unscheduleBranch()

Undo what `scheduleBranch()` does to a branch.

### class Signal

```typescript
function createSignal<T>(source: ObservableInput<T>): Signal;
function connectSignal(signal: Signal): void;
function collectSignals(cb: () => void): Signal[];

class Signal {
  static create = createSignal;
  static connect = connectSignal;
  static collect = collectSignals;
}
```

#### function createSignal()

Create a signal from an observable.

#### function connectSignal()

Connect a signal. `connectSignal()` should only be called inside a `handler`
function (twigs' or branches'). Any emission from this signal causes those twigs
or branches to react (twigs become dirty, branches schedule to run again).

#### function collectSignals()

Collect signals inside the callback function, return an array of them.

### decorators

```typescript
function reactive(target: object, propertyKey: string | symbol): void;
function computed(
  target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor
): PropertyDescriptor;
```

#### function reactive()

Add a get-setter property to a class. The first time you set a value to this
property of an instance, a leaf is created and bound to it.

#### function computed()

Wrap an existing get-setter property of a class. The first time you get this
property of an instance, a twig is created and bound to it.

### others

```typescript
function when(predicate: () => boolean, effect: () => void): Branch;
function whenever<T>(
  expression: () => T,
  effect: (data: T, branch: Branch) => void,
  selector?: OperatorFunction<T, T>,
  fireImmediately?: boolean
): Branch;
```

#### function when()

When `predicate` returns true, `efffect` is called (and only called once).

To cancel `when()`, `dispose()` the returned branch. After `effect` is called,
the returned branch will be disposed too.

#### function whenever()

Whenever `expression` returns a value that differs from the old one, `effect` is
called with the returned value and a branch that can be used to cancel
`whenever()` as parameters.

`whenever()` also returns the branch that passes to `effect`. To cancel
`whenever()`, `dispose()` the branch.

`selector` can be used to determine which values, returned by `expression`,
should pass to `effect`. By default, `Leaf.defaultSelector` is used.

If `fireImmediately` is true, `effect` will be immediately called with the first
value returned by `expression` and the branch mentioned above as parameters.

## Changelog

- v4.0.0:
  - Added [finalize()](#class-branch-finalize) method for branches;
  - Added [when()](#function-when) and [whenever()](#function-whenever);
  - Added `Leaf.defaultSelector`;
  - Renamed `subscribe()` to [observe()](#class-leaf-observe) for leaves;
  - Renamed `unsubscribe()` to [unobserve()](#class-leaf-unobserve) for leaves;
  - Changed the type of [selector](#class-leaf-selector) for leaves;
  - Changed `subject()` to [subject](#class-leaf-subject) for leaves;
  - Changed the implementation of [createSignal()](#function-createsignal).
- v3.0.1 - v3.0.3:
  - Minor fixes.
- v3.0.0:
  - Added [clean()](#class-twig-clean) for twigs;
  - Added [connect()](#class-twig-connect) for twigs;
  - Added [connect()](#class-branch-connect) for branches;
  - Added [stopped](#class-branch-stopped) for branches;
  - Added [disposed](#class-branch-disposed) for branches;
  - Added [collectSignals()](#function-collectsignals);
  - Added `Scheduler.sync` and `Scheduler.async`;
  - Added [reactive()](#function-reactive) and [computed()](#function-computed);
  - Renamed `addTeardown()` to [teardown()](#class-branch-teardown);
  - Removed `setInterval()` and `setTimeout()` for branches.
- v2.2.0:
  - Added [write()](#class-twig-write) for twigs.
- v2.0.1 - v2.0.3:
  - Minor changes.
- v2.0.0:
  - Added class `Scheduler` and `Signal`;
  - Added [selector](#class-leaf-selector) for leaves;
  - Renamed `remove()` to [dispose()](#class-branch-dispose);
  - Changed signature of [createBranch](#function-createbranch).

## License

MIT
