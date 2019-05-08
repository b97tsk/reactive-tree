# reactive-tree

A simple library for reactive programming.

This library may help you write your view controllers with less pain. But if you
are working with some kind of framework, you might find nowhere could use it.

Requires [RxJS 6](https://github.com/ReactiveX/rxjs).

## Installation

```shell
npm install reactive-tree
```

## Definition

### Leaves

A leaf behaves as a reactive property. It reacts whenever its value changes.

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

A twig behaves as a computed property with cache. It has a value that is
computed from its `handler` function. It computes only when someone try to get
its value and it's **dirty**.

A twig gets **dirty** when:

- it's just created, or
- it **reads** leaves (or other twigs) inside its `handler` function and any of
  those leaves (or other twigs) reacts, or
- its `dirty` property is set to true.

A twig also behaves like a reactive property if, inside its `handler` function,
it **reads** values from leaves (or other twigs).

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

A branch creates a reactive procedure: it collects reactive properties by
calling its `handler` function; then it waits until any of those reactive
properties reacts, it schedules to restart this procedure (by default, using
setTimeout function).

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
properties inside its `handler` function changes. Things you should know that:

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
  if (book == null) {
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
function defineLeaf<T, K extends keyof T>(obj: T, prop: K): Leaf<T[K]>;
function defineLeaf<T>(obj: any, prop: keyof any, value: T): Leaf<T>;

class Leaf<T> {
  static create = createLeaf;
  static define = defineLeaf;
  value: T;
  selector?: <R>(source: Observable<T>) => Observable<R>;
  read(): T;
  write(value: T): void;
  subject(): BehaviorSubject<T>;
  subscribe(observable: ObservableInput<T>): Subscription;
  unsubscribe(): void;
}
```

#### function createLeaf()

Creates a leaf with a value.

#### function defineLeaf()

Creates a leaf with a value, like `createLeaf()`, but also defines a property
for an object, which corresponds with that leaf:

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

#### class Leaf: read()

`read()` returns `value`. Additionally, calling `read()` inside a `handler`
function causes the leaf to be collected by the owner of that `handler`
function, which must be a twig or an **unfrozen** branch.

#### class Leaf: write()

Set `value` property to a new value. It also causes the leaf to react if this
new value differs from the old one (To change this behavior, see
[selector](#class-leaf-selector)).

#### class Leaf: subject()

Create an RxJS BehaviorSubject for the leaf and returns it. Subsequent calls
return the same one.

The subject responds to `write()` and `subscribe()`.

#### class Leaf: subscribe()

Subscribe an RxJS Observable and returns an RxJS Subscription. A `write()`
cancels this subscription. Each value emitted by this observable is written to
the leaf, like `write()` but without canceling this subscription.

#### class Leaf: unsubscribe()

Cancel all subscriptions created by `subscribe()`. A `write()` also cancels all
those subscriptions.

### class Twig

```typescript
function createTwig<T>(handler: () => T): Twig<T>;
function defineTwig<T>(obj: any, prop: keyof any, handler: () => T): Twig<T>;

class Twig<T> {
  static create = createTwig;
  static define = defineTwig;
  dirty: boolean;
  handler: () => T;
  readonly value: T;
  read(): T;
  write(value: T): void;
  clean(): void;
  notify(): void;
}
```

#### function createTwig()

Creates a twig with a handler.

#### function defineTwig()

Creates a twig with a handler, like `createTwig()`, but also defines a property
for an object, which corresponds with that twig:

- when you get this property, it returns `twig.read()`.
- when you set this property to something, it calls `twig.write(something)`.

#### class Twig: dirty

Indicate whether the twig should update the cached value.

#### class Twig: handler

Get or set the `handler`. If set, you may also want to set `dirty` to true and
make a call to `notify()`.

#### class Twig: value

Get the cached value computed from `handler` function.

If `dirty` is true, a new value returned by `handler` function will be cached
and used instead. And then `dirty` is set to false.

Generally, you should consider using `read()` instead of getting this property.

#### class Twig: read()

`read()` returns `value`. Additionally, calling `read()` inside a `handler`
function causes the twig to be collected by the owner of that `handler`
function, which must be a twig or an **unfrozen** branch.

#### class Twig: write()

By default, `write()` throws an error. Overwrite this property if you need it.

#### class Twig: clean()

Clean the twig if it's dirty.

#### class Twig: notify()

Force the twig to react.

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
  addTeardown(teardown: TeardownLogic): void;
  setInterval(
    callback: (...args: any[]) => void,
    interval: number,
    ...args: any[]
  ): void;
  setTimeout(
    callback: (...args: any[]) => void,
    timeout: number,
    ...args: any[]
  ): void;
}
```

#### function createBranch()

Creates a branch with a handler and/or a scheduler.

If 'scheduler' is not specified, but the parent branch has one, that one will be
used. That is to say, inner branches share the same scheduler from their parent
branch, if their `scheduler` are not set.

Schedulers are used to change the way how branches schedule when they react.

#### class Branch: handler

Get or set the `handler`. If set, you need to call `run()` or `schedule()` to
take effect.

#### class Branch: scheduler

Get or set the `scheduler`. If set, you need to call `run()` or `schedule()` to
take effect.

If `scheduler` is not set, `Scheduler.default` is used.

#### class Branch: stopped

Check if the branch is stopped.

#### class Branch: disposed

Check if the branch is disposed.

#### class Branch: run()

Force the branch to restart [its procedure](#branches) immediately.

An error throws if `run()` is called inside the `handler` function.

#### class Branch: stop()

Stop the branch.

#### class Branch: dispose()

Dispose the branch.

You can `run()` or `schedule()` a stopped branch again, but not a disposed
branch.

#### class Branch: freeze()

Freeze the branch. Subsequent reactive properties will **NOT** be collected by
the branch.

`freeze()` should only be called inside the `handler` function.

#### class Branch: unfreeze()

Unfreeze the branch, ready to collect subsequent reactive properties.

`unfreeze()` should only be called inside the `handler` function.

`unfreeze()` need not be called if there is no subsequent reactive properties
after.

#### class Branch: schedule()

Make a schedule to restart [its procedure](#branches).

#### class Branch: unschedule()

Undo `schedule()`.

#### class Branch: addTeardown()

Add something to do when the branch restarts or stops or disposes. This is
useful if you need to undo something that is done inside the `handler` function.

`addTeardown()` should only be called inside the `handler` function.

#### class Branch: setInterval()

Start a timer. `clearInterval()` is automatically called when the branch
restarts or stops or disposes.

`setInterval()` should only be called inside the `handler` function.

#### class Branch: setTimeout()

Start a timer. `clearTimeout()` is automatically called when the branch restarts
or stops or disposes.

`setTimeout()` should only be called inside the `handler` function.

### class Scheduler

```typescript
type ScheduleFunc = (callback: () => void) => void;

function createScheduler(schedule?: ScheduleFunc): Scheduler;

class Scheduler {
  static create = createScheduler;
  static default = new Scheduler();
  flush(): void;
  schedule(callback: () => void): void;
  scheduleBranch(branch: Branch): void;
  unscheduleBranch(branch: Branch): void;
}
```

#### function createScheduler()

Create a scheduler with a schedule function.

### class Signal

```typescript
function createSignal<T>(source: ObservableInput<T>): Signal;
function connectSignal(signal: Signal): void;

class Signal {
  static create = createSignal;
  static connect = connectSignal;
}
```

#### function createSignal()

Create a signal from an observable.

#### function connectSignal()

Connect a signal. `connectSignal()` should only be called inside twigs' or
branches' `handler` function. Any value emission from this signal causes those
twigs or branches to react (twigs become dirty, branches schedule to run again).

## License

MIT
