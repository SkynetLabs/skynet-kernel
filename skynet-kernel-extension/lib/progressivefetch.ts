// progressiveFetchResult defines the type returned by progressiveFetch.
interface progressiveFetchResult {
	portal: string;
	response: Response;
	remainingPortals: string[];
}

// progressiveFetch will query multiple portals until one returns with the
// correct response.
var progressiveFetch = function(endpoint: string, fetchOpts: any, remainingPortals: string[]): Promise<progressiveFetchResult> {
	return new Promise((resolve, reject) => {
		if (!remainingPortals.length) {
			log("progressiveFetch", "progressiveFetch failed because all portals have been tried\n", endpoint, "\n", fetchOpts);
			reject(new Error("no portals remaining"));
			return;
		}

		// Try the next portal in the array.
		let portal = remainingPortals.shift();
		let query = "https://" + portal + endpoint;
		fetch(query, fetchOpts)
		.then(response => {
			// Success! Handle the response.
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
			progressiveFetch(endpoint, fetchOpts, remainingPortals)
			.then(output => resolve(output))
			.catch(err => reject(err));
		})
	})
}
