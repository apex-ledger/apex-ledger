// Apex Ledger helper: opens the Windows scanner window and saves the image (WIA).
// Installed with the application and run by the Windows Script Host (cscript.exe //E:JScript).
// Everything variable arrives through the process environment; nothing here is built from user input.

var env = new ActiveXObject('WScript.Shell').Environment('PROCESS');
var dialog = new ActiveXObject('WIA.CommonDialog');
var image = dialog.ShowAcquireImage(1, 0, 131072, '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}', true, true, false);
if (image === null || image === undefined) { WScript.Echo('__APEX_SCAN_CANCELLED__'); WScript.Quit(0); }
image.SaveFile(env('APEX_LEDGER_SCAN_PATH'));
WScript.Echo('__APEX_SCAN_SAVED__');
