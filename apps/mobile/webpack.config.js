const createExpoWebpackConfigAsync = require('@expo/webpack-config');

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  // Reduce noisy OAuth popup warnings on web by allowing popups to close themselves.
  // This header is safe for local dev; adjust as needed for production hosting.
  config.devServer = config.devServer || {};
  config.devServer.headers = {
    ...(config.devServer.headers || {}),
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  };

  return config;
};
