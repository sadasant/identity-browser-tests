// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
  AuthorizationCodeCredential,
  TokenCredential,
} from "@azure/identity";
import {
  createDefaultHttpClient,
  createHttpHeaders,
  createPipelineRequest,
} from "@azure/core-rest-pipeline";
import { delay } from "@azure/core-util";
import { prepareServer } from "./server";

// This test shows how to authenticate a Node.js web server using the AuthorizationCodeCredential.
// Throughout this document, we'll point out to the challenges of the existing approach with comment sections
// that will begin with "CHALLENGE", for example:
//
//     CHALLENGE:
//     <explanation-of-the-challenge>
//

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const serverSecret = process.env.SERVER_SECRET;
const port = process.env.PORT;
const redirectUri = `${homeUri}/azureResponse`;
const scope = "https://graph.microsoft.com/.default";

// The Azure Active Directory app registration should be of the type
// "web" and the redirect endpoint should point to:
const homeUri = `http://localhost:${port}/`;

// CHALLENGE:
// The current package @azure/identity does not have a way to retrieve the authorize URL.

function getAuthorizeUrl(
  tenantId: string,
  clientId: string,
  scopes: string,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: scopes,
    state,
  });
  const query = params.toString();
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${query}`;
}
 
test("Authenticates", async ({ page }) => {
  const { app, extractUsername, checkLoggedIn, saveAzureState, start, close } = await prepareServer({ serviceSecret });

  /**
   * Begins the authentication process with Azure.
   */
  app.get(
    "/azureLogin",
    async (req: express.Request, res: express.Response) => {
      const username = extractUsername(req);
      checkLoggedIn(username);

      const authorizeUrl = getAuthorizeUrl(
        tenantId,
        clientId,
        scope,
        session.username
      );
      console.log({ authorizeUrl });

      res.redirect(authorizeUrl);
    }
  );
 
  app.get(
    "/azureResponse",
    async (req: express.Request, res: express.Response): Promise<void> => {
      // The redirect will either contain a "code" or an "error"
      const authorizationCode = req.query["code"];
      if (!authorizationCode) {
        throw new Error(
          `Authentication Error "${req.query["error"]}":\n\n${req.query["error_description"]}`
        );
      }

      const username = req.query["state"] as string;
      checkLoggedIn(username);

      const credential = new AuthorizationCodeCredential(
        tenantId,
        clientId,
        authorizationCode as string,
        redirectUri
      );

      const accessToken = await credential.getToken(scope);
      saveAzureState({ credential, accessToken, eror });

      res.redirect("/");
    }
  );

  /**
   * Sends a request to Azure's /me
   */
  app.get(
    "/me",
    async (req: express.Request, res: express.Response): Promise<void> => {
      const username = extractUsername(req);
      checkLoggedIn(username);

      const request = createPipelineRequest({
        url: "https://graph.microsoft.com/v1.0/me",
        method: "GET",
        headers: createHttpHeaders({
          Authorization: `Bearer ${database[username].azure?.accessToken.token}`,
        }),
      });

      const client = createDefaultHttpClient();
      const response = await client.sendRequest(request);
      console.log({ response });

      res.sendStatus(response.status);
    }
  );

  await start();

  // Log and continue all network requests
  await page.route('**', route => {
    console.log(route.request().url());
    route.continue();
  });

  // Authenticates on the test server
  console.log loginResponse = await page.goto(`${homeUri}login?username=testuser`);
  console.log({ loginResponse });

  // Authenticates on the test server
  await page.goto(`${homeUri}azureLogin`);

  const dimensions = await page.evaluate(() => {
    return {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      deviceScaleFactor: window.devicePixelRatio
    }
  });
  console.log(dimensions);
}); 
