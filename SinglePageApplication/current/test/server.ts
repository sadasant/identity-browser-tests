// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { AccessToken, TokenCredential } from "@azure/core-auth";
import * as express from "express";
import { readFileSync } from "fs";
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
  const { port, serverSecret } = serverOptions;

  function extractUsername(req: express.Request) {
    return (req as ExpressRequestWithSession).session.username;
  }

  app.use(session({ secret: serverSecret }));

  /**
   * Logging calls.
   */
  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      console.log("Server:", req.url);
      next();
    }
  );

  /**
   * Endpoint that loads the index.js
   */
  app.get(
    "/index.js",
    async (req: express.Request, res: express.Response) => {
      const indexContent = readFileSync("./webpack/dist/index.js", { encoding: "utf8" });
      res.send(indexContent);
    }
  );

  /**
   * Home URI
   */
  app.get(
    "/index",
    async (req: express.Request, res: express.Response) => {
      const indexContent = readFileSync("./index.html", { encoding: "utf8" });
      res.send(indexContent);
    }
  );
 
  let server: Server | undefined = undefined;

  return {
    app,
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
