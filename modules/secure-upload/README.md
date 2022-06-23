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

Provide the name of the file you are uploading and the data for the file.
Directory uploads are not supported by the secureUpload call.

```ts
{
	module: "AQAT_a0MzOInZoJzt1CwBM2U8oQ3GIfP5yKKJu8Un-SfNg",
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

The skylink that gets returned is the skylink of the file that was uploaded.
secureUpload will verify the skylink locally, ensuring that the user receives a
trustworthy skylink.
