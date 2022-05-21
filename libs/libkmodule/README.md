# libkmodule

libkmodule is the main library used for kernel module development, and is the
standard flow that is supported by the developers of the Skynet kernel. It
provides abstractions for communicating with the kernel and for calling out to
other kernel modules.

## Background and Basics

### Why Kernel Modules?

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
rogue consumer of the profileDAC API cannot maliciously modify the user's
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

### Building Modules

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

### The Query Model

All API endpoints created by modules follow a query model. The caller makes a
query to a module, then that query gets closed out with a response by the
module. The query can be closed out successfully or unsuccessfully. If the
query is closed out successfully, the module can return an arbitrary javascript
object (as long as it can be serielized to JSON). If the query experiences an
error or fails, the query must be closed out with a string response.

Queries can be long lasting, and can receive updates. The caller can send an
update by send a 'queryUpdate' message, and the module can send an update by
sending a 'responseUpdate' message.

If a queryUpdate is sent to a module that does not support queryUpdates, the
update will be ignored. Similarly, if a responseUpdate is sent to a caller that
doesn't support responseUpdates, the update will be ignored. Some modules
implement APIs where the updates are mandatory, and other modules implement
APIs where the updates are optional. A good example of an optional update is a
upload progres update, where a module may be providing updates every few
seconds that establish how much progress an upload has made. An example of
mandatory updates would be an interactive protocol where a module may need to
request things like signatures from the user.

Most APIs do not implement updates at all, and just have a straightforward
query-response protocol. The APIs that do implement updates typically implement
responseUpdates only, and the updates are completely optional for the caller.
Only a few APIs have required updates or support queryUpdates.

### Publishing and Deploying Modules

All modules are loaded from Skynet using the Skynet registry. The example
modules all have a build script which walks through the deployment process, but
it essentially amounts to deterministically deriving a public key using a
password, then publishing the module to the Skynet registry under that
password.

Modules are deployed to a decentralized environment using public keys and
hashes. This means that there is no such thing as server-side ratelimiting. An
attacker can attempt to brute-force a module's password at full speed. The
module deployment process has a small key derivation function which slightly
strengthens passwords, but most passwords need to be 60+ bits of entropy to
provide material security against brute force attacks.

Though decentralized management of modules means that security is more
important, it also means that modules are censorship resistant and do not need
to comply with centralized terms of service nor do they need to fear being
deplatformed.

Modules are always published under a public key, which gives the developer the
ability to update the module and change the code at any time. This creates
security surface area for an important ecosystem module to become compromised,
either due to stolen keys or due to the developer going rogue.

The kernel features two different protections against this security threat. The
first protection is the ability to query a module using the hash of its code
rather than using the pubkey of the module. By using the hash of a module, the
caller can guarantee that they use a trusted version of the module even if the
keys have been compromised or the developer has gone rogue.

The second protection is called a 'kernel override'. The kernel stands as a
middleman between all calls to modules, and therefore has the ability to
intercept a call and route it to another module. For example, if one developer
loses their keys to an attacker, they can re-publish their module under a new
public key, and users can install a kernel override that will route all
requests aimed at the old compromised module to the new uncompromised module.

The kernel also has the ability to add overrides by default, and then only
update a module after the user or a trusted maintainer has reviewed and
approved the update.

Because social protections exist that allow a user to defer receiving code
until after the update has been reviewed, we typically recommend always using
the pubkey version of a module. Kernel maintainers will identify critical
modules and wrap them with extra protections. Best practice here is still
evolving! The recommended course of action may change over the next few years.

### The Domain Model

Every module exists in its own domain. The module will receive a seed from the
kernel that is derived using the module's domain. If the module's domain
changes, the seed that it receives will also change.

When a module receives a call from another module, it can see the domain of the
caller and then make decisions based on that domain. Some modules, like
filesystem modules and caching modules, limit access to files or cache elements
based on the domain. The domain essentially determines what data a module is
allowed to save an access, and two modules with different domains will only be
able to access shared data if an API has been created to share that data.

A module's domain is determined by how it is called. A module which is being
accessed by its pubkey will have a different domain than a module which is
being accessed by its code hash. For all practical purposes, a module accessed
by its code hash is a **different** module than the same module being accessed
by its pubkey, even though the APIs will be identical. The APIs are identical,
but the data that populates the module will be different.

Because the kernel has the ability to protect users from rogue updates, we
recommend calling modules by using their pubkeys, rather than their code
hashes. For contexts where security is super important and a module is too
obscure to be overseen by kernel maintainers, we do recommend calling a module
by its hash instead.

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
		aq.accept({ message: "hello " + aq.callerInput.name + "!" })
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
		aq.accept({ message: "hello " + aq.callerInput.name + "!" })
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

### Error Handling

libkmodule and the other Skynet core libraries depart significantly from
idiomatic javascript in how they handle errors. The first major difference is
that libkmodule prefers to return errors in a tuple rather than throw, which
makes all errors explicit and immediate and eliminates any need to use the
try/catch pattern. We largely view try/catch as an anti-pattern, and come from
a background that has taught us that always handling errors immediately pays
wonderful dividends.

