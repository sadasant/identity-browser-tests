# SinglePageApplication challenge

## What is the browser version of the InteractiveBrowserCredential?

The browser version of the `InteractiveBrowserCredential` allows users to retrieve access tokens from a single-page application. It uses the `AuthorizationCodeFlow`, but it uses an `SPA` endpoint, meaning that they expect the authentication to redirect back to the single-page application, which will then call to getToken from the browser execution of the JavaScript code, and not from the backend.

> Documentation about the endpoint in relation to the Authorization Code flow is available here: https://docs.microsoft.com/en-us/azure/active-directory-b2c/authorization-code-flow#1-get-an-authorization-code

To configure the Azure App Registration, on the Azure Portal users would:

- On the "Authentication" page of the App Registration:
  - Under "Supported Account Types", select `Accounts in any organizational directory (Any Azure AD directory - Multitenant)` .
- Under "Platform Configurations":
  - Users would need to add a platform and select "SPA".
  - Users then would add a specific URI to their server.
  - If they're working with a localhost single-page application, they may put something similar to `http://localhost:8080/path` as the redirect URI.
  - Users would finally click "Configure".

One important point is that, in practice, some customers would rather have a single redirect URI for many single-page applications. In those cases, the redirect URI would point to a path that would execute some back-end code that would receive the authentication information and some other metadata (like a "state" parameter), and use the metadata to determine to what single-page application to redirect to. One can imagine this Express code as follows:

```ts
app.get(
  "/azureResponse",
  async (req: express.Request, res: express.Response): Promise<void> => {
    // The redirect will either contain a "code" or an "error"
    const authorizationCode = req.query["code"];

    // Error handling will probably happen here...

    // If a "state" parameter was sent on the query of the /authorize request,
    // we would be able to receive it back here.
    const singlePageApplicationPath = req.query["state"];

    // Then we should redirect to the single-page application based on the state...
    res.redirect(`${singlePageApplicationPath}/?code=${authorizationCode}`);
  }
);
```

It's important to note that the current `InteractiveBrowserCredential` does not allow users to provide metadata for a scenario similar to the above one.

## Why do developers use the browser version of the InteractiveBrowserCredential by itself, with no other credential?

Single page applications don't necessarily need to have an intelligent backend, nor notion of what users are working with that single-page application.

An example would be a Chrome plugin. It's not necessary for chrome plugins to keep track of the authenticated user.

A Chrome Plugging could let users authenticate with Azure, and then provide some in-browser tool to manage Azure resources (as long as Azure lets them do the cross-origin request).

## Current approach

Besides setting up the App Registration to point to the redirect endpoint of the application, developers need to:

1. Authenticate on the browser.
  - Using either popup or redirect.
2. Handle the redirection from Azure IN THE BROWSER.
3. Call to Azure client methods IN THE BROWSER at some point during the flow of their single-page applications.

To initiate authentication on the browser, uses would use the `InteractiveBrowserCredential`. In principle, it's possible to use this credential only providing a `clientId`, as follows:

```ts
const clientId = "my-client-id";
const credential = new InteractiveBrowserCredential({
  clientId,
  // loginStyle: "redirect"
})
```

If no `loginStyle` is provided, this credential will use the `popup` login style.

If no `loginStyle` is provided, users are able to wait for the token using `await`, as follows:

```ts
const accessToken = await credential.getToken(scope);
```

This call will open a popup window, and after users finish the interactive flow, the promise will resolve with an access token.

The `popup` approach is not ideal because many browsers prevent popups from appearing. In those cases, users will need to manually enable popups before continuing to work with the browser app.

If users prefer to use the redirect approach, they will need to specify the `loginStyle` as `redirect`. When doing so, users will need to process the redirection on page load. The best way to do this at the moment is to initialize the credential and call to `getToken` on page load, as follows:

```ts
window.onload = async () => {
  const clientId = "my-client-id";
  const credential = new InteractiveBrowserCredential({
    clientId,
    // loginStyle: "redirect"
  })
  const accessToken = await credential.getToken(scope);
  // Once they have a token, silent authentication will work in the rest of the app.
}
```

Once they have a token, silent authentication will work in the rest of the application.

The credential is able to authenticate using the received code from the redirection at any point in the application, however, the longer it takes for the code to reach the point where a token is requested (explicitly through `getToken`, or implicitly through one of the SDK client methods), the higher the risk to have something else change the hash of the page, thus losing the ability to authenticate, and forcing the credential to trigger the redirection the next time `getToken` is called.

It's also important to note that, once a user is authenticated, a single credential can't authenticate another user, or logout.

Logout is particularly important because the endpoint used to authenticate single-page applications can cache the credentials that succeeded the last time, making it impossible to willingly change the authenticated user unless the browser local cached memory on the Azure endpoint side is cleared.

## Current issues

1. There's no current way to pass metadata to the authentication endpoint in order to route multiple single-page applications from a single backend endpoint.
2. Although the `loginStyle` parameter allows users to change how the authentication happens, it is currently implied that changing this property will have no effect on how the architecture of the application needs to be.
3. No acknowledgement of the possibility of multiple users being authenticated in the browser.
4. No way to log out.

## Draft of a new approach

First, since the `popup` login vs the `redirect` login change heavily how an application is structured, we could separate the `InteractiveBrowserCredential` in two:

- `SPAPopupCredential`.
- `SPARedirectCredential`.

These credentials would be:

- Part of a new plugin package, `@azure/identity-browser`.
- Named after the `spa` redirect endpoint on the AAD app registration.
- Throws on Node.js (not isomorphic).

`SPAPopupCredential` would have:

- Would work exactly as the default behavior of the `InteractiveBrowserCredential` today (using the `popup` login style).
- Uses will be able to call `getToken` anytime, even through SDK methods, and trust the credential will authenticate and then their code will proceed as usual, without page reload.

`SPARedirectCredential` would have:

- `disableAutomaticAuthentication` set to true (can't change it).
  - Meaning that if `getToken` can't authenticate silently, an `AuthenticationRequiredError` is thrown and the manual flow can be triggered then.
- Would have a method called `onPageLoad()`, that would make it obvious to users that it would need to be executed on page load.

```ts
const credential = new SPARedirectCredential(clientId);
const client = new Client("url", credential);

window.onload = () => {
  await credential.onPageLoad();
}

async function authenticate(): boolean {
  // To manually authenticate only if getToken throws an AuthenticationRequiredError
  try {
    await credential.getToken(scope);
    return true;
  } catch(e) {
    if (e.name === "AuthenticationRequiredError") {
      await credential.authenticate();
      // Redirect happens.
    }
    return false;
  }
}

async function getAzureValues() {
  await client.method(); // Will throw if the token is expired, or if the user hasn't authenticated.
}
```

IMPORTANT: Could we provide a method to clear the cache?