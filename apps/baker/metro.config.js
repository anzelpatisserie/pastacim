const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Linux Hermes (used by EAS) rejects import(variable) expressions.
// Transform @supabase packages through Babel so dynamic import() → require().
config.transformer.transformIgnorePatterns = [
  'node_modules/(?!(@supabase|@opentelemetry|react-native|expo|@expo|@unimodules)/)',
];

// Resolve @opentelemetry/* to empty modules (they use dynamic import(variable)).
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
