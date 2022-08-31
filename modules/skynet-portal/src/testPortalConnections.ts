// testPortalConnections.ts defines the test that will check which portals are
// connectable and which endpoints are working on each portal.

import { SkynetPortal } from "libskynet";

// PortalConnectionTest defines the object that gets filled out after a portal
// connection test has completed.
interface PortalConnectionTest {
  portal: SkynetPortal;

  // We will add a field for each endpoint, and potentially metrics
  // information.
}

// testPortalConnection runs tests on a portal and reports which endpoints
// appear to be working.
async function testPortalConnection(portal: SkynetPortal): Promise<PortalConnectionTest> {
  return new Promise((resolve) => {
    resolve({
      portal,
    });
  });
}

export { PortalConnectionTest, testPortalConnection };
