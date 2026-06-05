const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: workspace root'u izle, ama bundle/route kökü her zaman apps/baker
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// @opentelemetry/* boş modül — Supabase'in OTEL dinamik importu için
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
