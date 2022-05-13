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

## Seed Management

If you are using `handleMessage`, you can get the seed by calling
`libkmodule.getSeed`. `getSeed` is a promise which returns the seed when it
becomes available. The module receives the seed from the kernel over
postMessage, which is why the seed can only be made available in a promise.
Here is some example code to fetch the seed:

```ts
import { getSeed, handleMessage } from "libkmodule"

onmessage = handleMessage

getSeed.then(seed => {
	// do something with the seed
})
```

`getSeed` can also be called inside of handlers:

```ts
import { addHandler, getSeed, handleMessage } from "libkmodule"

// handleSomeMethod handles a call to "someMethod".
function handleSomeMethod(data: any) {
	getSeed.then(seed => {
		// do stuff
	})
}
addHandler("someMethod", handleSomeMethod)

onmessage = handleMessage
```

You can call `getSeed` as many times as you want, once the seed is available
`getSeed` will resolve immediately for all callers.

## Advanced Techniques

We generally recommend against using these advanced techniques, as it usually
indicates that you are doing something wrong or that there is probably an
easier way to achieve what you want. However, we figured we would document them
anyway in case they proved to be necessary for certain use cases.

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
