# Skynet Module Template

This folder contains the template for creating a new Skynet Kernel module.

### Building and Deploying

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
set a password. The password should be a secure password (more than 90 bits of
entropy), as anyone who is able to guess the password will be able to deploy
changes to production.

Modules use a password based deploy system beacuse it allows module deployment
to be fully decentralized. There is no central manager of modules that can make
changes to the code that is in production. This also means there is no way to
reset passwords or perform account recovery if a password is lost. If a
password does get lost, the developer needs to redeploy using a new resolver
skylink for the module, and then needs to tell everyone to update their
depednecies.
