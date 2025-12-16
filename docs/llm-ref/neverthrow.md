# neverthrow API Reference

Encode failure into your program with a `Result<T, E>` type that represents either success (`Ok`) or failure (`Err`). For asynchronous tasks, `neverthrow` offers a `ResultAsync` class which wraps a `Promise<Result<T, E>>`. 

## Cheatsheet

- Create result from value - `ok`/`err` (`okAsync`/`errAsync` for `ResultAsync`)
- Create result from function or closure - `Result.fromThrowable`/`ResultAsync.fromThrowable`/`ResultAsync.fromPromise`/`ResultAsync.fromSafePromise`
- Check result - `isOk`/`isErr` (after check, type inference allows access to `.value`/`.error`)
- Unwrap with default if `Err` - `unwrapOr`
- Transform value inside `Ok`/`Err` variant (infallible) - `map`/`mapErr` (`T -> U`/`E -> F`)
  - If the variant doesn't match (e.g. `map` on `Err`), the callback never runs and the original result is passed through unchanged
- Transforms with fallible operations - `andThen`/`orElse` (callback returns `Result`)
  - If the callbacks are async: `asyncAndThen`/`asyncOrElse` (callback returns `ResultAsync`)
- Handle both variants at once - `match` (`T -> A, E -> B`)
- Side effects - `andTee`/`orTee` (`T -> any`/`E -> any`) (original result passes through unchanged)
  - If errors inside the side effect callback matter, use `andThrough` instead of `andTee`

---

## API Documentation

### Synchronous API (`Result`)

```typescript
interface IResult<T, E> {
  isOk(): this is Ok<T, E>; // can access .value if this returns true
  isErr(): this is Err<T, E>; // can access .error if this returns true

  /** Return the value from an `Ok` variant, or the given default value. */
  unwrapOr<V>(v: V): T | V;
  /** Handle both variants at once. */
  match<A, B = A>(ok: (t: T) => A, err: (e: E) => B): A | B;
  /**
   * Transform the contained value in an `Ok` variant, leaving an `Err` variant untouched.
   * If the transformation can fail, use `andThen` instead.
   */
  map<U>(f: (t: T) => U): Result<U, E>;
  /**
   * Transform the contained error in an `Err` variant, leaving an `Ok` variant untouched.
   * Can be used to enrich errors while passing successful results through.
   * If the transformation can fail, use `orElse` instead.
   */
  mapErr<U>(f: (e: E) => U): Result<T, U>;
  /** Transform the `Ok` value like `map`, but for fallible operations. */
  andThen<U, E>(f: (t: T) => Result<U, F>): Result<U, E | F>;
  /** Map an `Err` value to a new Result. Useful for fallible error recovery. */
  orElse<U, F>(f: (e: E) => Result<U, F>): Result<T | U, F>;
  /** Run a side effect on the `Ok` value. An `Err` variant will not call the callback. */
  andTee(f: (t: T) => unknown): Result<T, E>;
  /** Run a side effect on the `Err` value. An `Ok` variant will not call the callback. */
  orTee(f: (t: E) => unknown): Result<T, E>;
  /** Run a side effect on `Ok` like `andTee`, but if the operation fails, the error is passed downstream, replacing the original one. */
  andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, E | F>;
}

class Ok<T, E> implements IResult<T, E> {
  value: T;
  /* ... IResult methods ... */
}

class Err<T, E> implements IResult<T, E> {
  error: E;
  /* ... IResult methods ... */
}

type Result<T, E> = Ok<T, E> | Err<T, E>;
```

#### Basic usage

```typescript
import { ok, err, Result } from 'neverthrow'

// Use `ok`/`err` to construct `Result` objects
const myResult = ok({ myData: 'test' }) // instance of `Ok`
const myErr = err('Oh noooo') // instance of `Err`

// Check the variant with `isOk`/`isErr`
myResult.isOk() // true
myResult.isErr() // false

myErr.isOk() // false
myErr.isErr() // true

// The variant check is a type guard for the underlying data.
// Access the variant's data with `.value`/`.error`
if (myResult.isOk()) {
  const myData = myResult.value
} else {
  // const myData = myResult.value // error: 'value' does not exist on type 'Err<T, E>'.
}

if (myErr.isErr()) {
  const error = myErr.error
} else {
  // const error = myErr.error // error: 'error' does not exist on type 'Ok<T, E>'.
}

// Fall back to a default value with `unwrapOr`
myErr.unwrapOr(10) // 10
myResult.unwrapOr(10) // { myData: 'test' }

// Create from function
Result.fromThrowable(() => {
  JSON.parse("{"),
  (e) => e as Error // The second argument is a function that maps the error to a known type
}) // err(...)

Result.fromThrowable(() => 0, _ => _ as never) // ok(0)

// Equivalent try/catch code:
let result
try {
  result = ok(JSON.parse("{"))
} catch (error) {
  result = err(error as Error)
}
```

