# libkmodule

libkmodule is the main library used for kernel module development, and is the
standard flow that is supported by the developers of the Skynet kernel. It
provides abstractions for communicating with the kernel and for calling out to
other kernel modules.

## Background and Basics

A kernel module is a decentralized API that can be used by other Skynet
programs. You can think of kernel modules as mini private servers that run in
the user's secure cloud and provide APIs to the user's other programs. Similar
to real private servers, the user's programs cannot access the private data or
state of a kernel module, they can only access the data that is exposed through
the module's public API.

One example of a kernel module would be 'profileDAC', which creates an API that
exposes the user's preferred username and profile picutre. profileDAC is
read-only, meaning other modules can freely use profileDAC to access the user's
profile picture but are unable to modify it.

### Why Kernel Modules?

Kernel modules enable data sharing between applications without requiring an
external database or third party API. A profile picture is just one example of
useful data that can be shared across applications. Other examples could
include the elements of the user's social graph, or records of all the content
that the user has posted.

The centralized web keeps user data trapped in silos, which forces users to
redefine their identity on every platform. Even when centralized platforms
create APIs that can be used to access the common data, that API remains
outside of the control of the user, and there is a risk that the API will be
shut down at any time.

Kernel modules create decentralized APIs. The data is always under the control
of the user, and the APIs cannot be shut off unless the user explicitly
consents to them being shut down. This makes these APIs much safer to build
upon and compose for third party developers and entrepreneurs.

By decentralizing user data through kernel modules, we can create an Internet
where every piece of data is usable by every platform and every developer.

### The Module Framework

Kernel modules are webworkers that are hosted inside of the Skynet kernel's
iframe. As a webworker, the module has access to its own private state, and it
has access to network functions like `fetch` and `new WebSocket()`.

Each module serves an API using postMessage. That API is directly connected to
the kernel, and the kernel serves as a middleman between applications and
modules. Because the kernel is in the middle, it can provide guarantees that
all incoming messages are well formed and adhere to the kernel module
specification.

In addition to having access to network functions, modules can use the APIs of
other modules. For example, one module may manage a user's Ethereum wallet, and
another module may use the Ethereum wallet module to manage the user's NFTs.

At startup, each module is provided with a unique seed from the kernel that was
derived from the user's core seed. This seed is private to the module and is
not known or knowable to any other module. This allows modules to safely create
things like blockchain wallets for the user without having to request or know
the user's root seed. The user can have a single seed for themselves, and then
every single one of their applications can have a unique derivative seed for
arbitrary use.

### The Query Model

All API endpoints are structured using a query model. A caller will make a
query to a module, and then the module will respond to that query with a
response.

The query has two fields, a "method" field which has to be a string, and a
"data" field which can be any JSON encodable object. The module will use the
the 'method' field to determine what query is being made, and the 'data'
contains all of the input to that query.

The response has a 'data' object as well as an error. The data object can be
any JSON encodable object, and the err must be either a string or it must be
null. Generally, if the err is not null, the data object is expected to be
empty. Once a response has been made, the query is considered complete and no
further messages can be made related to that query.

Before a response is made, both the caller and the module can send updates. If
the caller sends an update, it is called a 'queryUpdate'. And if the module
sends an update, it is called a 'responseUpdate'. Both the queryUpdate and the
responseUpdate can contain only one field: the data field, which can be any
JSON encodable object. Updates are optional. The caller and the module both can
choose not to send or process updates.

The module itself defines the API that states what the methods are, what inputs
should be provided, and what responses will be made. To be useful, a module
will either need to provide a human readable specification, or it will need to
provide some sort of library for making use of the module.

### The Domain Model

Modules can be called by both webapps (often called Skapps if they use the
Skynet kernel) and by other modules. Every caller has a domain, and that domain
is provided to the module so that the module can perform access control with
its API endpionts.

For example, profileDAC is read-only for most callers, but the webapp
'profiledac.hns' has read-write access. If a user wants to update their profile
picture or change their username, they can navigate to 'profiledac.hns' to make
the change.

For traditional webapps, the domain of the application is used as the domain
within the skynet kernel. For example, if 'spotify.com' started using the
kernel, it would have the domain 'spotify.com' within the kernel.

For decentraliezd webapps, the domain of the application will be the resolved
name of the application. For example, 'profiledac.hns' has an HNS name, and is
potentially being accessed through a portal. That means the full webdomain of
'profiledac.hns' might be 'profiledac.hns.siasky.net' or 'profiledac.hns.to'.
The kernel will do its best to detect when an application is being resolved,
and it will use the fully decentralized name of the application as the domain.
Therefore, both 'profiledac.hns.siasky.net' and 'profiledac.hns.to' will have
the domain 'profiledac.hns' when making queries to modules.

Modules will be given a domain that matches their skylink. Skylinks are usually
46 characters of base64 text, and are encodings of either the hash of the
module code, or the hash of the developer public key. Skylinks that are hashes
of public keys are called "resolver links", and skylinks that are hashes of
file data are called "content links".

If you load a module using its resolver link, the domain of that module will be
its resolver link. It also means that the developer/maintainer of the module
has the ability to update the code for the module at any time. This can be both
good and bad, as updates can include performance improvements and new API
endpoints, but updates could also be malicious updates that steal user data.

Because modules are sandboxed, they can only steal user data that was
previously trusted to that module specifically. Modules that go rogue can't
steal the user's seed, and they can't access the private data of other modules.
Furthermore, the kernel has multiple planned features which will protect users
from modules going rogue.

Best practice today is that all developers call modules using their resolver
links. There are enough security features within the ecosystem to make this
safe, even if module developers go rogue. Best practice is stil evolving, and
may change significantly over the next year.

### Publishing and Deploying Modules

Modules are published by uploading their code to Skynet and then creating a
Skylink for that code. The current standard for publishing modules is to create
a password for the module. That password is used to derive a public key, and
then that public key is used to publish updates to the module code.

If you are using the standard module publication flow, you can publish a module
by calling `npm run deploy`. If you have not published that module before, you
will be prompted to create a password and confirm the password. If you have
published that module before, you will only be prompted to supply the password
for deploying the module.

When first creating a password, two files get created in the module repository.
The first file is a salt, which will be mixed with the password. The second
file is the resolver Skylink of the module, which can be used to verify that
the password is correct. Both the salt and the skylink will be published to the
repository of the module, the password of course will not be published. As long
as the password is secure, this publication process is secure.

This publication process is fully decentralized. There is no central website or
service that is managing the creation and deployment of modules. This is great
for censorship resistance and overall security, but also means that there's no
password recovery feature. If you lose the password to a module, your only
recourse is to create a new public key and tell everyone to migrate to using
the new module. The kernel has features which make migrating between modules
reasonably painless.

Like much of the rest of the Skynet ecosystem, best practice is evolving and
may change significantly over the next year.

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
function handleSayHello(aq: activeQuery) {
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

### Sending Respones Updates

TODO

### Receiving Query Updates

TODO

### Sending Query Updates

TODO

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
