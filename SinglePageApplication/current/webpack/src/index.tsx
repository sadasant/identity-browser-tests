// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as React from "react";
import * as ReactDOM from "react-dom";
import { InteractiveBrowserCredential } from "@azure/identity";

(window as any).InteractiveBrowserCredential = InteractiveBrowserCredential;

function TestPage() {
  console.log("TEST PAGE RENDERED");
  return (
    <h1>Azure SDK Browser Manual Tests</h1>
  );
}

ReactDOM.render(<TestPage />, document.getElementById("app"));
