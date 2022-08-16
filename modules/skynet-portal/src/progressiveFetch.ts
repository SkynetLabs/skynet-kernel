/*
import { objAsString } from "libkmodule"

// TODO: Pick up by changing the progressiveFetch function to not have a helper
// or a midstate, and instead coordinate all of the responses and such from the
// main function. I think the helper was a result of prior lack of knowledge of
// how the javascript thread model worked.

// PortalChoice represents a choice in portal that a progressiveFetch call can
// make. It has the url for the portal as a string, the desired timeout for the
// portal as a number (in milliseconds), and the trustworthiness of the portal
// as a number (between 0 and 1).
//
// progressiveFetch receives an array of PortalChoice objects, and will try
// them one at a time, in the order they are presented. The next portal will be
// tried when the current portal provides an unacceptable response, or when
// 'defaultTimeout' is hit.
interface PortalChoice {
  name: string;
  defaultTimeout: number;
}

// FailedResponse contains parts of a failed response. 'portalName' indicates
// the name of the portal that failed, 'response' contains the failed response,
// and 'message' contains the result of calling `response.clone().text()` on
// the response.
interface FailedResponse {
  portalName: string;
  response: Response;
  messsage: string;
}

// ProgressiveFetchResult defines the items that are returned after calling
// progressiveFetch. When progressiveFetch is called, 'fetch' is potentially
// called on multiple portals, until a portal provides a satisfactory response.
// Typically, just one portal is called at a time, but if one portal is taking
// too long to respond or other heuristics indicate that another portal should
// be called, multiple portals may be queried at once.
//
// If 'success' is set to 'true', the 'response' field will contain the
// successful response. Otherwise, the 'response' field will be null.
//
// 'failedResponses' will only contain elements if 'success' is set to false,
// it will contain the responses and messages from all of the portals that did
// not succeed.
interface ProgressiveFetchResult {
  success: boolean;
  portal: string;
  response: Response;
  failedResponses: FailedResponse[];
  logs: string[];
}

// VerifyFunction defines the call signature for the function that verifies the
// response to an api call. progressiveFetch can query a portal and get a
// response, but because each endpoint is different progressiveFetch is not
// smart enough to know whether the portal is lying or not with its response.
// progressiveFetch will instead call VerifyFunction, which will verify the
// response from the portal.
//
// The return value is an error, which should be 'null' if the response is
// valid, and a boolean that can request a second opinion. If a second opinion
// is requested, progressiveFetch will attempt to get a response from another
// portal to verify that the response from the first portal was valid.
//
// The second opinion is only needed in some cases. For example, if a portal
// returns a 404 when looking up a file, that is actually something that the
// portal could be lying about. By requesting a secondOpinion, we can verify
// that the portal is not lying, or at least verify that multiple portals are
// telling the same lie.
//
// NOTE: a second opinion
//
//  TODO: Ergonomics of the second opinion are not good.
type VerifyFunction = (response: Response) => [error: Err, secondOpinion: boolean]

// progressiveFetch is a function that takes multiple portals as inputs, and
// then attempts to call the endpoints on every single portal. It tries the
// portals one at a time, waiting for either a response or a timeout before
// moving on to the next portal. When there is a success, it stops trying new
// portals unless it needs to perform verification.
//
// The verifyFunction 
function progressiveFetch(
  endpoint: string,
  fetchOpts: any,
  portals: PortalChoice[],
  verifyFunction: any,
  failureNotification: any
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

// progressiveFetchMidstate contains all of the information that gets passed to
// the progressiveFetchHelper. The helper is responsible for managing timeouts,
// failover, and response handling.
//
// TODO: Probably re-writing this.
interface progressiveFetchMidstate {
  endpoint: string;
  fetchOpts: any;
  portalsFailed: string[];
  responsesFailed: Response[];
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
      nextPortal(null, "fetch returned an error\n" + objAsString(err) + objAsString(pfm.fetchOpts));
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
//
// TODO: Add a handleFailure() function, which will be called for any failed
// responses, so that the portal in question can be updated with new
// heuristics.
function progressiveFetch(
  endpoint: string,
  fetchOpts: any,
  portals: PortalChoice[],
  verifyFunction: any,
  failureNotification: any
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
*/
