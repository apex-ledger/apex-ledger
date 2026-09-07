// Apex Ledger helper: scans every page in the feeder to JPEG files (WIA).
// Installed with the application and run by the Windows Script Host (cscript.exe //E:JScript).
// Everything variable arrives through the process environment; nothing here is built from user input.

var env = new ActiveXObject('WScript.Shell').Environment('PROCESS');
var dir = env('APEX_LEDGER_SCAN_DIR');
var base = env('APEX_LEDGER_SCAN_BASE');
var JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}';
var manager = new ActiveXObject('WIA.DeviceManager');
var info = null;
for (var i = 1; i <= manager.DeviceInfos.Count; i++) { if (manager.DeviceInfos.Item(i).Type === 1) { info = manager.DeviceInfos.Item(i); break; } }
if (info === null) { WScript.Echo('__APEX_SCAN_NO_SCANNER__'); WScript.Quit(0); }
var device = info.Connect();
var item = device.Items.Item(1);
// 3096 = pages to scan: 0 means every sheet in the feeder (the driver default is often one).
// 3088 = document handling: 1 feeder | 4 duplex. Both sides are read so a receipt loaded either
// way up still comes through; the application drops the blank side afterwards. 6147/6148 = 300 dpi,
// 4103 = colour. A driver that refuses a setting keeps its own default.
var settings = [['3088', 5], ['3096', 0], ['6147', 300], ['6148', 300], ['4103', 3]];
for (var s = 0; s < settings.length; s++) { try { item.Properties.Item(settings[s][0]).Value = settings[s][1]; } catch (e) {} }
var saved = [];
var page = 0;
while (true) {
  var image;
  try {
    image = item.Transfer(JPEG);
  } catch (e) {
    if (e.number === -2145320957) break;
    if (page === 0) { WScript.Echo('__APEX_SCAN_ERROR__ ' + (e.number === -2145320954 ? 'The WIA device is busy.' : (e.description || e.message || e.number))); WScript.Quit(1); }
    break;
  }
  page += 1;
  var convert = new ActiveXObject('WIA.ImageProcess');
  convert.Filters.Add(convert.FilterInfos.Item('Convert').FilterID);
  convert.Filters.Item(1).Properties.Item('FormatID').Value = JPEG;
  convert.Filters.Item(1).Properties.Item('Quality').Value = 85;
  image = convert.Apply(image);
  var target = dir + '\\' + base + (page === 1 ? '' : ' (page ' + page + ')') + '.jpg';
  image.SaveFile(target);
  saved.push(target);
  if (page >= 50) break;
}
if (saved.length === 0) { WScript.Echo('__APEX_SCAN_NO_PAPER__'); WScript.Quit(0); }
WScript.Echo('__APEX_SCAN_SAVED__');
for (var k = 0; k < saved.length; k++) WScript.Echo(saved[k]);
