// progressiveFetchResult defines the type returned by progressiveFetch.
interface progressiveFetchResult {
	portal: string;
	response: Response;
	remainingPortals: string[];
}

// progressiveFetch will query multiple portals until one returns with a
// non-error response. Note that 4XX calls are not considered errors.
var progressiveFetch = function(endpoint: string, fetchOpts: any, remainingPortals: string[]): Promise<progressiveFetchResult> {
	return new Promise((resolve, reject) => {
		if (!remainingPortals.length) {
			log("lifecycle", "progressiveFetch failed because all portals have been tried\n", endpoint, "\n", fetchOpts, "\n", remainingPortals);
			reject(new Error("no portals remaining"));
			return;
		}

		// Grab the portal and query.
		let portal = remainingPortals.shift();
		let query = "https://" + portal + endpoint;

		// Define a helper function to try the next portal in the event
		// of an error.
		let nextPortal = function() {
			progressiveFetch(endpoint, fetchOpts, remainingPortals)
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

			// Success! Resolve the resonse.
			log("allFetch", "fetch returned successfully\n", query, "\n", response);
			resolve({
				portal,
				response,
				remainingPortals,
			})
		})
		.catch((err) => {
			// This portal failed, try again with the next portal.
			log("portal", "error with fetch call\n", portal, "\n", query, "\n", err);
			nextPortal()
		})
	})
}
