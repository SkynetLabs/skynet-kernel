# Skynet Module Template

This folder contains the template for creating a new Skynet Kernel module. The
template contains one example API endpoint with documentation, and it contains
build scripts for deploying the module plus instructions for using the build
scripts.

## Usage

### repeatMessage

repeatMessage is an example API that repeats an input message back to the
caller. It will prepend a "got message: " string

###### Input:

Provide an input called 'message' to receive a response.

```ts
{
	module: "<change me>",
	method: "repeatMessage",
	data: {
		message: <string>,
	},
}
```

###### Output:

```ts
{
	resp: <string>,
}
```

The output contains a field called 'resp' which contains a modified version of
the provided message.

## Building and Deploying

The build and deploy scripts are ready to use. Copy the files, update
`package.json` then run `npm install` and `npm run build` to get started. The
build script will output a resolver skylink that you can use to try out your
module in a testing environment.

The resolver skylink is unique to each clone of the repsitory. This allows
multiple developers to work on the same module at the same time, and test their
changes in production without stepping on each other's toes.

To deploy the module to production, run `npm run deploy`. All clones of the
repository will have the **same** resolver skylink for the deploy process,
meaning any developer that knows the deployment password can push changes into
production.

If the module has never been deployed before, `npm run deploy` will ask you to
set a password. The password should be a secure password (more than 100 bits of
entropy), as anyone who is able to guess the password will be able to deploy
changes to production.

Modules use a password based deploy system beacuse it allows module deployment
to be fully decentralized. There is no central manager of modules that can make
changes to the code that is in production. This also means there is no way to
reset passwords or perform account recovery if a password is lost. If a
password does get lost, the developer needs to redeploy using a new resolver
skylink for the module, and then needs to tell everyone to update their
depednecies.

## Best Practices

One should avoid sending more than one 'response' message. If you are using
libkmodule, this means you should take care to only make one call to either
aq.reject or aq.respond. To minimize the chance of sending two responses,
responses should only be made in functions with a the prefix 'handle'. If
within the 'handle' function you call another function that is expected to
provide a response, that function should also have the 'handle' prefix. This
makes it easier for code reviewers (and linters) to verify that your code is
not at risk of sending two responses.

One should define a new type in Typescript for every message that gets sent or
received in a module's API. Especially when development is rapid, documentation
can fall behind. If everything is typed, the type system can add least add
another layer of readability to the documentation, and reduce errors caused by
the sender and receiver being out of sync around the latest version of a type.
