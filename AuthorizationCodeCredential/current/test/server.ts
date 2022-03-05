// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AccessToken, TokenCredential } from "@azure/core-auth";
import * as express from "express";
import { Server } from "http";
import * as session from "express-session";

// A simple web server that allows passing configuration and behavioral parameters.
// This file should be thought as the archetypicall representation of a web server,
// whereas the test file will include the nuance specific to testing the desired behavior.

/**
 * Simplified type representing an Express request with a session.
 */
type ExpressRequestWithSession = express.Request & {
  session: {
    username: string;
  };
};

/**
 * Representative of the state relative to the Azure authentication
 */
export interface AzureState {
  accessToken?: AccessToken;
  credential?: TokenCredential;
}

/**
 * Simple representation of in-memory state with a user.
 */
interface UserState {
  loggedIn: boolean;
  azure: AzureState;
}

/**
 * Options to the server.
 * With the intent to make the server parametrizable!
 */
export interface ServerOptions {
  /**
   * Secret used for the server session.
   */
  serverSecret: string;
  /**
   * Port number as a string
   */
  port: string;
}

/**
 * Result of the prepareServer function.
 */
export interface PepareServerResult {
  app: express.Application;
  database: Record<string, UserState>;
  extractUsername: (req: express.Request) => string;
  checkLoggedIn: (username: string) => void;
  extractToken: (username: string) => string;
  saveAzureState: (username: string, options: AzureState) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Sets up a parametrizable Express server.
 */
export async function prepareServer(
  serverOptions: ServerOptions
): Promise<PepareServerResult> {
  const app = express();
  const database: Record<string, UserState> = {};

  function extractUsername(req: express.Request) {
    return (req as ExpressRequestWithSession).session.username;
  }

  app.use(session({ secret: serverOptions.serverSecret }));

  /**
   * Logout just deletes the user from the session.
   */
  app.get("/logout", async (req: express.Request, res: express.Response) => {
    const session = (req as ExpressRequestWithSession).session;
    const username = session.username;
    database[username].loggedIn = false;
    delete session.username;
    res.sendStatus(200);
  });

  /**
   * To login is just to set the user on the session.
   * We don't use passwords because this is a test environment.
   */
  app.get("/login", async (req: express.Request, res: express.Response) => {
    let username = extractUsername(req);
    if (username) {
      console.error(`Already authenticated username ${username}`);
      res.write("User is already authenticated");
      res.sendStatus(500);
      return;
    }

    username = req.query.username as string;
    const session = (req as ExpressRequestWithSession).session;
    session.username = username;

    if (!database[username]) {
      database[username] = {
        loggedIn: true,
        azure: {},
      };
    }

    database[username].loggedIn = true;
    res.sendStatus(200);
  });

  let server: Server | undefined = undefined;

  return {
    app,
    database,
    extractUsername,
    extractToken: (username: string): string =>
      database[username].azure?.accessToken.token,
    checkLoggedIn: (username: string) => {
      if (!(username && database[username].loggedIn)) {
        throw new Error(`Unauthorized username ${username}`);
      }
    },
    saveAzureState: async (username: string, options: AzureState) => {
      database[username].azure = options;
    },
    async start() {
      server = app.listen(serverOptions.port, () => {
        console.log(
          `Authorization code redirect server listening on port ${serverOptions.port}`
        );
      });
    },
    async stop() {
      server.close();
    },
  };
}
