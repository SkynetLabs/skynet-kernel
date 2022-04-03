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
