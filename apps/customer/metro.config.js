const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @opentelemetry/api uses dynamic import(variable) which Hermes rejects.
// Resolve it to an empty module to prevent the bundle error.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('@opentelemetry/')) {
    return { type: 'empty' };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
