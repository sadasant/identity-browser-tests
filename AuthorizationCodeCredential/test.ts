// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AccessToken,
  AuthorizationCodeCredential,
  TokenCredential,
} from "@azure/identity";
import { delay } from "@azure/core-util";
import * as express from "express";
import * as session from "express-session";
import * as puppeteer from "puppeteer";
import * as dotenv from "dotenv";
import { Server } from "http";
import {
  createDefaultHttpClient,
  createHttpHeaders,
  createPipelineRequest,
} from "@azure/core-rest-pipeline";
dotenv.config({ path: `${__dirname}/.env` });

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const serverSecret = process.env.SERVER_SECRET;
const port = process.env.PORT;
const homeUri = `http://localhost:${port}/`;
const redirectUri = `${homeUri}/azureResponse`;
const scope = "https://graph.microsoft.com/.default";

type Closer = () => Promise<void>;
type ExpressRequestWithSession = express.Request & {
  session: {
    username: string;
  };
};
interface UserState {
  loggedIn: boolean;
  azure: {
    accessToken: AccessToken;
    credential: TokenCredential;
  };
}

const database: Record<string, UserState> = {};

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

async function startServer(): Promise<Closer> {
  const app = express();

  // Session management
  app.use(session({ secret: serverSecret }));

  app.get("/logout", async (req: express.Request, res: express.Response) => {
    // IMPORTANT: Not a real scenario.
    const session = (req as ExpressRequestWithSession).session;
    const username = session.username;
    database[username].loggedIn = false;
    delete session.username;
    res.sendStatus(200);
  });

  app.post("/login", async (req: express.Request, res: express.Response) => {
    console.log("/login");
    // IMPORTANT: Not a real scenario.
    const session = (req as ExpressRequestWithSession).session;
    if (session.username) {
      console.error(`Already authenticated username ${session.username}`);
      res.write("User is already authenticated");
      res.sendStatus(500);
      return;
    }
    const username = req.body.username;
    console.log("/login", { username });
    session.username = username;
    database[username].loggedIn = true;
    res.sendStatus(200);
  });

  app.get(
    "/azureLogin",
    async (req: express.Request, res: express.Response) => {
      console.log("/azureLogin");
      const session = (req as ExpressRequestWithSession).session;
      const username = session.username;
      console.log("/azureLogin", { username });
      if (!(username && database[username].loggedIn)) {
        console.error(`Unauthorized username ${session.username}`);
        res.sendStatus(401);
        return;
      }
      res.redirect(
        getAuthorizeUrl(tenantId, clientId, scope, session.username)
      );
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
      if (!(username && database[username].loggedIn)) {
        console.error(`Unauthorized username ${session.username}`);
        res.sendStatus(401);
        return;
      }

      const credential = new AuthorizationCodeCredential(
        tenantId,
        clientId,
        authorizationCode as string,
        redirectUri
      );

      const accessToken = await credential.getToken(scope);

      database[username].azure = {
        credential,
        accessToken,
      };

      res.redirect("/");
    }
  );

  app.get(
    "/me",
    async (req: express.Request, res: express.Response): Promise<void> => {
      const session = (req as ExpressRequestWithSession).session;
      const username = session.username;
      if (
        !(
          username &&
          database[username].loggedIn &&
          database[username].azure?.accessToken
        )
      ) {
        console.error(`Unauthorized username ${session.username}`);
        res.sendStatus(401);
        return;
      }
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

  app.get("/", (req: express.Request, res: express.Response) => {
    res.end(`
      <html>
      <body>Hello.</body>
      <script>
      window.login = () => {
        const body = new FormData();
        body.set("username", "myUsername");
        return fetch('${homeUri}/login', { method: 'POST', body });
      }
      window.azureLogin = () => {
          window.location = "${homeUri}azureLogin";
      }
      window.me = () => fetch('${homeUri}/me');
      window.onclick = () => fetch('${homeUri}/logout');
      </script>
      </html>
  `);
  });

  const server = app.listen(port, () =>
    console.log(`Authorization code redirect server listening on port ${port}`)
  );

  return async () => {
    server.close();
  };
}

async function startClient() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log("Going to", homeUri);
  await page.goto(homeUri);
  const page1Result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const w = window as any;
        w.login().then((loginResult) => {
          resolve({ loginResult });
          w.azureLogin();
        });
      })
  );
  console.log({ page1Result });
  await delay(1000);
  const page2Result = await page.evaluate(
    () => (window as any).document.body.innerHTML
  );
  console.log({ page2Result });
  return async () => {};
}

async function main() {
  const serverCloser = await startServer();
  const clientCloser = await startClient();
  await clientCloser();
  await serverCloser();
}

main().catch(console.error);
