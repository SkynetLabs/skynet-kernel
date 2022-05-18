# libkmodule

libkmodule is the main library used for kernel module development, and is the
standard flow that is supported by the developers of the Skynet kernel. It
provides abstractions for communicating with the kernel and for calling out to
other kernel modules.

## Why Kernel Modules?

A kernel module is a decentralized API that can be used by other Skynet
programs. You can think of kernel modules as mini private servers that run in
the user's cloud and provide APIs to the user's other programs. Similar to real
private servers, the user's programs cannot access the private data or state of
a kernel module, they can only access the data that is exposed through the
module's public API.

One example of a kernel module would be 'profileDAC', which creates an API that
exposes the user's prefferred handle and preferred profile picutre. ProfileDAC
is read-only, other programs on Skynet that want to make use of the user's
profile picture and username are only able to read the user's preferences. A
rogue consumer of the profileDAC API cannot maliciously modify  the user's
preferences.

The main purpose of modules on Skynet is enable data sharing between
applications in a way that is secure and prevents malicious programs from
damaging the user's experience. Moduels can handle info like avatars, modules
can create common filesystems between many applications, modules can manage a
user's social graph, modules can manage content that the user has uplaoded to
Skynet, and more.

The world created by Skynet modules is a world where a user can switch
platforms without losing access to their friends, followers, or data. For
example, a blogger will have all of their blogs sotred inside of a blog module,
which allows the blogger to switch between platforms at any time without
disrupting their reader's ability to read their content.

## The Basics of Building Modules

Kernel modules are webworkers that are hosted inside of the Skynet kernel's
iframe. They do all of their communication with users through postMessage, and
they handle all incoming messages using `onmessage`. libkmodule handles most of
this for you using abstractions like `handleMessage`, `addHandler`,
`callModule`, and `connectModule`.

Being webworkers, modules have full access to functions like `fetch` and
`WebSocket()`, which allows modules to make calls to external APIs over the
Internet. Especially in blockchain contexts, this is useful for doing things
like talking to blockchain explorers or blockchain full nodes.

One of the major roles that modules play in the Skynet ecosystem is to provide
trustless wrappers around otherwise untrusted APIs. A kernel module can do
something like wrap a call to get a user's blockchain balance, and then perform
SPV verification or even zero-knowledge proof verification to ensure that the
external service is not being dishonest when it is returning a value to the
caller. Moduels can also provide invisible/seamless failover options. If one
API provider goes down, the module can failover to using another API provider
and entirely hide the outage from the user, which makes user applications
significantly more reliable.

In addition to being able to call out to the open Internet, modules can make
calls to other modules. It is common and encouraged for modules to chain
together to complete a task. For example, the profileDAC manages the user's
preferred avatar by storing the image file for the avatar on Skynet. But it
doesn't perform the actual network calls itself, instead it uses the
secure-upload and secure-download modules to store the file on Skynet.

At startup, modules are provided a user seed that is unique to them. The kernel
derives the seed from the user's main Skynet seed, and this allows a module to
perform actions like create blockchain wallets for the user without having to
worry that other modules will be able to access the user's funds.

Finally, all calls to a module's API are accompanied by a domain. The module is
told which domain or other module is performing the call, which allows modules
to maintain access control. For example, profileDAC only allows certain
external applications to modify the user's profile picture. When an application
attempts to call 'updateProfilePicture' on profileDAC, profileDAC can check
whether that application is allowed to update the user's profile picture before
making any changes to the user's data.

## Publishing and Deploying

###### TODO

## Writing Code

### Creating an API

To communicate with the kernel, every module needs to create an `onmessage`
function and handle specific messages and message types from the kernel.
libkmodule will handle all of this automatically if you set onmessage to
`handleMessage`. The first 3 lines of a kernel module typically look like this:

```ts
import { handleMessage } from "libkmodule"

onmessage = handleMessage
```

If you want to add an API call to your module, you can do so using the
`addHandler` method, which takes a string and a function as input. The string
is the name of the API call you are creating, and the function is the handler
for that API call. A very basic API call looks like this:

