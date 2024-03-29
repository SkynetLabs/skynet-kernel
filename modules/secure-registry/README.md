# secure-registry

secure-registry is a kernel module that enables interaction with the registry.
All registry entries that are provided are verified cryptographically, which
eliminates several types of abuse that the portal can commit against the user.

## Usage

#### readEntry

Input:

Provide the public key and the data key of the registry entry you wish to read.

```ts
{
	module: "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q",
	method: "readEntry",
	data: {
		publicKey: <Uint8Array>,
		dataKey: <Uint8Array>,
	},
}
```

Output:

```ts
{
	exists: <boolean>,
	deleted?: <boolean>,
	entryData?: <Uint8Array>,
	revision?: <BigInt>,
}
```

If the entry does not exist, the 'exists' field of the output will be set to
false. This field should always be checked first. If the entry does not exist,
the other fields will be omitted.

'deleted' will be set to true if the registry entry exists, but currently has a
value that indicates the data was deleted. If 'deleted' is set to true, a
revision number will be provided, but no entryData will be provided.

If the entry exists and has not been deleted, 'entryData' will contain the
binary contents of the registry entry.

#### writeEntry

writeEntry will write a new registry entry using a provided revision number.
writeEntry is potentially unsafe, the caller should ensure that they have set a
revision number that matches the most recent data that they have read.

It is generally not recommended to use writeEntry directly. Instead, callers
should use a library that wraps writeEntry with safety mechanisms.

Input:

The inputs include a keypair, the data key, the data itself, and a revision
number. The module will perform the signing and uploading.

```ts
{
	module: "AQCovesg1AXUzKXLeRzQFILbjYMKr_rvNLsNhdq5GbYb2Q",
	method: "writeEntry",
	data: {
		publicKey: <Uint8Array>,
		secretKey: <Uint8Array>,
		dataKey: <Uint8Array>,
		entryData: <Uint8Array>,
		revision: <BigInt>,
	},
}
```

Output:

```ts
{
	entryID: <Uint8Array>,
}
```

The output is the entryID of the registry entry that got written.

## Roadmap

###### Add support for getsetjson

###### Add support for subscriptions

###### Add cost and performance optimizations
