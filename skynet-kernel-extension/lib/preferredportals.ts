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
var preferredPortals = function(): string[] {
	// Try to get the list of portals from localstorage. If there is no
	// list, just use the list hardcoded by the extension.
	let portalListStr = window.localStorage.getItem("v1-portalList");
	if (portalListStr === null) {
		// We can't return the default list directly because it may be
		// modified by the caller. Instead we return a copy.
		return Object.assign([], defaultPortalList);
	}
	let [portalList, errJSON] = parseJSON(portalListStr);
	if (errJSON !== null) {
		// We log an error but we don't change anything because the
		// data may have been placed there by a future version of the
		// kernel and we don't want to clear anything that might be
		// relevant or useful once the full kernel has finished
		// loading.
		log("error", err, portalListStr);
		return Object.assign([], defaultPortalList);
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

// processUserPortalPreferences will process the result of a call to
// downloadSkylink which fetches the user's portal preferences.
var processUserPortalPreferences = function(output: downloadSkylinkResult) {
	// In the event of a 404, we want to store the default list as the set
	// of user's portals. We do this so that subsequent kernel iframes that
	// the user opens don't need to go to the network as part of the
	// startup process. The full kernel will set the localStorage item to
	// another value when the user selects portals.
	if (output.response.status === 404) {
		window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
		log("lifecycle", "user portalList set to the default list after getting 404 on registry lookup");
	} else {
		// TODO: Need to parse the data and correctly set the user's
		// portal list. Actually setting the user's portal preferences
		// list should be done by the full kernel, so this won't be
		// able to be updated until we have a full kernel.
		window.localStorage.setItem("v1-portalList", JSON.stringify(defaultPortalList));
		log("error", "user portalList set to the default list after getting a response but not bothering to check it");
	}
}

// initUserPortalPreferences will block until the user's portal preferences
// have been loaded. If a set of preferneces already exist in localStorage,
// those get used. If not, we try to fetch the user's portal preferences from
// the network.
var initUserPortalPreferences = function(): Promise<void> {
	return new Promise((resolve, reject) => {
		// Try to get the list of portals from localstorage. If the
		// list already exists, we don't need to fetch the list from
		// the network.
		let portalListStr = window.localStorage.getItem("v1-portalList")
		if (portalListStr !== null) {
			resolve()
			return
		}

		// Derive the resolver link where the user's portal preferences
		// are expected to be stored.
		let [skylink, errDRL] = deriveResolverLink("v1-skynet-portal-list", "v1-skynet-portal-list-datakey")
		if (errDRL !== null) {
			reject(addContextToErr(errDRL, "unable to get resolver link for users portal prefs"))
			return
		}
		// Download the user's portal preferences from Skynet.
		downloadSkylink(skylink)
		.then(output => {
			processUserPortalPreferences(output)
			resolve()
		})
		.catch(err => {
			log("lifecycle", "unable to load the users list of preferred portals", err)
			resolve()
		});
	})
}
