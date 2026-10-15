module.exports = function watchNativeDependencies(config, dependencies, canonicalFolder) {
  const folders=config.watchFolders ?? [];
  config.watchFolders = [...new Set([...folders,...folders.map(folder => canonicalFolder(folder)),dependencies])];
  config.resolver.nodeModulesPaths = [...new Set([dependencies,...(config.resolver.nodeModulesPaths ?? [])])];
  return config;
};
