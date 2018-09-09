# reactive-tree

A simple library for reactive programming.

Requires [RxJS 6](https://github.com/ReactiveX/RxJS).

## Installation

```shell
npm install reactive-tree
```

## Definition

### Leaves

A leaf behaves as a reactive property. It reacts when its value changes.

#### Example: Create a leaf

```typescript
import { createLeaf } from "reactive-tree";

const leaf = createLeaf("world");

console.log(`Hello, ${leaf.value}.`); // Hello, world.
```

### Twigs

A twig has a cached value that is computed from its `handler` function. It
computes only if it's **dirty** and someone try to get its value.

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

### Branches

A branch creates a reactive procedure: it collects reactive properties by
calling its `handler` function; then it waits until any of those reactive
properties reacts, it restarts this procedure (by scheduling, not immediately).

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

Branches can be nested with each other.

##### Example: Nesting

```typescript
import { createBranch, createLeaf, defineLeaf } from "reactive-tree";

const showThisBook = createLeaf(null);

const book = {};
defineLeaf(book, "name", "How To Make Cookies");

createBranch(() => {
  const book = showThisBook.read();
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
  showThisBook.write(book);
  setTimeout(() => {
    book.name = "How To Plant A Tree";
    setTimeout(() => {
      showThisBook.write(null);
      book.name = "This One Will Not Show Up";
    }, 2000);
  }, 2000);
}, 2000);

// Output:
//   No book is showing.
//   We are showing a book.
//   Name of the book is "How To Make Cookies".
//   Name of the book is "How To Plant A Tree".
//   No book is showing.
```

The more branches are nested, the more they look like a tree, I guess.

## API

### Functions

#### function createLeaf()

```typescript
function createLeaf<T>(value: T): Leaf<T>;
```

Creates a leaf with a value.

#### function createTwig()

```typescript
function createTwig<T>(handler?: () => T): Twig<T>;
```

Creates a twig with a handler.

#### function createBranch()

```typescript
function createBranch(handler?: (branch: Branch) => void): Branch;
```

Creates a branch with a handler.

#### function defineLeaf()

```typescript
function defineLeaf<T>(obj: any, prop: string, value?: T): Leaf<T>;
```

Creates a leaf with a value, also defines a property for an object, which
corresponds with that leaf:

- when you get this property, it returns `leaf.read()`;
- when you set this property to something, it calls `leaf.write(something)`.

#### function defineTwig()

```typescript
function defineTwig<T>(obj: any, prop: string, handler?: () => T): Twig<T>;
```

Creates a twig with a handler, also defines a property for an object, which
corresponds with that twig:

- when you get this property, it returns `twig.read()`.

### class Leaf

```typescript
interface Leaf<T> {
  value: T;
  read(): T;
  write(value: T): void;
  subject(): Subject<T>;
  subscribe(observable: Observable<T>): Subscription;
}
```

#### class Leaf: value

`value` is a data property, no magic happen when you get or set this property.

Generally, you should consider using `read()` or `write()` instead of getting or
setting this property.

#### class Leaf: read()

`read()` returns `value`. Additionally, calling `read()` inside a **handler**
function causes the leaf is collected by the owner of that **handler** function
which must be a twig or an unfrozen branch.

#### class Leaf: write()

`write()` sets `value` property to a new value. It causes the leaf reacts if
this new value differs from the old one.

#### class Leaf: subject()

`subject()` creates an RxJS Subject for the leaf and returns it. Subsequent
calls return the same one.

The subject responds to `write()` and `subscribe()`.

#### class Leaf: subscribe()

`subscribe()` subscribes an RxJS Observable and returns an RxJS Subscription. A
`write()` cancels this subscription. Each value emitted by this observable is
written to the leaf, like `write()` but without canceling this subscription.

### class Twig

```typescript
interface Twig<T> {
  handler?: () => T;
  readonly value: T;
  dirty: boolean;
  read(): T;
}
```

#### class Twig: handler

`handler` is a data property, no magic happen when you get or set this property.

#### class Twig: value

`value` returns the cached value computed from `handler` function.

If `dirty` is true, a new value returned by `handler` function will be cached
and used instead. And then `dirty` is set to false.

If `handler` is not set, an exception throws.

Generally, you should consider using `read()` instead of getting this property.

#### class Twig: dirty

`dirty` indicates whether the twig should update the cached value.

#### class Twig: read()

`read()` returns `value`. Additionally, calling `read()` inside a **handler**
function causes the twig is collected by the owner of that **handler** function
which must be a twig or an unfrozen branch.

### class Branch

```typescript
interface Branch {
  handler?: (branch: Branch) => void;
  run(): void;
  stop(): void;
  remove(): void;
  freeze(): void;
  unfreeze(): void;
  schedule(): void;
  unschedule(): void;
  addTeardown(teardown: TeardownLogic): void;
  setInterval(callback: (...args: any[]) => void, interval: number): void;
  setTimeout(callback: (...args: any[]) => void, timeout: number): void;
}
```

#### class Branch: handler

`handler` is a data property, no magic happen when you get or set this property.

#### class Branch: run()

`run()` forces the branch to restart [its procedure](#branches) immediately.

An exception throws if `run()` is called inside the `handler` function.

#### class Branch: stop()

`stop()` stops the branch.

#### class Branch: remove()

`remove()` removes the branch permanently.

You can `run()` or `schedule()` a stopped branch again, but not a removed
branch.

#### class Branch: freeze()

`freeze()` freezes the branch. Subsequent reactive properties will **NOT** be
collected by the branch.

`freeze()` should be called inside the `handler` function, otherwise an
exception throws.

#### class Branch: unfreeze()

`unfreeze()` unfreezes the branch, ready to collect subsequent reactive
properties.

`unfreeze()` need not be called if there is no subsequent reactive properties
after.

`unfreeze()` should be called inside the `handler` function, otherwise an
exception throws.

#### class Branch: schedule()

`schedule()` forces the branch to restart [its procedure](#branches) **as soon
as possible**.

#### class Branch: unschedule()

`unschedule()` undoes `schedule()`.

#### class Branch: addTeardown()

`addTeardown()` adds something to do when the branch restarts or stops or is
removed. This is useful if you need to undo something that is done inside the
`handler` function.

An exception throws if the branch has been stopped or removed.

`addTeardown()` should be called inside the `handler` function, otherwise an
exception throws.

#### class Branch: setInterval()

`setInterval()` starts a timer. `clearInterval()` is automatically called when
the branch restarts or stops or is removed.

An exception throws if the branch has been stopped or removed.

`setInterval()` should be called inside the `handler` function, otherwise an
exception throws.

#### class Branch: setTimeout()

`setTimeout()` starts a timer. `clearTimeout()` is automatically called when the
branch restarts or stops or is removed.

An exception throws if the branch has been stopped or removed.

`setTimeout()` should be called inside the `handler` function, otherwise an
exception throws.

## License

MIT