The second major difference is that our errors are always of type `string |
null` rather than being of type `Error`. This is because the errors often need
to be immediately sent over postMessage, and the `Error` type cannot be
successfully sent over postMessage. The fact that we can't use the native
`Error` type in many places reinforces our previously mentioned need to always
handle errors immediately, because upon receiving an error you have much less
information about the call stack.

A very common return type is `Promise<errTuple>`. An `errTuple` is a
`[data: any, err: string | null]`, which deconstructs into the return data of
the method plus an error. Typically, if `err` is not `null`, then there will be
no return data. And typically, if there is return data, then `err` will be
`null`.

Here is an example of a `Promise<errTuple>` in action:

```ts
function someCall(): Promise<errTuple> {
	return new Promise((resolve) => {
		if (someBoolean) {
			resolve([someObj, null])
			return
		}
		resolve([{}, "some error"])
	 })
}

async function useSomeCall() {
	let [value, err] = await someCall()
	if (err !== null) {
		// handle error
		return
	}

	// There's no error, continue as normal.
}
```

### Querying Other Modules

#### Basic Calls

The simplest way to query another module is to use `callModule`. When using
callModule, you provide the skylink of the module you wish to query, the method
you wish to call on that module, and an object that represents the input to
that method. The return value of callModule is a `Promise<errTuple>` that
resolves into the module's response.

libkmodule does not have any way itself to know the expected type of the input,
so the type is `any`. The expected input will depend on the module that is
being called, and the method that is being used to call the module. A similar
limitation holds for the output: the output is an `errTuple`, which is a tuple
of some data and an err that can either be a string or null. And while
libkmodule can handle the err, the data portion of the tuple will depend on the
module being called and the method being used.

For our first example, let's call 'secureDownload' on the download module:

```ts
import { callModule } from "libkmodule"

async function secureDownload(downloadLink: string) {
	let exampleFile = "EABNMkgsbEk-kesO3pxH6N5utDhvIhDyACbacQDbWFmuTw"
	let downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw",
	let [result, err] = callModule(downloadModule, "secureDownload", { skylink: exampleFile })
	if (err !== null) {
		console.error(err)
		return
	}
	console.log("We downloaded a file of size", result.fileData.length)
}
```

If you want to use `callModule` in a non-async context:

```ts
import { callModule } from "libkmodule"

let exampleFile = "EABNMkgsbEk-kesO3pxH6N5utDhvIhDyACbacQDbWFmuTw"
let downloadModule = "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw"
callModule(downloadModule, "secureDownload", { skylink: exampleFile })
.then(([result, err]) => {
	if (err !== null) {
		console.error(err)
		return
	}
	console.log("We downloaded a file of size", result.fileData.length)
})
```

You can see the full documentation for the `secureDownload` module and its
methods [here](../../modules/secure-download/README.md).

#### Receiving Updates

###### TODO

### Seed Management

This only works if you have set `onmessage = handleMessage`.

libkmodule provides a global promise named `getSeed` which will resolve to the
unique seed for the module. The seed needs to be provided as a promise because
the module receives the seed asynchronously rather than at startup. This is a
limitation of webworkers, there's no way to pass data at startup, you have to
pass in any data asychronously after the worker launches.

Here is some sample code for getting the seed:

```ts
import { getSeed, handleMessage } from "libkmodule"

onmessage = handleMessage

getSeed.then((seed) => {
	// do something with the seed
})
```

`getSeed` can also be called inside of handlers using async/await:

```ts
import { addHandler, getSeed, handleMessage } from "libkmodule"

// handleSomeMethod handles a call to "someMethod".
async function handleSomeMethod(data: any) {
	let seed = await getSeed // note: use 'getSeed' not 'getSeed()'

	// do other stuff
}
addHandler("someMethod", handleSomeMethod)

onmessage = handleMessage
```

### Unsafe Techniques

We recommend against using these techniques, but if you get stuck or really
need to do something that libkmodule doesn't support by default, these
techniques may be helpful. We encourage you to stop by our discord at
https://discord.gg/skynetlabs before doing anything here to see if there's an
alternate solution.

#### handleMessage Preprocessing

If you need to do some sort of preprocessing or special case handling in the
`onmessage` function, you can wrap `handleMessage`. Note that you can only do
preprocessing, because handleMessage will providing error checking and
automatically responding to the caller if there are issues. A wrapped
handleMessage would look something like this:

```ts
onmessage = function (event: MessageEvent) {
	// perform preprocesing here. This could involve modifying the event object,
	// fully handling certain calls and returning early, or performing other
	// tasks that don't make sense in the context of a handler.

	handleMessage(event)
}
```

This is considered unsafe because the behavior of handleMessage will be
changing over time, and we cannot guarantee that we will not break your module
if you perform handleMessage preprocessing.
