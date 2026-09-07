// Apex Ledger helper: lists the scanners Windows knows about (WIA).
// Installed with the application and run by the Windows Script Host (cscript.exe //E:JScript).
// Everything variable arrives through the process environment; nothing here is built from user input.

var manager = new ActiveXObject('WIA.DeviceManager');
for (var i = 1; i <= manager.DeviceInfos.Count; i++) {
  var info = manager.DeviceInfos.Item(i);
  if (info.Type !== 1) continue;
  var name = '';
  try { name = String(info.Properties.Item('Name').Value); } catch (e) {}
  if (!name) name = String(info.DeviceID);
  WScript.Echo(name);
}
