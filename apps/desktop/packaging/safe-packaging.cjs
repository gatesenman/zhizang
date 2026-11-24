// Builder 24 had GHSA-7g7r-gx96-252g. Upgrading does not replace launcher acceptance.
// Keep AppImage disabled until its own artifact/runtime review; Linux ZIP is tested.
module.exports = async function safePackaging(context, rebuildNative = require('./rebuild-native.cjs')) {
  if (context.electronPlatformName === 'linux' && context.targets.some((target) => target.name.toLowerCase() === 'appimage')) {
    throw new Error('AppImage disabled pending artifact acceptance after GHSA-7g7r-gx96-252g; use the reviewed Linux ZIP target.');
  }
  const { Arch } = require('builder-util');
  await rebuildNative({ platform: context.electronPlatformName, arch: Arch[context.arch] });
};
