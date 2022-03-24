import { InteractiveBrowserCredential } from "@azure/identity";

window.createCredential = (...params) => {
  try {
    return new InteractiveBrowserCredential(...params);
  } catch(e) {
    console.log("ERROR", e.message);
  }
}
