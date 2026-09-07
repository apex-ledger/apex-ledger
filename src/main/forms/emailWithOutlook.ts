import { runWindowsScript } from '../scanner/wiaScript';

/** Opens a new Outlook draft with the PDF attached, through Outlook's COM automation.
 *
 * Display(), never Send(): the person reviews and sends it themselves. Only works when desktop
 * Outlook is installed; callers show a clear fallback (attach the file by hand) on failure.
 *
 * This used to write a PowerShell script into the temp folder and run it with
 * -ExecutionPolicy Bypass — which is precisely the behaviour Norton's IDP.Generic heuristic exists
 * to stop, and it stops it by quarantining the application. The signed Windows script host does
 * the same COM call with nothing for a heuristic to object to. The values travel through the
 * process environment, so a subject a client typed can never be mistaken for a switch. The script
 * itself ships with the application (resources/scripts/outlook-draft.js). */

export async function composeOutlookEmailWithAttachment(pdfPath: string, toEmail: string, subject: string, body: string): Promise<void> {
  try {
    const output = await runWindowsScript('outlook-draft', { APEX_MAIL_TO: toEmail, APEX_MAIL_SUBJECT: subject, APEX_MAIL_BODY: body, APEX_MAIL_ATTACHMENT: pdfPath }, 20_000);
    if (!output.includes('OK')) throw new Error('Outlook did not open the draft.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || message || 'Outlook automation failed.');
  }
}
