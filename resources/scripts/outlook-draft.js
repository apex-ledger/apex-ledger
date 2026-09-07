// Apex Ledger helper: opens an Outlook draft with a PDF attached (Outlook COM).
// Installed with the application and run by the Windows Script Host (cscript.exe //E:JScript).
// Everything variable arrives through the process environment; nothing here is built from user input.

var env = new ActiveXObject('WScript.Shell').Environment('PROCESS');
try {
  var outlook = new ActiveXObject('Outlook.Application');
  var mail = outlook.CreateItem(0);
  mail.To = env('APEX_MAIL_TO');
  mail.Subject = env('APEX_MAIL_SUBJECT');
  mail.Body = env('APEX_MAIL_BODY');
  mail.Attachments.Add(env('APEX_MAIL_ATTACHMENT'));
  mail.Display();
  WScript.Echo('OK');
} catch (e) {
  WScript.StdErr.WriteLine(e.description || e.message || String(e));
  WScript.Quit(1);
}
