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

## Building

Use `npm run build` to build and deploy the developer version of the module.
This creates a unique seed for each machine that allows you to run tests
against a full skynet module without having to push unfinished code to prod.

Use `npm run deploy` to build and deploy the production code. A password will
be requested which is required to deploy to prod.

If this is the first time you have called 'npm run deploy' for this module, you
will be asked to create a password. Use a secure password! If someone can guess
your password, they can deploy any code they want to your users.

We currently use a password scheme because it is more decentralized. We do not
want a central server that controls the deployment process in the Skynet
ecosystem. Over time, we will be able to add more sophisticated tooling such as
a decentralized 2FA scheme and a decentralized code approval process which
ensures code cannot be shipped to users without some process and oversight.
