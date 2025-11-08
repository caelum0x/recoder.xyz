const path = require('path');

module.exports = {
  mode: 'production',
  entry: './cli/run.js',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'bin'),
    filename: 'recoder-code',
    libraryTarget: 'commonjs2',
  },
  resolve: {
    fallback: {
      fs: false,
      path: require.resolve('path-browserify'),
      crypto: require.resolve('crypto-browserify'),
      os: require.resolve('os-browserify/browser'),
      process: require.resolve('process/browser'),
      assert: require.resolve('assert'),
      tty: require.resolve('tty-browserify'),
      readline: false,
      stream: require.resolve('stream-browserify'),
      child_process: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
          },
        },
      },
    ],
  },
};