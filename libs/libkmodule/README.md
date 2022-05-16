# libkmodule

libkmodule is a helper library to make module development for the kernel
easier. It provides both wrappers for communicating with the kernel and also
convenience functions for things like logging.

## Message Processing

Every webworker needs to set `onmessage`. If you are using libkmodule, you can
set `onmessage = libkmodule.handleMessage` and then libkmodule will
automatically process all of the incoming messages for you. We generally
recommend that all module developers do this, which means the first few lines
of your worker code should look something like the following:

```ts
import { handleMessage } from "libkmodule"

onmessage = handleMessage
```

If you want to create a custom method or API for your module, you can do so by
using the `addHandler` function. `addHandler` takes a string as input which
corresponds to the method that's being called, and it takes a function as the
second argument which corresponds to the function that actually processes the
message.

```ts
import { addHandler, handleMessage } from "libkmodule"

// handleSomeMethod handles a call to "someMethod".
function handleSomeMethod(data: any) {
	// do stuff
}
addHandler("someMethod", handleSomeMethod)

onmessage = handleMessage
```

## Error Handling

libkmodule and the other Skynet core libraries depart significantly from
idiomatic javascript in thow they handle errors. Because Skynet errors very
frequently need to be sent over postMessage, all errors are of the form
`string | null` as opposed to using the standard error type.

Furthermore, none of the libkmodule functions have any throws. Instead, the
functions will return errors in a tuple. When combined with the async/await
pattern, it means a lot of the libkmodule functions have this return signature:
`Promise<[any, string | null]>`

You can interact with this code in the following manner:

```ts
async function useLibkmodule() {
	let [value, err] = await libkmodule.someCall()
	if (err !== null) {
		// handle error
		return
	}

	// There's no error, continue as normal.
}
```

Though the pattern is unusual, it allows us to entirely avoid needing the
try/catch pattern. This isn't the right place to talk about why try/catch is
worth avoiding, but some of the main points include the fact that a throw can
have objects of any type, throws aren't part of the call signature and
therefore are often missed, programmers often avoid handling throws right away,
and catch blocks have a completely different variable scope from try blocks.
All of these factors make the try/catch pattern difficult to work with and
worth avoiding.

## Seed Management

If you are using `handleMessage`, you can get the seed by calling
`libkmodule.getSeed`. `getSeed` is a promise which returns the seed when it
becomes available. You can call `getSeed` as many times as you want, it will
always return the correct seed.

The seed needs to be presented asynchronously because the module does not
receive the seed until after startup, and it receives its seed from the kernel.
Here is some example code retrieving the seed:

```ts
import { getSeed, handleMessage } from "libkmodule"

onmessage = handleMessage

getSeed.then((seed) => {
	// do something with the seed
})
```

`getSeed` can also be called inside of handlers:

```ts
import { addHandler, getSeed, handleMessage } from "libkmodule"

// handleSomeMethod handles a call to "someMethod".
function handleSomeMethod(data: any) {
	getSeed.then((seed) => {
		// do stuff
	})
}
addHandler("someMethod", handleSomeMethod)

onmessage = handleMessage
```

Using async/await:

```ts
import { addHandler, getSeed, handleMessage } from "libkmodule"

// handleSomeMethod handles a call to "someMethod".
async function handleSomeMethod(data: any) {
	let seed = await getSeed
	// do stuff
}
addHandler("someMethod", handleSomeMethod)

onmessage = handleMessage
```

## Expert Techniques

We generally recommend against using these expert techniques, as it usually
indicates that you are doing something wrong or that there is probably an
easier way to achieve what you want. However, we figured we would document them
anyway in case they proved to be necessary for certain use cases.

Some wisdom: the expert feels confident in using expert techniques because they
trust themselves not to make mistakes. The master does not feel confident in
using expert techniques because they know that humans make mistakes at every
level of experience.

### handleMessage Preprocessing

If you need to do some sort of preprocessing or special case handling in the
`onmessage` function, you can wrap `handleMessage`. Note that you can only do
preprocessing, because handleMessage will providing error checking and
automatically responding to the caller if there are issues. A wrapped
handleMessage would look something like this:

```ts
onmessage = function (event: MessageEvent) {
	// perform preprocesing here

	handleMessage(event)
}
```

### Router Overwriting

handleMessage automatically handles certain methods like 'response',
'responseUpdate', and 'presentSeed'. If for some reason you need to handle
these yourself, you can overwrite their default handlers with addHandler.

```ts
import { addHandler, handleMessage } from "libkmodule"

// handlePresentSeedCustom will handle a call to "presentSeed". This completely
// overwrites the default handler for "presentSeed" which means that the 'getSeed'
// function will never resolve.
//
// Try to avoid things like this.
function handlePresentSeedCustom(data: any) {
	// do stuff
}
addHandler("presentSeed", handleSomeMethod)

onmessage = handleMessage
```
