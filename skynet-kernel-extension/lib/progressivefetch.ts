// progressiveFetchLegacy will query multiple portals until one returns with
// the correct response. If there is a success, it will call the success
// callback. If all of the portals fail, it will call the failure callback.
//
// TODO: Remove this function entirely once all of the users have been updated
// to use the new progressiveFetch.
var progressiveFetchLegacy = function(endpoint: string, fetchOpts: any, portals: string[], resolveCallback: any, rejectCallback: any) {
	if (portals.length === 0) {
		log("progressiveFetch", "progressiveFetch failed because all portals have been tried", endpoint, fetchOpts);
		rejectCallback("no more portals available");
		return;
	}

	// Try the next portal in the array.
	let portal = portals.shift();
	let query = "https://" + portal + endpoint;
	fetch(query, fetchOpts)
	.then(response => {
		// Success! Handle the response.
		log("allFetch", "fetch returned successfully", query, "::", response);
		resolveCallback(response, portals);
	})
	.catch((error) => {
		// Try the next portal.
		log("portal", query, "::", error);
		progressiveFetchLegacy(endpoint, fetchOpts, portals, resolveCallback, rejectCallback)
	})
}

// ProgressiveFetchResult defines the type returned by progressiveFetch.
interface ProgressiveFetchResult {
	portal: string;
	response: Response;
	remainingPortals: string[];
}

// progressiveFetch will query multiple portals until one returns with the
// correct response.
var progressiveFetch = function(endpoint: string, fetchOpts: any, remainingPortals: string[]): Promise<ProgressiveFetchResult> {
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
			return;
		})
		.catch((err) => {
			// This portal failed, try again with the next portal.
			log("portal", "error with fetch call\n", portal, "\n", query, "\n", err);
			progressiveFetch(endpoint, fetchOpts, remainingPortals)
			.then(output => resolve(output))
			.catch(err => reject(err));
			return;
		})
	})
}
