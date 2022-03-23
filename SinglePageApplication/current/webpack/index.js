const identity = require("@azure/identity");

console.log("WEBPACK LOADED", identity);

window.InteractiveBrowserCredential = identity.InteractiveBrowserCredential;
