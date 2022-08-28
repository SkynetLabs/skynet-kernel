import { objAsString } from "./objAsString.js";

// progressiveFetchResult defines the items that are returned after calling
// progressiveFetch. When progressiveFetch is called, 'fetch' is called
// consecutively on multiple portals, until a portal provides a satisfactory
// response. The 'success' field indicates whether some portal eventually
// returned a successful response.
//
// If 'success' is set to 'true', the 'response' field will contain the
// successful response. Otherwise, 'response' will be null.
//
// The 'portalsFailed' field contains a list of every portal that failed, using
// the hostname of the portal as the string. The 'responsesFailed' field
// contains the failed response from each portal that failed. And the
// 'messagesFailed' field contains the error message from each portal that
// failed, which is acquired by calling `response.clone().text()` on the failed
// response and collecting the result.
//
// There is a 1:1 mapping between the 'portalsFailed', 'responsesFailed', and
// 'messagesFailed' fields, they can be thought of as a tuple. The nth element
// of one field corresponds to the nth element of the other fields.
//
// 'remainingPortals' contains the list of all portals that were not tried, and
// 'logs' contains any log messages that may be useful for debugging.
interface progressiveFetchResult {
  success: boolean;
  portal: string;
  response: Response;
  portalsFailed: string[];
  responsesFailed: Response[]; // Can also be null
  messagesFailed: string[];
  remainingPortals: string[];
  logs: string[];
}

// progressiveFetchMidstate contains all of the information that gets passed to
// the progressiveFetchHelper. The helper is responsible for calling the next
// portal if the current attempt fails.
interface progressiveFetchMidstate {
  endpoint: string;
  fetchOpts: any;
  portalsFailed: string[];
  responsesFailed: Response[]; // Can also be null
  remainingPortals: string[];
  messagesFailed: string[];
  logs: string[];
}

// progressiveFetchHelper is the full progressiveFetch function, split out into
// a helper because the inptus/api is more complicated but only necessary for
// internal use.
function progressiveFetchHelper(pfm: progressiveFetchMidstate, resolve: any, verifyFunction: any) {
  // If we run out of portals, return an error.
  if (pfm.remainingPortals.length === 0) {
    const newLog = "query failed because all portals have been tried";
    pfm.logs.push(newLog);
    resolve({
      success: false,
      portal: null,
      response: null,
      portalsFailed: pfm.portalsFailed,
      responsesFailed: pfm.responsesFailed,
      messagesFailed: pfm.messagesFailed,
      remainingPortals: null,
      logs: pfm.logs,
    });
    return;
  }

  // Grab the portal and query.
  const portal = <string>pfm.remainingPortals.shift();
  const query = portal + pfm.endpoint;

  // Create a helper function for trying the next portal.
  const nextPortal = function (response: Response | null, log: string) {
    if (response !== null) {
      response
        .clone()
        .text()
        .then((t) => {
          pfm.logs.push(log);
          pfm.portalsFailed.push(portal);
          pfm.responsesFailed.push(response);
          pfm.messagesFailed.push(t);
          progressiveFetchHelper(pfm, resolve, verifyFunction);
        });
    } else {
      pfm.logs.push(log);
      pfm.portalsFailed.push(portal);
      pfm.responsesFailed.push(response as any);
      pfm.messagesFailed.push("");
      progressiveFetchHelper(pfm, resolve, verifyFunction);
    }
  };
  // Try sending the query to the portal.
  fetch(query, pfm.fetchOpts)
    .then((response: any) => {
      // Check for a 5XX error.
      if (!("status" in response) || typeof response.status !== "number") {
        nextPortal(response, "portal has returned invalid response\n" + objAsString({ portal, query }));
        return;
      }
      if (response.status < 200 || response.status >= 300) {
        nextPortal(response, "portal has returned error status\n" + objAsString({ portal, query }));
        return;
      }

      // Check the result against the verify function.
      verifyFunction(response.clone()).then((errVF: string | null) => {
        if (errVF !== null) {
          nextPortal(response, "verify function has returned an error from portal " + portal + " - " + errVF);
          return;
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
        });
      });
    })
    .catch((err: any) => {
      // This portal failed, try again with the next portal.
      nextPortal(null, "fetch returned an error\n" + objAsString(err) + "\n" + objAsString(pfm.fetchOpts));
      return;
    });
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
  const portalsCopy = [...portals];
  return new Promise((resolve) => {
    const pfm = {
      endpoint,
      fetchOpts,
      remainingPortals: portalsCopy,
      portalsFailed: [],
      responsesFailed: [],
      messagesFailed: [],
      logs: [],
    };
    progressiveFetchHelper(pfm, resolve, verifyFunction);
  });
}

export { progressiveFetch, progressiveFetchResult };
