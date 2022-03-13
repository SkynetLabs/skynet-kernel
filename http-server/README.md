# http-server

http-server is a very simple utility that runs an http server which responds to
all requests that come to port 25252. The response is a simple text message,
and is intended to be entirely irrelevant. When run beside the kernel, the
kernel will go signficantly faster when loading crypto/web3 TLDs. It also
provides some increased privacy. This utility is entirely optional, and we do
not expect most users to run the utility.

This utility helps the kernel overcome a limitation of the browser's
onBeforeRequest API - even though web browser extensions are allowed to
intercept and fully replace web requests, if the request went to a server that
does not exist, the page will not load regardless of any logic in
onBeforeRequest.

We get around this in the kernel by setting up a proxy. Requests to imaginary
domains such as 'kernel.skynet' get proxied to centralized servers such as
'siasky.net'. The web extension can't intercept the response until the response
is provided from the server, which adds latency to loading imaginary domains.
There's also a privacy component because which domain is being loaded will get
leaked to that centralized server. This is a rather minimal amount of
information to leak, but is still a privacy issue nonetheless.

If the user is running a server locally on port 25252, the proxy request will
instead use the local server. The result is that there is practically no
latency in loading the imaginary domain, and also no data is getting leaked to
a centralized server.

No configuration is required to get this to work. As soon as the server is
running in the background, the browser extension will start proxying to the
local server.