Prefer `fromThrowable` over `try`/`catch` for calls to outside APIs.

#### Pipelines/Combinators

```typescript
import { ok, err } from 'neverthrow'

const myResult = ok({ myData: 'test' })
const myErr = err('Oh noooo')

// Transform the variant's data with `map`/`mapErr`
const newResult = myResult.map((value) => value.myData)
newResult.isOk() && newResult.value // 'test'

const newErr = myErr.mapErr((error) => error + '!!!')
newErr.isErr() && newErr.error // 'Oh noooo!!!'

function roll(errString: string = "oh no") {
  return Math.random() > 0.5 ? ok(1) : err(errString)
}
const fallible = roll()
// Handle both variants at once with `match`
fallible.match(
  (value) => value + 5,
  (error) => console.error(error.toUpperCase())
)

// Fallible transformations that themselves return a Result should go through `andThen`/`orElse`
fallible.andThen((value) => ok(value + 5)) // ok(6)
fallible.andThen((value) => err("oops!")) // err("oops!")
fallible.orElse((error) => ok("Recovered from error: " + error)) // ok("Recovered from error: oh no")
fallible.orElse((error) => err("Error 2!")) // err("Error 2!")

fallible.andThen(_ => roll()) // roll again if ok() - 25% chance of ok(1), 75% chance of err("oh no")
fallible.orElse(_ => roll()) // roll again if err() - 75% chance of ok(1), 25% chance of err("oh no")

// andThen can be used to flatten nested Results
const nested = ok(ok(1234))
nested.andThen((inner) => inner) // Ok(1234)

// Side effects are run through `andTee`/`orTee`
fallible.andTee((value) => console.log(value)) // logs 6 or nothing
fallible.orTee((error) => console.error(error)) // logs "oh no" or nothing

// If the side effect can fail, use `andThrough` (there is no equivalent for the `Err` variant)
fallible.andThrough((value) => roll("uh oh!")) // 25% chance of ok(1), 25% chance of err("uh oh!"), 50% chance of err("oh no")
```

#### `Result.combine`

```typescript
import { ok, err, Result } from 'neverthrow'

const myResult = ok({ myData: 'test' })
const myErr = err('Oh noooo')

// Combine multiple results
const combined = Result.combine([ok(1), ok(2), ok(3)])
combined.isOk() && combined.value // [1, 2, 3]

const combinedErr = Result.combine([ok(1), err("short circuit"), ok(3), err("never reached")])
combinedErr.isErr() && combinedErr.error // "short circuit"

// Combine with all errors (`Ok` variant behaves the same as `Result.combine`)
const combinedErr2 = Result.combineWithAllErrors([ok(1), err("does not short circuit"), ok(3), err("all errors are returned")])
combinedErr2.isErr() && combinedErr2.error // ["does not short circuit", "all errors are returned"]
```

### Asynchronous API (`ResultAsync`)

```typescript
import { ResultAsync, okAsync, errAsync, ok, err } from 'neverthrow'

const myResultAsync = okAsync({ myData: 'test' }) // instance of `ResultAsync`
// ResultAsync must be awaited to access the data
const myResult = await myResultAsync // instance of `Ok`

myResult.isOk() // true
myResult.isErr() // false

// Fallible Promise
type FetchError = { status: number }
async function falliblePromise(): Promise<number> {
  await fetch("https://example.com") // throws FetchError
  return 1
}

// 1. fromPromise (if the Promise may reject)
const promiseResultAsync = ResultAsync.fromPromise(falliblePromise(), (e) => e as FetchError)
const promiseResult = await promiseResultAsync

promiseResult.isOk() && promiseResult.value // 1
promiseResult.isErr() && promiseResult.error // FetchError

// 2. fromThrowable (if the operation can fail **before** the Promise is created)
const syncFail = ResultAsync.fromThrowable(async () => {
    const x = JSON.parse("{") // throws SyntaxError before the Promise is created
    return falliblePromise() // Promise resolves or rejects with FetchError
  },
  (e) => e as SyntaxError | FetchError
) // Err<number, SyntaxError | FetchError>

const syncFailResult = await syncFail
syncFailResult.isErr() && syncFailResult.error // SyntaxError | FetchError

// 3. fromSafePromise (if you **know for sure** the Promise will never reject; foregoes error handling, so **be careful**)
const safePromiseResultAsync = ResultAsync.fromSafePromise(Promise.resolve(1))
const safePromiseResult = await safePromiseResultAsync

safePromiseResult.isOk() && safePromiseResult.value // 1
// safePromiseResult.isErr() && safePromiseResult.error // never

// All functions on Result have equivalents on ResultAsync
errAsync(0).unwrapOr(10) // returns a Promise
okAsync(0).match(
  _ => 10,
  _ => 20
) // returns a Promise

await myResultAsync.map((value) => value.myData) // 'test'
await myResultAsync.mapErr((error) => error + '!!!') // 'Oh noooo!!!'
// Fallible transforms may return a Result or ResultAsync
await myResultAsync.andThen((value) => okAsync(value + 5)) // ok(6)
await myResultAsync.orElse((error) => err(error + '!!!')) // err("Oh noooo!!!")
await myResultAsync.andTee((value) => console.log(value)) // logs 'test'
await myResultAsync.orTee((error) => console.error(error)) // logs 'Oh noooo!!!'

// Async transforms convert the Result to ResultAsync
const mySyncResult = ok(5);
const asyncMapped = mySyncResult.asyncMap(async () => 10)
await asyncMapped // ok(10)

```

