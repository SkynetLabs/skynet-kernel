// preferredPortals will determine the user's preferred portals by looking in
// localStorage. If no local list of portals is found, the hardcoded default
// list of portals will be set. This function does not check the network.
//
// Even if there is a list of preferred portals in localStorage, this function
// will append the list of default portals to that list (as lower priority
// portals) to increase the chance that a user is able to connect to Skynet.
// This is particularly useful for users who are reviving very old Skynet
// accounts and may have an outdated list of preferred portals. The user's
// kernel can overwrite this function so that the default portals aren't used
// except for bootloading.
//
// TODO: Move this to a different import, probably its own file.
var preferredPortals = function(): string[] {
	// Try to get the list of portals from localstorage. If there is no
	// list, just use the list hardcoded by the extension.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr === null) {
		return defaultPortalList;
	}

	let [portalList, errJSON] = parseJSON(portalListStr);
	if (errJSON !== null) {
		// We log an error but we don't change anything because the
		// data may have been placed there by a future version of the
		// kernel and we don't want to clear anything that might be
		// relevant or useful once the full kernel has finished
		// loading.
		log("error", err, portalListStr);
		return defaultPortalList;
	}

	// Append the list of default portals to the set of portals. In
	// the event that all of the user's portals are bad, they will
	// still be able to connect to Skynet. Because the portals are
	// trust minimized, there shouldn't be an issue with
	// potentially connecting to portals that the user hasn't
	// strictly authorized.
	for (let i = 0; i < defaultPortalList.length; i++) {
		// Check for duplicates between the default list and
		// the user's list. This deduplication is relevant for
		// performance, because lookups will sequentially check
		// every portal until a working portal is found. If
		// there are broken portals duplicated in the final
		// list, it will take longer to get through the list.
		let found = false;
		for (let j = 0; j < portalList.length; j++) {
			if (portalList[j] === defaultPortalList[i]) {
				found = true;
				break;
			}
		}
		if (!found) {
			portalList.push(defaultPortalList[i]);
		}
	}
	return portalList;
}

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
	err: string;
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
			reject({
				err: "all portals have failed",
				portal: null,
				response: null,
				remainingPortals,
			});
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
				err: null,
				portal,
				response,
				remainingPortals,
			})
			return;
		})
		.catch((err) => {
			// Try the next portal.
			log("portal", "error with fetch call\n", portal, "\n", query, "\n", err);
			progressiveFetch(endpoint, fetchOpts, remainingPortals)
			.then(output => resolve(output))
			.catch(err => reject(err));
			return;
		})
	})
}
