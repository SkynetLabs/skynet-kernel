# secure-registry

secure-registry is a kernel module that allows the user to communicate with the
registry. All responses from the portal are verified using hashes and
signatures.

When you request a read or write on a particular registry entry, the module
will open a subscription with the portal for that registry entry, and keep a
cache of the latest value. Subsequent reads to that entry will be instant.

You can also subscribe to the module to receive updates for a particular
registry entry. When subscribing, the module will return the latest value for
that entry using a 'responseUpdate' message. The module will continue passing
updates to that registry entry using 'responseUpdate' messages until the caller
sends a 'queryUpdate' message requesting that the subscription be closed out.

## Usage

#### registryRead

Input:

Provide the pubkey and datakey of the registry entry you would like to view.

```ts
{
	module: "...TBD...",
	method: "registryRead",
	data: {
		pubkey: <Uint8Array>,
		datakey: <Uint8Array>,
	},
}
```

Output:

```ts
{
	data: <Uint8Array>,
	revision: <bigint>,
}
```

The return value contains the data in the registry along with the revision
number.

#### registryWrite

Input:

Provide the pubkey, datakey, data, revision nubmer, and signature for the
registry entry you would like to write to the network.

```ts
{
	module: "...TBD...",
	method: "registryRead",
	data: {
		pubkey: <Uint8Array>,
		datakey: <Uint8Array>,
		data: <Uint8Array>,
		revision: <bigint>,
		signature: <Uint8Array>,
	},
}
```

Output:

```ts
{
	success: <boolean>,
}
```

The return value is just a boolean indicaating whether the called has succeeded
or failed.

## Building

Use `npm run build` to build and deploy the developer version of the module.
This creates a unique seed for each machine that allows you to run tests
against a full skynet module without having to push unfinished code to prod.

Use `npm run deploy` to build and deploy the production code. A password will
be requested which is required to deploy to prod.

We currently use a password scheme because it is more decentralized. We do not
want a central server that controls the deployment process in the Skynet
ecosystem. Over time, we will be able to add more sophisticated tooling such as
a decentralized 2FA scheme and a decentralized code approval process which
ensures code cannot be shipped to users without some process and oversight.

## Roadmap

We need to update the websocket endpoint to be able to use multiple portals. It
will generally only keep a connection open with a single portal but should be
able to detect a failure and fail over to another portal.
