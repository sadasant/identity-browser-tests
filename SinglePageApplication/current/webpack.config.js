const path = require('path');

module.exports = {
  mode: 'development',
  entry: './webpack/src',
  output: {
    path: path.resolve(__dirname, 'webpack/dist'),
    filename: 'index.js',
  }
};