```ts
import { addHandler, handleMessage } from "libkmodule"

onmessage = handleMessage

// handleSayHello will return a 'hello' message to the caller.
function handleSomeMethod(aq: activeQuery) {
	aq.accept("hello!")
}

addHandler("sayHello", handleSayHello)
```

You'll notice that the handler is a function which receives an `activeQuery`
object as input, and it responds to the caller by calling `accept` on the
activeQuery object. The activeQuery object contains a variety of inputs that
can all be used to complete messages. At least for getting started, the most
important elements of the activeQuery object are `accept`, `reject`, and
`callerInput`.

`accept` is a function which will provide a successful response to the caller.
Best practice is actually to return an object instead of a basic value like a
string. Using best practice, our above example would actually look like this:

```ts
import { addHandler, handleMessage } from "libkmodule"

onmessage = handleMessage

// handleSayHello will return a 'hello' message to the caller.
function handleSomeMethod(aq: activeQuery) {
	aq.accept({ message: "hello!" })
}

addHandler("sayHello", handleSayHello)
```

We want to wrap our return values in objects because it makes it easier to
update the API in the future without breaking compatibility. We now have a way
to extend the 'sayHello' to include extra information. That extra information
will be ignored by older code that doesn't recognize the new fields, which
preserves compatibility, and newer code can access the new functionality
without the module needing to define an entirely new method.

The `callerInput` field of the activeQuery is an arbitrary, untrusted object
provided by the caller as input. Because the input is untrusted, we need to
verify any fields or types that we are expecting. Similar to above, best
practice for `callerInput` is to provide an object rather than a basic type, so
that the module can be extended in the future without having to release a new
mehtod name. Here's an example of using the callerInput:

```ts
import { addHandler, handleMessage } from "libkmodule"

onmessage = handleMessage

// handleSayHello will return a 'hello' message to the caller.
function handleSomeMethod(aq: activeQuery) {
	// If a name was provided by the caller, include the name in the hello
	// message.
	if ("name" in aq.callerInput) {
		aq.accept({ message: "hello "+aq.callerInput.name+"!"})
		return
	}
	aq.accept({ message: "hello!" })
}

addHandler("sayHello", handleSayHello)
```

The `reject` field of the activeQuery is a way to return an error in the event
that the call is malformed. The input to `reject` should always be a string. We
use strings everywhere instead of `Error` types because these errors need to be
sent over postMessage, and the `Error` type does not transfer over postMessage
correctly. Here is an example where we reject calls that do not provide a name:

```ts
import { addHandler, handleMessage } from "libkmodule"

onmessage = handleMessage

// handleSayHello will return a 'hello' message to the caller.
function handleSomeMethod(aq: activeQuery) {
	// If a name was provided by the caller, include the name in the hello
	// message.
	if ("name" in aq.callerInput) {
		aq.accept({ message: "hello "+aq.callerInput.name+"!"})
		return
	}
	aq.reject("I will not say hello unless you provide a name")
}

addHandler("sayHello", handleSayHello)
```

The next interesting field is the `domain` field, which is a secure field set
by the kernel that says what the domain of the caller is. The domain field is
always a string. If the caller is a module, the domain will be a skylink. If
the caller is a skapp, the domain will be a webdomain like 'someapp.skynet'. If
the caller is a normal web application, the domain will be something like
'somewebapp.com'.

The main use for the domain is access control. For example, we could update our
sayHello module to provide a special message if the caller is coming from
'specialapp.com':

```ts
import { addHandler, handleMessage } from "libkmodule"

onmessage = handleMessage

// handleSayHello will return a 'hello' message to the caller.
function handleSomeMethod(aq: activeQuery) {
	// If a name was provided by the caller, include the name in the hello
	// message.
	if (aq.domain === "specialapp.com") {
		aq.accept({ message: "A most special hello!" })
		return
	}
	aq.accept({ message: "hello!" })
}

addHandler("sayHello", handleSayHello)
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
