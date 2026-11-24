// app-builder-lib 24's generated AppRun has a known empty-LD_LIBRARY_PATH flaw.
// Keep the reviewed NSIS backport, but do not ship that Linux launcher.
module.exports = async function safePackaging(context) {
  if (context.electronPlatformName === 'linux' && context.targets.some((target) => target.name.toLowerCase() === 'appimage')) {
    throw new Error('AppImage disabled: GHSA-7g7r-gx96-252g. Use the Linux ZIP target until the packager upgrade is reviewed.');
  }
};
