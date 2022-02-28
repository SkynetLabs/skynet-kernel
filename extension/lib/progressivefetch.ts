// progressiveFetchResult defines the type returned by progressiveFetch.
interface progressiveFetchResult {
	portal: string;
	response: Response;
	remainingPortals: string[];
	first4XX: progressiveFetchResult;
}

// progressiveFetch will query multiple portals until one returns with a
// non-error response. In the event of a 4XX response, progressiveFetch will
// keep querying additional portals to try and find a working 2XX response. In
// the event that no working 2XX response is found, the first 4XX response will
// be returned.
//
// This introduces significant latency overheads, especially for 404 responses.
// Future updates to this function could handle 404 responses by looking at a
// bunch of host signatures to be confident in the portal's response rather
// than going on and asking a bunch more portals.
//
// The reason that we don't blindly accept a 4XX response from a portal is that
// we have no way of verifying that the 4XX is legitimate. We don't trust the
// portal, and we can't give a rogue portal the opportunity to interrupt our
// user experience simply by returning a dishonest 404. So we need to keep
// querying more portals and gain confidence that the 404 a truthful response.
var progressiveFetch = function(endpoint: string, fetchOpts: any, remainingPortals: string[], first4XX: progressiveFetchResult): Promise<progressiveFetchResult> {
	return new Promise((resolve, reject) => {
		// If we run out of portals and there's no 4XX response, return
		// an error.
		if (!remainingPortals.length && first4XX == null) {
			log("lifecycle", "progressiveFetch failed because all portals have been tried\n", endpoint, "\n", fetchOpts, "\n", remainingPortals)
			reject(new Error("no portals remaining"))
			return
		}
		// If we run out of portals but there is a first 4XX response,
		// return the 4XX response.
		if (!remainingPortals.length) {
			resolve(first4XX)
			return
		}

		// Grab the portal and query.
		let portal = remainingPortals.shift()
		let query = "https://" + portal + endpoint

		// Define a helper function to try the next portal in the event
		// of an error, then perform the fetch.
		let nextPortal = function() {
			progressiveFetch(endpoint, fetchOpts, remainingPortals, first4XX)
			.then(output => resolve(output))
			.catch(err => reject(err))
		}
		fetch(query, fetchOpts)
		.then(response => {
			// Check for a 5XX error.
			if (!("status" in response) || typeof(response.status) !== "number") {
				log("portal", "portal has returned invalid response\n", portal, "\n", query, "\n", response)
				nextPortal()
				return
			}
			if (response.status >= 500 && response.status < 600) {
				log("portal", "portal has returned 5XX status\n", portal, "\n", query, "\n", response)
				nextPortal()
				return
			}
			// Special handling for 4XX. If we already have a
			// 'first4XX', we treat this call similarly to the 5XX
			// calls. If we don't yet have a 4XX, we need to create
			// a progressiveFetchResult object that serves as our
			// first 4XX and pass that to our next call to
			// progressiveFetch.
			if (response.status >= 400 && response.status < 500) {
				log("portal", "portal has returned 4XX status\n", portal, "\n", query, "\n", response)
				if (first4XX !== null) {
					nextPortal()
					return
				}

				// Define 'new4XX' as our first4XX response can
				// call progressiveFetch.
				let new4XX = {
					portal,
					response,
					remainingPortals,
					first4XX: null,
				}
				progressiveFetch(endpoint, fetchOpts, remainingPortals, new4XX)
				.then(output => resolve(output))
				.catch(err => reject(err))
			}

			// Success! Resolve the response.
			log("allFetch", "fetch returned successfully\n", query, "\n", response)
			resolve({
				portal,
				response,
				remainingPortals,
				first4XX,
			})
		})
		.catch((err) => {
			// This portal failed, try again with the next portal.
			log("portal", "error with fetch call\n", portal, "\n", query, "\n", err)
			nextPortal()
		})
	})
}
