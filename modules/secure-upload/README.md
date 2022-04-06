# secure-upload

secure-upload is a kernel module that provides uploading functionality. The
final skylink of the file is computed before uploading to the kernel, which
means that the user is guaranteed that the data in the skylink matches the
intended upload, the portal cannot cheat here.

secure-upload does trust the portal to properly custody the file on Sia. If the
portal decides to delete the file, the file may unexpectedly become unavailable
on Skynet. The portal cannot however modify the data, any modifcations will be
ignored.

## Usage

#### secureUpload

Input:

```ts
{
	module: "AQD1kFeJJhRnkgWGD-ws6V1QITQrHd2WX5pQnU78MM_o3Q",
	method: "secureUpload",
	data: {
		filename: <string>,
		fileData: <Uint8Array>,
	},
}
```

Output:

```ts
{
	skylink: <immutable skylink>,
}
```

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