`ResultAsync.fromThrowable` is generally safer than `ResultAsync.fromPromise` for outside APIs that may throw synchronously instead of rejecting.


#### `safeTry`

Equivalent of Rust's `?` operator. Use (async) generators to return early from errors and reduce boilerplate.

See the following example:
```typescript
declare function mayFail1(): Result<number, string>;
declare function mayFail2(): Result<number, string>;

function myFunc(): Result<number, string> {
    // We have to define a constant to hold the result to check and unwrap its value.
    const result1 = mayFail1();
    if (result1.isErr()) {
        return err(`aborted by an error from 1st function, ${result1.error}`);
    }
    const value1 = result1.value

    // Again, we need to define a constant and then check and unwrap.
    const result2 = mayFail2();
    if (result2.isErr()) {
        return err(`aborted by an error from 2nd function, ${result2.error}`);
    }
    const value2 = result2.value

    // And finally we return what we want to calculate
    return ok(value1 + value2);
}
```

With safeTry, we can state 'Return here if its an `Err`, otherwise unwrap it here and keep going' in just one expression.
```typescript
declare function mayFail1(): Result<number, string>;
declare function mayFail2(): Result<number, string>;

function myFunc(): Result<number, string> {
    return safeTry<number, string>(function*() {
      // If mayFail1() fails here, its Err variant is returned;
      // Otherwise, num1 is assigned to the value of mayFail1().value
      const num1 = yield* mayFail1()
          .mapErr(e => `aborted by an error from 1st function: ${e}`);
      // Same as above
      const num2 = yield* mayFail2()
          .mapErr(e => `aborted by an error from 2nd function: ${e}`);
      return ok(num1 + num2);
    })
}
```

To use `safeTry`, the points are as follows.
* Wrap the entire block in a [generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*)
* In that block, use `yield* <RESULT>` to state 'Return `<RESULT>` if it's an `Err`, otherwise evaluate to its `.value`'
* Pass the generator function to `safeTry`

You can also use [async generator function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function*) to pass an async block to `safeTry`.
```typescript
// You can use either Promise<Result> or ResultAsync.
declare function mayFail1(): Promise<Result<number, string>>;
declare function mayFail2(): ResultAsync<number, string>;

function myFunc(): Promise<Result<number, string>> {
    return safeTry<number, string>(async function*() {
        const num1 = yield* await mayFail1()
            .mapErr(e => `aborted by an error from 1st function: ${e}`);
        const num2 = yield* await mayFail2()
            .mapErr(e => `aborted by an error from 2nd function: ${e}`);
        return ok(num1 + num2);
    })
}
```

---

### Testing

`Result` instances have two unsafe methods, aptly called `_unsafeUnwrap` and `_unsafeUnwrapErr` which **should only be used in a test environment**.

That way you can do something like:

```typescript
const myResult = ok(5);
expect(myResult._unsafeUnwrap()).toBe(5);
expect(() => myResult._unsafeUnwrapErr()).toThrow();

const myErr = err("oh no");
expect(() => myErr._unsafeUnwrap()).toThrow();
expect(myErr._unsafeUnwrapErr()).toBe("oh no");
```

However, do note that `Result` instances are comparable. So you don't necessarily need to unwrap them in order to assert expectations in your tests. So you could also do something like this:

```typescript
expect(takesArgs(1, 2, "three")).toEqual(ok(6));
expect(failsWithArgs(1, 2, "three")).toEqual(err("oh no"));
```

By default, the thrown value does not contain a stack trace to keep error messages concise. If you want stack traces to be generated, call `_unsafeUnwrap`/`_unsafeUnwrapErr` with a config object:

```typescript
myResult._unsafeUnwrap({
  withStackTrace: true,
})

// ^ Now the thrown error object will have a `.stack` property containing the current stack
```
