// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as React from "react";
import * as ReactDOM from "react-dom";

function TestPage() {
  return (
    <div>
      <h1>Azure SDK Browser Manual Tests</h1>
    </div>
  );
}

ReactDOM.render(<TestPage />, document.getElementById("app"));
