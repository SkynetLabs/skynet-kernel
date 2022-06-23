# secure-download

secure-download is a kernel module that provides downloading functionality. The
data that is received from the portal is verified before being served to the
user. If the portal tries to cheat or returns a file that does not match the
hash, the module will try another portal or return an error.

NOTE: secure-download currently only handles files that fully fit into a base
sector.

secure-download is a fully trustless module.

## Usage

#### secureDownload

Input:

Provide the skylink of the file you are downloading.

```ts
{
	module: "AQCIaQ0P-r6FwPEDq3auCZiuH_jqrHfqRcY7TjZ136Z_Yw",
	method: "secureDownload",
	data: {
		skylink: <string>,
	},
}
```

Output:

```ts
{
	fileData: <Uint8Array>,
}
```

Currently only the fileData is returned. At some point we may add metadata
fields to the return value as well.
