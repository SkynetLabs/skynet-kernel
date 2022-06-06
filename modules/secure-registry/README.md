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
	entryData: <Uint8Array>,
	revisionNumber: <BigInt>,
}
```

If the entry does not exist, the 'exists' field of the output will be set to
false. This field should always be checked first. If the entry does not exist,
the other fields will be omitted.

If the entry does exists, 'entryData' will contain the binary contents of the
registry entry. 'revisionNumber' will contain the revision number of the
registry entry.

#### overwriteEntry

overwriteEntry will overwrite an existing entry with new data. It will read the
latest revision number and then overwrite the data in the entry with a higher
revision number. This can be destructive! A common bug is accidentally
overwriting newer data with older data. This function is considered unsafe, and
it is recommended to use getsetjson instead for safer data management.

Input:

Provide

###### TODO:

Ergonomics thoughts: we want to make sure that this is easy to use. We also
want this to be a layer where modules can provide any seed that they want.
Therefore the input here should be a seed and a datakey identifier. We'll
handle the privacy bits and we will make it private / unlinked. If you want it
linked, use another structure.

## Roadmap

###### Add support for getsetjson

###### Add support for subscriptions

###### Add cost and performance optimizations
