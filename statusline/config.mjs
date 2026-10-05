// Which pluginConfigs key holds this plugin's /config options: "tidepool" for a local folder,
// "tidepool@<marketplace>" when installed. A ccshine install from before the rename still counts.
export function pickConfigKey(keys) {
  const of = name => keys.find(k => k === name || k.startsWith(`${name}@`))
  return of('tidepool') ?? of('ccshine')
}
