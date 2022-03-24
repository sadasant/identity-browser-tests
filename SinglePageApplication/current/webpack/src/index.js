// https://stackoverflow.com/a/40920074
const identity = require("expose-loader?exposes=identity!@azure/identity");

console.log(window.identity);
