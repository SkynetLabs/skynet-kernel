// progressiveFetchResult lists the items that are returned after calling
// progressiveFetch. The 'portal' field indicates the portal that returned the
// provided response. 'responsesFailed' contains any responses from portals
// that returned a failed response (4XX, 5XX, or other), so that if there was a
// user error the caller can handle it effectively. 'remainingPortals' contains
// a list of portals that haven't been tried yet from the original response (in
// case the provided response ends up being unacceptable), and 'logs' contains
// a list of any log messages that might be worth reporting to the user.
interface progressiveFetchResult {
	success: boolean
	portal: string
	response: Response
	portalsFailed: string[]
	responsesFailed: Response[] // Can also be null
	messagesFailed: string[]
	remainingPortals: string[]
	logs: string[]
}

// progressiveFetchMidstate contains all of the information that gets passed to
// the progressiveFetchHelper.
interface progressiveFetchMidstate {
	endpoint: string
	fetchOpts: any
	portalsFailed: string[]
	responsesFailed: Response[] // Can also be null
	remainingPortals: string[]
	messagesFailed: string[]
	logs: string[]
}

// progressiveFetchHelper is the full progressiveFetch function, split out into
// a helper because the inptus/api is more complicated but only necessary for
// internal use.
function progressiveFetchHelper(pfm: progressiveFetchMidstate, resolve: any, verifyFunction: any) {
	// If we run out of portals, return an error.
	if (pfm.remainingPortals.length === 0) {
		let newLog = "query failed because all portals have been tried\n" + JSON.stringify(pfm)
		pfm.logs.push(newLog)
		resolve({
			success: false,
			portal: null,
			response: null,
			portalsFailed: pfm.portalsFailed,
			responsesFailed: pfm.responsesFailed,
			remainingPortals: null,
			logs: pfm.logs,
		})
		return
	}

	// Grab the portal and query.
	let portal = <string>pfm.remainingPortals.shift()
	let query = "https://" + portal + pfm.endpoint

	// Create a helper function for trying the next portal.
	let nextPortal = function (response: Response | null, log: string) {
		if (response !== null) {
			response
				.clone()
				.text()
				.then((t) => {
					pfm.logs.push(log)
					pfm.portalsFailed.push(portal)
					pfm.responsesFailed.push(response)
					pfm.messagesFailed.push(t)
					progressiveFetchHelper(pfm, resolve, verifyFunction)
				})
		} else {
			pfm.logs.push(log)
			pfm.portalsFailed.push(portal)
			pfm.responsesFailed.push(response as any)
			pfm.messagesFailed.push("")
			progressiveFetchHelper(pfm, resolve, verifyFunction)
		}
	}
	// Try sending the query to the portal.
	fetch(query, pfm.fetchOpts)
		.then((response: any) => {
			// Check for a 5XX error.
			if (!("status" in response) || typeof response.status !== "number") {
				nextPortal(response, "portal has returned invalid response\n" + JSON.stringify({ portal, query }))
				return
			}
			if (response.status < 200 || response.status >= 300) {
				nextPortal(response, "portal has returned error status\n" + JSON.stringify({ portal, query }))
				return
			}

			// Check the result against the verify function.
			verifyFunction(response.clone()).then((errVF: string | null) => {
				if (errVF !== null) {
					nextPortal(response, "verify function has returned an error from portal " + portal + " - " + errVF)
					return
				}

				// Success! Return the response.
				resolve({
					success: true,
					portal,
					response,
					portalsFailed: pfm.portalsFailed,
					responsesFailed: pfm.responsesFailed,
					remainingPortals: pfm.remainingPortals,
					messagesFailed: pfm.messagesFailed,
					logs: pfm.logs,
				})
			})
		})
		.catch((err: any) => {
			// This portal failed, try again with the next portal.
			nextPortal(null, "fetch returned an error\n" + JSON.stringify(err) + JSON.stringify(pfm.fetchOpts))
			return
		})
}

// progressiveFetch will query multiple portals until one returns with a
// non-error response. In the event of a 4XX response, progressiveFetch will
// keep querying additional portals to try and find a working 2XX response. In
// the event that no working 2XX response is found, the first 4XX response will
// be returned.
//
// If progressiveFetch returns a 2XX response, it merely means that the portal
// returned a 2XX response. progressiveFetch cannot be confident that the
// portal has returned a correct/honest message, the verification has to be
// handled by the caller. The response (progressiveFetchResult) contains the
// list of portals that progressiveFetch hasn't tried yet. In the event that
// the 2XX response is not correct, the progressiveFetchResult contains the
// list of failover portals that have not been used yet, allowing
// progressiveFetch to be called again.
//
// This progressive method of querying portals helps prevent queries from
// failing, but if the first portal is not a good portal it introduces
// substantial latency. progressiveFetch does not do anything to make sure the
// portals are the best portals, it just queries them in order. The caller
// should make a best attempt to always have the best, most reliable and
// fastest portal as the first portal in the list.
//
// The reason that we don't blindly accept a 4XX response from a portal is that
// we have no way of verifying that the 4XX is legitimate. We don't trust the
// portal, and we can't give a rogue portal the opportunity to interrupt our
// user experience simply by returning a dishonest 404. So we need to keep
// querying more portals and gain confidence that the 404 a truthful response.
function progressiveFetch(
	endpoint: string,
	fetchOpts: any,
	portals: string[],
	verifyFunction: any
): Promise<progressiveFetchResult> {
	let portalsCopy = [...portals]
	return new Promise((resolve) => {
		let pfm = {
			endpoint,
			fetchOpts,
			remainingPortals: portalsCopy,
			portalsFailed: [],
			responsesFailed: [],
			messagesFailed: [],
			logs: [],
		}
		progressiveFetchHelper(pfm, resolve, verifyFunction)
	})
}

export { progressiveFetch }
