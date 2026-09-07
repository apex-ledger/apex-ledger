import { ipcMain as electronIpcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { Result } from '@shared/domain/types';
import { broadcastDataChanged } from '../windows';
import * as companyHandlers from './company.handlers';
import * as inventoryHandlers from './inventory.handlers';
import * as tagsHandlers from './tags.handlers';
import * as estimatesHandlers from './estimates.handlers';
import * as purchaseOrdersHandlers from './purchaseOrders.handlers';
import * as mileageHandlers from './mileage.handlers';
import * as taxScheduleHandlers from './taxSchedules.handlers';
import * as accountsHandlers from './accounts.handlers';
import * as gifiHandlers from './gifi.handlers';
import * as journalHandlers from './journal.handlers';
import * as quickEntryHandlers from './quickEntry.handlers';
import * as reportsHandlers from './reports.handlers';
import * as fiscalPeriodsHandlers from './fiscalPeriods.handlers';
import * as categoryRulesHandlers from './categoryRules.handlers';
import * as bankImportHandlers from './bankImport.handlers';
import * as clientsHandlers from './clients.handlers';
import * as payrollHandlers from './payroll.handlers';
import * as contactsHandlers from './contacts.handlers';
import * as billsHandlers from './bills.handlers';
import * as invoicesHandlers from './invoices.handlers';
import * as salesReceiptsHandlers from './salesReceipts.handlers';
import * as hstFilingsHandlers from './hstFilings.handlers';
import * as creditNotesHandlers from './creditNotes.handlers';
import * as cpaNotesHandlers from './cpaNotes.handlers';
import * as workpapersHandlers from './workpapers.handlers';
import * as auditEngagementHandlers from './auditEngagement.handlers';
import * as lettersHandlers from './letters.handlers';
import * as invoicePdfHandlers from './invoicePdf.handlers';
import * as salesReceiptPdfHandlers from './salesReceiptPdf.handlers';
import * as bankReconciliationHandlers from './bankReconciliation.handlers';
import * as fxRatesHandlers from './fxRates.handlers';
import * as fxHandlers from './fx.handlers';
import * as attachmentsHandlers from './attachments.handlers';
import * as paymentRemindersHandlers from './paymentReminders.handlers';
import * as customerStatementsHandlers from './customerStatements.handlers';
import * as appSettingsHandlers from './appSettings.handlers';
import * as reclassifyHandlers from './reclassify.handlers';
import * as yearEndSignoffHandlers from './yearEndSignoff.handlers';
import * as voiceHandlers from './voice.handlers';
import { requirePermission } from '../accessSession';
import * as documentHistoryHandlers from './documentHistory.handlers';
import * as recurringInvoicesHandlers from './recurringInvoices.handlers';
import * as timeEntriesHandlers from './timeEntries.handlers';
import * as directDepositHandlers from './directDeposit.handlers';
import * as roeHandlers from './roe.handlers';
import * as receiptInboxHandlers from './receiptInbox.handlers';
import * as formsHandlers from './forms.handlers';
import * as licenseHandlers from './license.handlers';
import * as qbImportHandlers from './qbImport.handlers';
import * as clientOverviewHandlers from './clientOverview.handlers';
import * as qbExportHandlers from './qbExport.handlers';
import * as clipboardHandlers from './clipboard.handlers';
import * as recurringTemplatesHandlers from './recurringTemplates.handlers';
import * as shareholdersHandlers from './shareholders.handlers';
import * as marketHandlers from './market.handlers';
import * as appHandlers from './app.handlers';
import * as aiAssistantHandlers from './aiAssistant.handlers';
import * as accessUsersHandlers from './accessUsers.handlers';
import { checkForUpdatesNow, quitAndInstallUpdate } from '../updater';
import { getAccessIdentity, getAccessRole, requireWriteAccess, runWithAccessSession, setAccessIdentity, setAccessRole } from '../accessSession';
import { recordUserActivity } from '../userActivity';
import { recordStaffSignIn, recordStaffSignOut } from '../staffSessions';
import * as actionCentreHandlers from './actionCentre.handlers';
import * as fixedAssetsHandlers from './fixedAssets.handlers';
import * as approvalsHandlers from './approvals.handlers';

type SessionHandler = (event: IpcMainInvokeEvent, ...args: any[]) => any;
const ipcMain = {
  handle(channel: string, listener: SessionHandler) {
    electronIpcMain.handle(channel, (event, ...args) => runWithAccessSession(event.sender.id, () => listener(event, ...args)));
  },
};

async function toResult<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    console.error('[ipc-error]', err instanceof Error ? err.stack ?? err.message : err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Same as toResult, but for handlers that write data: on success it broadcasts data:changed so
 * every open window (mirror windows included) refreshes its lists/reports for that topic instead
 * of showing stale data until the user manually navigates away and back. */
async function mutate<T>(topic: string, fn: () => Promise<T> | T, allowReadOnly = false): Promise<Result<T>> {
  const result = await toResult(() => {
    if (!allowReadOnly) requireWriteAccess(topic);
    return fn();
  });
  if (result.ok) {
    await recordUserActivity(topic, result.data);
    broadcastDataChanged(topic);
  }
  return result;
}

/** Wires every renderer-facing IPC channel. Every mutating handler validates via zod inside the
 * handler itself and returns a Result rather than throwing across the IPC boundary. */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('access:getRole', () => toResult(() => getAccessRole()));
  ipcMain.handle('access:setRole', (_e, role) => toResult(() => setAccessRole(role)));
  ipcMain.handle('access:getIdentity', () => toResult(() => getAccessIdentity()));
  ipcMain.handle('access:setIdentity', (_e, identity) => toResult(() => setAccessIdentity(identity)));
  ipcMain.handle('access:usersList', () => toResult(() => { requireWriteAccess('accessUsers'); return accessUsersHandlers.accessUsersList(); }));
  ipcMain.handle('access:usersInvite', (_e, input) => mutate('accessUsers', () => accessUsersHandlers.accessUsersInvite(input)));
  ipcMain.handle('access:usersUpdateRole', (_e, input) => mutate('accessUsers', () => accessUsersHandlers.accessUsersUpdateRole(input)));
  ipcMain.handle('access:usersSetStatus', (_e, input) => mutate('accessUsers', () => accessUsersHandlers.accessUsersSetStatus(input)));
  ipcMain.handle('access:usersResendInvite', (_e, id) => mutate('accessUsers', () => accessUsersHandlers.accessUsersResendInvite(id)));
  ipcMain.handle('access:usersCancelInvite', (_e, id) => mutate('accessUsers', () => accessUsersHandlers.accessUsersCancelInvite(id)));
  ipcMain.handle('access:sessionUsersList', () => toResult(() => accessUsersHandlers.accessSessionUsersList()));
  ipcMain.handle('access:switchUser', async (_e, input) => {
    const result = await toResult(() => accessUsersHandlers.accessSwitchUser(input));
    if (result.ok) broadcastDataChanged('accessSession');
    return result;
  });
  ipcMain.handle('access:setupThreeUserDemo', () => mutate('accessUsers', () => accessUsersHandlers.accessSetupThreeUserDemo()));
  ipcMain.handle('access:signInHistory', () => toResult(() => accessUsersHandlers.accessSignInHistory()));
  // Lock and unlock are renderer state; the main process only hears about them so the sign-in
  // log can close and reopen the session. Neither can fail the lock itself.
  ipcMain.handle('access:recordLock', () => toResult(() => recordStaffSignOut('locked')));
  ipcMain.handle('access:recordUnlock', () => toResult(() => recordStaffSignIn()));
  ipcMain.handle('app:getVersion', () => toResult(() => appHandlers.appGetVersion()));
  ipcMain.handle('app:quit', () => toResult(() => appHandlers.appQuit()));
  ipcMain.handle('app:saveExcelFile', (_e, input) => toResult(() => appHandlers.appSaveExcelFile(mainWindow, input)));
  ipcMain.handle('app:savePdf', () => toResult(() => appHandlers.appSaveAsPdf(mainWindow)));

  ipcMain.handle('aiAssistant:keysStatus', () => toResult(() => aiAssistantHandlers.aiKeysStatus()));
  ipcMain.handle('aiAssistant:keysSave', (_e, input) => toResult(() => aiAssistantHandlers.aiKeysSave(input)));
  ipcMain.handle('aiAssistant:chatSend', (_e, input) => toResult(() => aiAssistantHandlers.aiChatSend(input)));

  ipcMain.handle('license:status', () => toResult(() => licenseHandlers.licenseStatus()));
  ipcMain.handle('license:activate', (_e, input) => toResult(() => licenseHandlers.licenseActivate(input)));
  ipcMain.handle('license:getMachineId', () => toResult(() => licenseHandlers.licenseGetMachineId()));

  ipcMain.handle('company:get', () => toResult(() => companyHandlers.companyGet()));
  ipcMain.handle('company:update', (_e, input) => mutate('company', () => companyHandlers.companyUpdate(input)));
  ipcMain.handle('company:create', (_e, input) => mutate('company', () => companyHandlers.companyCreateHandler(mainWindow, input)));
  ipcMain.handle('company:open', (_e, filePath) => mutate('company', () => companyHandlers.companyOpenHandler(mainWindow, filePath), true));
  ipcMain.handle('company:installDemo', () => mutate('company', () => companyHandlers.companyInstallDemoHandler(mainWindow)));
  ipcMain.handle('company:installTestCompany', () => mutate('company', () => companyHandlers.companyInstallTestCompanyHandler(mainWindow)));
  ipcMain.handle('company:listRecent', () => toResult(() => companyHandlers.companyListRecentHandler()));
  ipcMain.handle('company:saveAs', () => mutate('company', () => companyHandlers.companySaveAsHandler(mainWindow)));
  ipcMain.handle('company:backup', () => toResult(() => companyHandlers.companyBackupHandler(mainWindow)));
  ipcMain.handle('company:listRecoveryPoints', () => toResult(() => companyHandlers.companyListRecoveryPointsHandler()));
  ipcMain.handle('company:restoreRecoveryPoint', (_e, backupPath) => toResult(() => companyHandlers.companyRestoreRecoveryPointHandler(mainWindow, backupPath)));
  ipcMain.handle('company:close', () => mutate('company', () => companyHandlers.companyCloseHandler(mainWindow), true));
  ipcMain.handle('company:deleteCurrent', () => mutate('company', () => companyHandlers.companyDeleteCurrentHandler(mainWindow)));

  ipcMain.handle('fiscalPeriods:list', () => toResult(() => fiscalPeriodsHandlers.fiscalPeriodsList()));
  ipcMain.handle('fiscalPeriods:create', (_e, input) => mutate('fiscalPeriods', () => fiscalPeriodsHandlers.fiscalPeriodsCreate(input)));
  ipcMain.handle('fiscalPeriods:lock', (_e, id) => mutate('fiscalPeriods', () => fiscalPeriodsHandlers.fiscalPeriodsLock(id)));
  ipcMain.handle('fiscalPeriods:unlock', (_e, id) => mutate('fiscalPeriods', () => fiscalPeriodsHandlers.fiscalPeriodsUnlock(id)));

  ipcMain.handle('accounts:list', (_e, filter) => toResult(() => accountsHandlers.accountsList(filter)));
  ipcMain.handle('accounts:get', (_e, id) => toResult(() => accountsHandlers.accountsGet(id)));
  ipcMain.handle('accounts:create', (_e, input) => mutate('accounts', () => accountsHandlers.accountsCreate(input)));
  ipcMain.handle('accounts:update', (_e, input) => mutate('accounts', () => accountsHandlers.accountsUpdate(input)));
  ipcMain.handle('accounts:deactivate', (_e, id) => mutate('accounts', () => accountsHandlers.accountsDeactivate(id)));
  ipcMain.handle('accounts:ensureGstHstAccount', (_e, direction) => mutate('accounts', () => accountsHandlers.accountsEnsureGstHstAccount(direction)));
  ipcMain.handle('accounts:seedFromTemplate', (_e, templateId) => mutate('accounts', () => accountsHandlers.accountsSeedFromTemplate(templateId)));
  ipcMain.handle('accounts:listTemplates', () => toResult(() => accountsHandlers.accountsListTemplates()));
  ipcMain.handle('accounts:saveAsTemplate', (_e, input) => mutate('accounts', () => accountsHandlers.accountsSaveAsTemplate(input)));
  ipcMain.handle('accounts:deleteTemplate', (_e, templateId) => mutate('accounts', () => accountsHandlers.accountsDeleteTemplate(templateId)));

  ipcMain.handle('clipboard:readText', () => toResult(() => clipboardHandlers.clipboardReadText()));

  ipcMain.handle('recurringTemplates:list', (_e, type) => toResult(() => recurringTemplatesHandlers.recurringTemplatesList(type)));
  ipcMain.handle('recurringTemplates:create', (_e, input) => mutate('recurringTemplates', () => recurringTemplatesHandlers.recurringTemplatesCreate(input)));
  ipcMain.handle('recurringTemplates:update', (_e, input) => mutate('recurringTemplates', () => recurringTemplatesHandlers.recurringTemplatesUpdate(input)));
  ipcMain.handle('recurringTemplates:delete', (_e, id) => mutate('recurringTemplates', () => recurringTemplatesHandlers.recurringTemplatesDelete(id)));
  ipcMain.handle('recurringTemplates:postBill', (_e, input) => mutate('bills', () => recurringTemplatesHandlers.recurringTemplatesPostBill(input)));

  ipcMain.handle('gifi:list', (_e, filter) => toResult(() => gifiHandlers.gifiList(filter)));
  ipcMain.handle('gifi:get', (_e, code) => toResult(() => gifiHandlers.gifiGet(code)));
  ipcMain.handle('gifi:createCustom', (_e, input) => mutate('gifi', () => gifiHandlers.gifiCreateCustom(input)));
  ipcMain.handle('gifi:update', (_e, input) => mutate('gifi', () => gifiHandlers.gifiUpdate(input)));

  ipcMain.handle('journal:list', (_e, filter) => toResult(() => journalHandlers.journalList(filter)));
  ipcMain.handle('journal:get', (_e, id) => toResult(() => journalHandlers.journalGet(id)));
  ipcMain.handle('journal:create', (_e, input) => mutate('journal', () => journalHandlers.journalCreate(input)));
  ipcMain.handle('journal:createAndPost', (_e, input) => mutate('journal', () => journalHandlers.journalCreateAndPost(input)));
  ipcMain.handle('journal:post', (_e, id) => mutate('journal', () => journalHandlers.journalPost(id)));
  ipcMain.handle('journal:suggestContraAccount', (_e, input) => toResult(() => journalHandlers.journalSuggestContraAccount(input)));
  ipcMain.handle('journal:revisions', (_e, input) => toResult(() => journalHandlers.journalRevisions(input)));
  ipcMain.handle('journal:update', (_e, input) => mutate('journal', () => journalHandlers.journalUpdate(input)));
  ipcMain.handle('journal:updateDate', (_e, input) => mutate('journal', () => journalHandlers.journalUpdateDate(input)));
  ipcMain.handle('journal:void', (_e, id, allowLockedOverride) => mutate('journal', () => journalHandlers.journalVoid(id, allowLockedOverride)));
  ipcMain.handle('journal:delete', (_e, id) => mutate('journal', () => journalHandlers.journalDelete(id)));
  ipcMain.handle('journal:setManualHst', (_e, input) => mutate('journal', () => journalHandlers.journalSetManualHst(input)));
  ipcMain.handle('journal:setLineTaxCode', (_e, input) => mutate('journal', () => journalHandlers.journalSetLineTaxCode(input)));
  ipcMain.handle('journal:findPossibleDuplicates', (_e, input) => toResult(() => journalHandlers.journalFindPossibleDuplicates(input)));
  ipcMain.handle('journal:findByReference', (_e, reference) => toResult(() => journalHandlers.journalFindByReference(reference)));
  ipcMain.handle('journal:findRecentByMemo', (_e, input) => toResult(() => journalHandlers.journalFindRecentByMemo(input)));
  ipcMain.handle('journal:suggestTaxCodeForAccount', (_e, accountId) => toResult(() => journalHandlers.journalSuggestTaxCodeForAccount(accountId)));

  ipcMain.handle('quickEntry:create', (_e, input) => mutate('journal', () => quickEntryHandlers.quickEntryCreate(input)));
  ipcMain.handle('quickEntry:correct', (_e, input) => mutate('journal', () => quickEntryHandlers.quickEntryCorrect(input)));

  ipcMain.handle('reports:trialBalance', (_e, input) => toResult(() => reportsHandlers.reportsTrialBalance(input)));
  ipcMain.handle('reports:generalLedger', (_e, input) => toResult(() => reportsHandlers.reportsGeneralLedger(input)));
  ipcMain.handle('reports:incomeStatement', (_e, input) => toResult(() => reportsHandlers.reportsIncomeStatement(input)));
  ipcMain.handle('reports:balanceSheet', (_e, input) => toResult(() => reportsHandlers.reportsBalanceSheet(input)));
  ipcMain.handle('reports:profitAndLossDetail', (_e, input) => toResult(() => reportsHandlers.reportsProfitAndLossDetail(input)));
  ipcMain.handle('reports:profitAndLossByCustomer', (_e, input) => toResult(() => reportsHandlers.reportsProfitAndLossByCustomer(input)));
  ipcMain.handle('cca:pools', (_e, input) => toResult(() => taxScheduleHandlers.ccaPoolsList(input)));
  ipcMain.handle('cca:save', (_e, input) => mutate('ccaPools', () => taxScheduleHandlers.ccaPoolSave(input)));
  ipcMain.handle('cca:delete', (_e, id) => mutate('ccaPools', () => taxScheduleHandlers.ccaPoolDelete(id)));
  ipcMain.handle('cca:schedule', (_e, input) => toResult(() => taxScheduleHandlers.ccaScheduleReport(input)));
  ipcMain.handle('cca:rollForward', (_e, input) => mutate('ccaPools', () => taxScheduleHandlers.ccaRollForward(input)));
  ipcMain.handle('budgets:list', () => toResult(() => taxScheduleHandlers.budgetsList()));
  ipcMain.handle('budgets:create', (_e, input) => mutate('budgets', () => taxScheduleHandlers.budgetCreate(input)));
  ipcMain.handle('budgets:delete', (_e, id) => mutate('budgets', () => taxScheduleHandlers.budgetDelete(id)));
  ipcMain.handle('budgets:lines', (_e, input) => toResult(() => taxScheduleHandlers.budgetLinesList(input)));
  ipcMain.handle('budgets:setLine', (_e, input) => mutate('budgetLines', () => taxScheduleHandlers.budgetLineSet(input)));
  ipcMain.handle('budgets:spreadEvenly', (_e, input) => mutate('budgetLines', () => taxScheduleHandlers.budgetSpreadEvenly(input)));
  ipcMain.handle('budgets:vsActual', (_e, input) => toResult(() => taxScheduleHandlers.budgetVsActualReport(input)));
  ipcMain.handle('reports:reconciliation', (_e, input) => toResult(() => reportsHandlers.reportsReconciliation(input)));
  ipcMain.handle('reports:reconciliationList', (_e, input) => toResult(() => reportsHandlers.reportsReconciliationList(input)));
  ipcMain.handle('reports:t2125', (_e, input) => toResult(() => reportsHandlers.reportsT2125(input)));
  ipcMain.handle('reports:salesTaxDetail', (_e, input) => toResult(() => reportsHandlers.reportsSalesTaxDetail(input)));
  ipcMain.handle('loans:list', () => toResult(() => taxScheduleHandlers.loansList()));
  ipcMain.handle('loans:save', (_e, input) => mutate('loans', () => taxScheduleHandlers.loanSave(input)));
  ipcMain.handle('loans:delete', (_e, id) => mutate('loans', () => taxScheduleHandlers.loanDelete(id)));
  ipcMain.handle('loans:schedule', (_e, input) => toResult(() => taxScheduleHandlers.loanScheduleReport(input)));
  ipcMain.handle('products:list', (_e, input) => toResult(() => inventoryHandlers.productsList(input)));
  ipcMain.handle('products:create', (_e, input) => mutate('products', () => inventoryHandlers.productsCreate(input)));
  ipcMain.handle('products:update', (_e, input) => mutate('products', () => inventoryHandlers.productsUpdate(input)));
  ipcMain.handle('products:delete', (_e, id) => mutate('products', () => inventoryHandlers.productsDelete(id)));
  ipcMain.handle('inventory:movements', (_e, input) => toResult(() => inventoryHandlers.movementsList(input)));
  ipcMain.handle('inventory:addMovement', (_e, input) => mutate('inventoryMovements', () => inventoryHandlers.movementsCreate(input)));
  ipcMain.handle('inventory:deleteMovement', (_e, id) => mutate('inventoryMovements', () => inventoryHandlers.movementsDelete(id)));
  ipcMain.handle('inventory:reverseMovement', (_e, id) => mutate('inventoryMovements', () => inventoryHandlers.movementsReverse(id)));
  ipcMain.handle('inventory:status', (_e, input) => toResult(() => inventoryHandlers.inventoryStatusReport(input)));
  ipcMain.handle('inventory:productValuation', (_e, input) => toResult(() => inventoryHandlers.productValuation(input)));
  ipcMain.handle('reports:workingTrialBalance', (_e, input) => toResult(() => reportsHandlers.reportsWorkingTrialBalance(input)));
  ipcMain.handle('reports:expensesByVendor', (_e, input) => toResult(() => reportsHandlers.reportsExpensesByVendor(input)));
  ipcMain.handle('reports:customerStatement', (_e, input) => toResult(() => reportsHandlers.reportsCustomerStatement(input)));
  ipcMain.handle('reports:auditExceptions', (_e, input) => toResult(() => reportsHandlers.reportsAuditExceptions(input)));
  ipcMain.handle('reports:employeeEarnings', (_e, input) => toResult(() => reportsHandlers.reportsEmployeeEarnings(input)));
  ipcMain.handle('reports:chequeRegister', (_e, input) => toResult(() => reportsHandlers.reportsChequeRegister(input)));
  ipcMain.handle('reports:journal', (_e, input) => toResult(() => reportsHandlers.reportsJournal(input)));
  ipcMain.handle('reports:invalidTransactions', (_e, input) => toResult(() => reportsHandlers.reportsInvalidTransactions(input)));
  ipcMain.handle('reports:cashFlow', (_e, input) => toResult(() => reportsHandlers.reportsCashFlow(input)));
  ipcMain.handle('reports:changesInEquity', (_e, input) => toResult(() => reportsHandlers.reportsChangesInEquity(input)));
  ipcMain.handle('reports:gifiExport', (_e, input) => toResult(() => reportsHandlers.reportsGifiExport(input)));
  ipcMain.handle('reports:gifiExportExcel', (_e, input) => toResult(() => reportsHandlers.reportsGifiExportExcel(mainWindow, input)));
  ipcMain.handle('reports:projections', (_e, input) => toResult(() => reportsHandlers.reportsProjections(input)));
  ipcMain.handle('reports:salesTaxByProvince', (_e, input) => toResult(() => reportsHandlers.reportsSalesTaxByProvince(input)));
  ipcMain.handle('reports:provincialSalesTax', (_e, input) => toResult(() => reportsHandlers.reportsProvincialSalesTax(input)));
  ipcMain.handle('reports:hstSummary', (_e, input) => toResult(() => reportsHandlers.reportsHstSummary(input)));
  ipcMain.handle('reports:profitAndLossByTag', (_e, input) => toResult(() => reportsHandlers.reportsProfitAndLossByTag(input)));
  ipcMain.handle('reports:compliancePackage', (_e, input) => toResult(() => reportsHandlers.reportsCompliancePackage(input)));
  ipcMain.handle('reports:comprehensiveCompany', (_e, input) => toResult(() => reportsHandlers.reportsComprehensiveCompany(input)));

  ipcMain.handle('categoryRules:list', () => toResult(() => categoryRulesHandlers.categoryRulesList()));
  ipcMain.handle('categoryRules:create', (_e, input) => mutate('categoryRules', () => categoryRulesHandlers.categoryRulesCreate(input)));
  ipcMain.handle('categoryRules:update', (_e, input) => mutate('categoryRules', () => categoryRulesHandlers.categoryRulesUpdate(input)));
  ipcMain.handle('categoryRules:delete', (_e, id) => mutate('categoryRules', () => categoryRulesHandlers.categoryRulesDelete(id)));

  ipcMain.handle('bankImport:readCsvFile', () => toResult(() => bankImportHandlers.bankImportReadCsvFile(mainWindow)));
  ipcMain.handle('bankImport:readPdfFile', () => toResult(() => bankImportHandlers.bankImportReadPdfFile(mainWindow)));
  ipcMain.handle('bankImport:exclusionsList', (_e, accountId) => toResult(() => bankImportHandlers.bankImportExclusionsList(accountId)));
  ipcMain.handle('bankImport:exclusionsAdd', (_e, input) => mutate('bankImport', () => bankImportHandlers.bankImportExclusionsAdd(input)));
  ipcMain.handle('bankImport:exclusionsRemove', (_e, id) => mutate('bankImport', () => bankImportHandlers.bankImportExclusionsRemove(id)));
  ipcMain.handle('bankImport:rowProgressList', (_e, accountId) => toResult(() => bankImportHandlers.bankImportRowProgressList(accountId)));
  ipcMain.handle('bankImport:rowProgressSave', (_e, input) => mutate('bankImport', () => bankImportHandlers.bankImportRowProgressSave(input)));
  ipcMain.handle('bankImport:rowProgressClear', (_e, input) => mutate('bankImport', () => bankImportHandlers.bankImportRowProgressClear(input)));

  ipcMain.handle('clientOverview:get', (_e, input) => toResult(() => clientOverviewHandlers.clientOverviewGet(input)));
  ipcMain.handle('qbImport:readIifFile', () => toResult(() => qbImportHandlers.qbImportReadIifFile(mainWindow)));
  ipcMain.handle('qbImport:readCsvFile', () => toResult(() => qbImportHandlers.qbImportReadCsvFile(mainWindow)));
  ipcMain.handle('qbExport:toIif', () => toResult(() => qbExportHandlers.qbExportIif(mainWindow)));

  ipcMain.handle('updater:checkForUpdates', () => toResult(() => checkForUpdatesNow()));
  ipcMain.handle('updater:quitAndInstall', () => toResult(() => quitAndInstallUpdate()));

  ipcMain.handle('clients:list', () => toResult(() => clientsHandlers.clientsList()));
  ipcMain.handle('clients:save', (_e, input) => mutate('clients', () => clientsHandlers.clientsSave(input)));
  ipcMain.handle('clients:delete', (_e, id) => mutate('clients', () => clientsHandlers.clientsDelete(id)));
  ipcMain.handle('clients:exportSheet', () => toResult(() => clientsHandlers.clientsExportSheet(mainWindow)));
  ipcMain.handle('clients:exportPdf', () => toResult(() => clientsHandlers.clientsExportPdf(mainWindow)));
  ipcMain.handle('clients:importCsv', () => mutate('clients', () => clientsHandlers.clientsImportCsv(mainWindow)));

  ipcMain.handle('reminders:list', () => toResult(() => clientsHandlers.remindersList()));
  ipcMain.handle('reminders:save', (_e, input) => mutate('reminders', () => clientsHandlers.remindersSave(input)));
  ipcMain.handle('reminders:delete', (_e, id) => mutate('reminders', () => clientsHandlers.remindersDelete(id)));

  ipcMain.handle('deadlineAcks:list', () => toResult(() => clientsHandlers.deadlineAcksList()));
  ipcMain.handle('deadlineAcks:setInformed', (_e, input) => mutate('deadlineAcks', () => clientsHandlers.deadlineAcksSetInformed(input)));

  ipcMain.handle('appointments:list', () => toResult(() => clientsHandlers.appointmentsList()));
  ipcMain.handle('appointments:save', (_e, input) => mutate('appointments', () => clientsHandlers.appointmentsSave(input)));
  ipcMain.handle('appointments:delete', (_e, id) => mutate('appointments', () => clientsHandlers.appointmentsDelete(id)));
  ipcMain.handle('appointments:snooze', (_e, input) => mutate('appointments', () => clientsHandlers.appointmentsSnooze(input)));

  ipcMain.handle('employees:list', () => toResult(() => { requirePermission('payroll'); return payrollHandlers.employeesList(); }));
  ipcMain.handle('employees:get', (_e, id) => toResult(() => payrollHandlers.employeesGet(id)));
  ipcMain.handle('employees:create', (_e, input) => mutate('employees', () => payrollHandlers.employeesCreate(input)));
  ipcMain.handle('employees:update', (_e, input) => mutate('employees', () => payrollHandlers.employeesUpdate(input)));
  ipcMain.handle('employees:deactivate', (_e, id) => mutate('employees', () => payrollHandlers.employeesDeactivate(id)));

  ipcMain.handle('payrollRuns:list', (_e, employeeId) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollRunsList(employeeId); }));
  ipcMain.handle('payrollRuns:get', (_e, id) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollRunsGet(id); }));
  ipcMain.handle('payrollRuns:calculate', (_e, input) => toResult(() => payrollHandlers.payrollRunsCalculate(input)));
  ipcMain.handle('payrollRuns:create', (_e, input) => mutate('payrollRuns', () => payrollHandlers.payrollRunsCreate(input)));
  ipcMain.handle('payrollRuns:post', (_e, input) => mutate('payrollRuns', () => payrollHandlers.payrollRunsPost(input)));
  ipcMain.handle('payrollRuns:reverse', (_e, id) => mutate('payrollRuns', () => payrollHandlers.payrollRunsReverse(id)));
  ipcMain.handle('payrollRuns:delete', (_e, id) => mutate('payrollRuns', () => payrollHandlers.payrollRunsDelete(id)));
  ipcMain.handle('payrollRuns:getPaystub', (_e, id) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollRunsGetPaystub(id); }));
  ipcMain.handle('payrollRuns:savePaystubPdf', (_e, id) => toResult(() => payrollHandlers.payrollRunsSavePaystubPdf(mainWindow, id)));
  ipcMain.handle('payroll:generatePd7aPdf', (_e, input) => toResult(() => payrollHandlers.payrollGeneratePd7aPdf(mainWindow, input)));
  ipcMain.handle('payroll:ehtAccrued', (_e, input) => toResult(() => payrollHandlers.payrollEhtAccrued(input)));
  ipcMain.handle('payroll:ehtAccrue', (_e, input) => mutate('journal', () => payrollHandlers.payrollEhtAccrue(input)));
  ipcMain.handle('payroll:generateT4Slips', (_e, input) => toResult(() => payrollHandlers.payrollGenerateT4Slips(mainWindow, input)));
  ipcMain.handle('payroll:generateT4ASlips', (_e, input) => toResult(() => payrollHandlers.payrollGenerateT4ASlips(mainWindow, input)));
  ipcMain.handle('payroll:getT4Preview', (_e, taxYear) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollGetT4Preview(taxYear); }));
  ipcMain.handle('payroll:getT4APreview', (_e, taxYear) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollGetT4APreview(taxYear); }));
  ipcMain.handle('payroll:generateT5018Slips', (_e, input) => toResult(() => payrollHandlers.payrollGenerateT5018Slips(mainWindow, input)));
  ipcMain.handle('payroll:getT5018Preview', (_e, taxYear) => toResult(() => { requirePermission('payroll'); return payrollHandlers.payrollGetT5018Preview(taxYear); }));

  ipcMain.handle('shareholders:list', () => toResult(() => shareholdersHandlers.shareholdersList()));
  ipcMain.handle('shareholders:save', (_e, input) => mutate('shareholders', () => shareholdersHandlers.shareholdersSave(input)));
  ipcMain.handle('shareholders:deactivate', (_e, id) => mutate('shareholders', () => shareholdersHandlers.shareholdersDeactivate(id)));
  ipcMain.handle('t5Payments:list', (_e, shareholderId) => toResult(() => shareholdersHandlers.t5PaymentsList(shareholderId)));
  ipcMain.handle('t5Payments:record', (_e, input) => mutate('shareholders', () => shareholdersHandlers.t5PaymentsRecord(input)));
  ipcMain.handle('t5Payments:delete', (_e, id) => mutate('shareholders', () => shareholdersHandlers.t5PaymentsDelete(id)));
  ipcMain.handle('shareholders:generateT5Slips', (_e, input) => toResult(() => shareholdersHandlers.shareholdersGenerateT5Slips(mainWindow, input)));
  ipcMain.handle('shareholders:getT5Preview', (_e, taxYear) => toResult(() => shareholdersHandlers.shareholdersGetT5Preview(taxYear)));

  ipcMain.handle('customers:list', () => toResult(() => contactsHandlers.customersList()));
  ipcMain.handle('customers:save', (_e, input) => mutate('customers', () => contactsHandlers.customersSave(input)));
  ipcMain.handle('customers:deactivate', (_e, id) => mutate('customers', () => contactsHandlers.customersDeactivate(id)));
  ipcMain.handle('customers:merge', (_e, input) => mutate('customers', () => contactsHandlers.contactsMerge('customer', input)));

  ipcMain.handle('vendors:list', () => toResult(() => contactsHandlers.vendorsList()));
  ipcMain.handle('vendors:save', (_e, input) => mutate('vendors', () => contactsHandlers.vendorsSave(input)));
  ipcMain.handle('vendors:deactivate', (_e, id) => mutate('vendors', () => contactsHandlers.vendorsDeactivate(id)));
  ipcMain.handle('vendors:merge', (_e, input) => mutate('vendors', () => contactsHandlers.contactsMerge('vendor', input)));

  ipcMain.handle('bills:list', () => toResult(() => billsHandlers.billsList()));
  ipcMain.handle('bills:get', (_e, id) => toResult(() => billsHandlers.billsGet(id)));
  ipcMain.handle('bills:payments', (_e, billId) => toResult(() => billsHandlers.billsPayments(billId)));
  ipcMain.handle('bills:create', (_e, input) => mutate('bills', () => billsHandlers.billsCreate(input)));
  ipcMain.handle('bills:pay', (_e, input) => mutate('bills', () => billsHandlers.billsPay(input)));
  ipcMain.handle('bills:reverseLastPayment', (_e, id) => mutate('bills', () => billsHandlers.billsReverseLastPayment(id)));
  ipcMain.handle('bills:delete', (_e, id) => mutate('bills', () => billsHandlers.billsDelete(id)));
  ipcMain.handle('bills:setApproval', (_e, input) => mutate('bills', () => billsHandlers.billsSetApproval(input)));
  ipcMain.handle('bills:approvalReport', (_e, input) => toResult(() => billsHandlers.billsApprovalReport(input)));

  ipcMain.handle('accounts:reclassifyPreview', (_e, input) => toResult(() => accountsHandlers.accountsReclassifyPreview(input)));
  ipcMain.handle('accounts:reclassify', (_e, input) => mutate('accounts', () => accountsHandlers.accountsReclassify(input)));

  ipcMain.handle('estimates:list', () => toResult(() => estimatesHandlers.estimatesList()));
  ipcMain.handle('estimates:get', (_e, id) => toResult(() => estimatesHandlers.estimatesGet(id)));
  ipcMain.handle('estimates:nextNumber', (_e, input) => toResult(() => estimatesHandlers.estimatesNextNumber(input)));
  ipcMain.handle('estimates:create', (_e, input) => mutate('estimates', () => estimatesHandlers.estimatesCreate(input)));
  ipcMain.handle('estimates:update', (_e, input) => mutate('estimates', () => estimatesHandlers.estimatesUpdate(input)));
  ipcMain.handle('estimates:setStatus', (_e, input) => mutate('estimates', () => estimatesHandlers.estimatesSetStatus(input)));
  ipcMain.handle('estimates:delete', (_e, id) => mutate('estimates', () => estimatesHandlers.estimatesDelete(id)));
  ipcMain.handle('estimates:convertToInvoice', (_e, input) => mutate('invoices', () => estimatesHandlers.estimatesConvertToInvoice(input)));
  ipcMain.handle('estimates:convertToPurchaseOrder', (_e, input) => mutate('purchaseOrders', () => estimatesHandlers.estimatesConvertToPurchaseOrder(input)));
  ipcMain.handle('estimates:setFulfillment', (_e, input) => mutate('estimates', () => estimatesHandlers.estimatesSetFulfillment(input)));
  ipcMain.handle('estimates:setRequiredBy', (_e, input) => mutate('estimates', () => estimatesHandlers.estimatesSetRequiredBy(input)));

  ipcMain.handle('purchaseOrders:list', () => toResult(() => purchaseOrdersHandlers.purchaseOrdersList()));
  ipcMain.handle('purchaseOrders:get', (_e, id) => toResult(() => purchaseOrdersHandlers.purchaseOrdersGet(id)));
  ipcMain.handle('purchaseOrders:nextNumber', (_e, input) => toResult(() => purchaseOrdersHandlers.purchaseOrdersNextNumber(input)));
  ipcMain.handle('purchaseOrders:create', (_e, input) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersCreate(input)));
  ipcMain.handle('purchaseOrders:update', (_e, input) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersUpdate(input)));
  ipcMain.handle('purchaseOrders:setStatus', (_e, input) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersSetStatus(input)));
  ipcMain.handle('purchaseOrders:receive', (_e, input) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersReceive(input)));
  ipcMain.handle('purchaseOrders:reverseLatestReceipt', (_e, id) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersReverseLatestReceipt(id)));
  ipcMain.handle('purchaseOrders:matchSupplierBill', (_e, input) => mutate('bills', () => purchaseOrdersHandlers.purchaseOrdersMatchSupplierBill(input)));
  ipcMain.handle('purchaseOrders:unmatchSupplierBill', (_e, id) => mutate('bills', () => purchaseOrdersHandlers.purchaseOrdersUnmatchSupplierBill(Number(id))));
  ipcMain.handle('purchaseOrders:delete', (_e, id) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersDelete(id)));
  ipcMain.handle('purchaseOrders:convertToBill', (_e, input) => mutate('bills', () => purchaseOrdersHandlers.purchaseOrdersConvertToBill(input)));

  ipcMain.handle('deposits:listDetailed', () => toResult(() => invoicesHandlers.depositsListDetailed()));

  ipcMain.handle('mileage:list', (_e, input) => toResult(() => mileageHandlers.mileageList(input)));
  ipcMain.handle('mileage:claim', (_e, input) => mutate('mileage', () => mileageHandlers.mileageClaim(input)));
  ipcMain.handle('mileage:create', (_e, input) => mutate('mileageTrips', () => mileageHandlers.mileageCreate(input)));
  ipcMain.handle('mileage:update', (_e, input) => mutate('mileageTrips', () => mileageHandlers.mileageUpdate(input)));
  ipcMain.handle('mileage:delete', (_e, id) => mutate('mileageTrips', () => mileageHandlers.mileageDelete(id)));
  ipcMain.handle('mileage:postClaim', (_e, input) => mutate('journalEntries', () => mileageHandlers.mileagePostClaim(input)));
  ipcMain.handle('mileage:reverseLatestClaim', (_e, input) => mutate('journalEntries', () => mileageHandlers.mileageReverseLatestClaim(input)));

  ipcMain.handle('tags:groups', (_e, input) => toResult(() => tagsHandlers.tagGroupsList(input)));
  ipcMain.handle('tags:createGroup', (_e, input) => mutate('tagGroups', () => tagsHandlers.tagGroupsCreate(input)));
  ipcMain.handle('tags:updateGroup', (_e, input) => mutate('tagGroups', () => tagsHandlers.tagGroupsUpdate(input)));
  ipcMain.handle('tags:deleteGroup', (_e, id) => mutate('tagGroups', () => tagsHandlers.tagGroupsDelete(id)));
  ipcMain.handle('tags:create', (_e, input) => mutate('tags', () => tagsHandlers.tagsCreate(input)));
  ipcMain.handle('tags:update', (_e, input) => mutate('tags', () => tagsHandlers.tagsUpdate(input)));
  ipcMain.handle('tags:delete', (_e, id) => mutate('tags', () => tagsHandlers.tagsDelete(id)));
  ipcMain.handle('tags:forEntry', (_e, id) => toResult(() => tagsHandlers.tagsForEntry(id)));
  ipcMain.handle('tags:setForLine', (_e, input) => mutate('journalEntryLineTags', () => tagsHandlers.tagsSetForLine(input)));
  ipcMain.handle('tags:allAssignments', () => toResult(() => tagsHandlers.tagsAllLineAssignments()));

  ipcMain.handle('invoices:list', () => toResult(() => invoicesHandlers.invoicesList()));
  ipcMain.handle('invoices:get', (_e, id) => toResult(() => invoicesHandlers.invoicesGet(id)));
  ipcMain.handle('invoices:payments', (_e, id) => toResult(() => invoicesHandlers.invoicesPayments(id)));
  ipcMain.handle('invoices:nextNumber', () => toResult(() => invoicesHandlers.invoicesNextNumber()));
  ipcMain.handle('invoices:recordStock', (_e, input) => mutate('inventoryMovements', () => invoicesHandlers.invoicesRecordStock(input)));
  ipcMain.handle('invoices:lateInterestPreview', (_e, input) => toResult(() => invoicesHandlers.invoicesLateInterestPreview(input)));
  ipcMain.handle('invoices:chargeLateInterest', (_e, input) => mutate('invoices', () => invoicesHandlers.invoicesChargeLateInterest(input)));
  ipcMain.handle('invoices:create', (_e, input) => mutate('invoices', () => invoicesHandlers.invoicesCreate(input)));
  ipcMain.handle('invoices:receivePayment', (_e, input) => mutate('invoices', () => invoicesHandlers.invoicesReceivePayment(input)));
  ipcMain.handle('invoices:reverseLastPayment', (_e, id) => mutate('invoices', () => invoicesHandlers.invoicesReverseLastPayment(id)));
  ipcMain.handle('invoices:delete', (_e, id) => mutate('invoices', () => invoicesHandlers.invoicesDelete(id)));
  ipcMain.handle('deposits:list', () => toResult(() => invoicesHandlers.depositsList()));
  ipcMain.handle('deposits:getUndeposited', () => toResult(() => invoicesHandlers.depositsGetUndeposited()));
  ipcMain.handle('deposits:create', (_e, input) => mutate('invoices', () => invoicesHandlers.depositsCreate(input)));
  ipcMain.handle('deposits:delete', (_e, id) => mutate('invoices', () => invoicesHandlers.depositsDelete(id)));

  ipcMain.handle('salesReceipts:list', () => toResult(() => salesReceiptsHandlers.salesReceiptsList()));
  ipcMain.handle('salesReceipts:get', (_e, id) => toResult(() => salesReceiptsHandlers.salesReceiptsGet(id)));
  ipcMain.handle('salesReceipts:nextNumber', () => toResult(() => salesReceiptsHandlers.salesReceiptsNextNumber()));
  ipcMain.handle('salesReceipts:undepositedFundsAccountId', () => mutate('accounts', () => salesReceiptsHandlers.salesReceiptsUndepositedFundsAccountId()));
  ipcMain.handle('salesReceipts:create', (_e, input) => mutate('salesReceipts', () => salesReceiptsHandlers.salesReceiptsCreate(input)));
  ipcMain.handle('salesReceipts:delete', (_e, id) => mutate('salesReceipts', () => salesReceiptsHandlers.salesReceiptsDelete(id)));

  ipcMain.handle('hstFilings:list', () => toResult(() => hstFilingsHandlers.hstFilingsList()));
  ipcMain.handle('hstFilings:preview', (_e, input) => toResult(() => hstFilingsHandlers.hstFilingsPreview(input)));
  ipcMain.handle('hstFilings:create', (_e, input) => mutate('hstFilings', () => hstFilingsHandlers.hstFilingsCreate(input)));
  ipcMain.handle('hstFilings:void', (_e, id) => mutate('hstFilings', () => hstFilingsHandlers.hstFilingsVoid(id)));

  ipcMain.handle('creditNotes:list', (_e, kind) => toResult(() => creditNotesHandlers.creditNotesList(kind)));
  ipcMain.handle('creditNotes:get', (_e, id) => toResult(() => creditNotesHandlers.creditNotesGet(id)));
  ipcMain.handle('creditNotes:nextNumber', (_e, kind) => toResult(() => creditNotesHandlers.creditNotesNextNumber(kind)));
  ipcMain.handle('creditNotes:create', (_e, input) => mutate('creditNotes', () => creditNotesHandlers.creditNotesCreate(input)));
  ipcMain.handle('creditNotes:apply', (_e, input) => mutate('creditNotes', () => creditNotesHandlers.creditNotesApply(input)));
  ipcMain.handle('creditNotes:refund', (_e, input) => mutate('creditNotes', () => creditNotesHandlers.creditNotesRefund(input)));
  ipcMain.handle('creditNotes:undoSettlement', (_e, id) => mutate('creditNotes', () => creditNotesHandlers.creditNotesUndoSettlement(id)));
  ipcMain.handle('creditNotes:delete', (_e, id) => mutate('creditNotes', () => creditNotesHandlers.creditNotesDelete(id)));

  ipcMain.handle('cpaNotes:list', () => toResult(() => cpaNotesHandlers.cpaNotesList()));
  ipcMain.handle('cpaNotes:save', (_e, input) => mutate('cpaNotes', () => cpaNotesHandlers.cpaNotesSave(input)));
  ipcMain.handle('cpaNotes:setStatus', (_e, input) => mutate('cpaNotes', () => cpaNotesHandlers.cpaNotesSetStatus(input)));
  ipcMain.handle('cpaNotes:delete', (_e, id) => mutate('cpaNotes', () => cpaNotesHandlers.cpaNotesDelete(id)));
  ipcMain.handle('cpaNotes:generateReviewPackage', (_e, input) => toResult(() => cpaNotesHandlers.cpaNotesGenerateReviewPackage(mainWindow, input)));

  ipcMain.handle('workpapers:sheet', (_e, input) => toResult(() => workpapersHandlers.workpapersSheet(input)));
  ipcMain.handle('workpapers:setStatus', (_e, input) => mutate('workpapers', () => workpapersHandlers.workpapersSetStatus(input)));
  ipcMain.handle('workpapers:setNote', (_e, input) => mutate('workpapers', () => workpapersHandlers.workpapersSetNote(input)));
  ipcMain.handle('workpapers:addAttachment', (_e, input) => mutate('workpapers', () => workpapersHandlers.workpapersAddAttachment(mainWindow, input)));
  ipcMain.handle('workpapers:removeAttachment', (_e, id) => mutate('workpapers', () => workpapersHandlers.workpapersRemoveAttachment(id)));
  ipcMain.handle('workpapers:openAttachment', (_e, id) => toResult(() => workpapersHandlers.workpapersOpenAttachment(id)));

  ipcMain.handle('auditEngagement:get', (_e, input) => toResult(() => auditEngagementHandlers.auditEngagementGet(input)));
  ipcMain.handle('auditEngagement:saveMateriality', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementSaveMateriality(input)));
  ipcMain.handle('auditEngagement:saveDocument', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementSaveDocument(input)));
  ipcMain.handle('auditEngagement:signDocument', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementSignDocument(input)));
  ipcMain.handle('auditEngagement:addReviewNote', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementAddReviewNote(input)));
  ipcMain.handle('auditEngagement:resolveReviewNote', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementResolveReviewNote(input)));
  ipcMain.handle('auditEngagement:setStatus', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementSetStatus(input)));
  ipcMain.handle('auditEngagement:lock', (_e, input) => mutate('auditEngagement', () => auditEngagementHandlers.auditEngagementLock(input)));

  ipcMain.handle('letters:list', () => toResult(() => lettersHandlers.lettersList()));
  ipcMain.handle('letters:generate', (_e, input) => toResult(() => lettersHandlers.lettersGenerate(mainWindow, input)));

  ipcMain.handle('invoicePdf:generate', (_e, input) => toResult(() => invoicePdfHandlers.invoicePdfGenerate(mainWindow, input)));
  ipcMain.handle('invoicePdf:emailViaOutlook', (_e, input) => toResult(() => invoicePdfHandlers.invoicePdfEmailViaOutlook(input)));
  ipcMain.handle('invoicePdf:saveToDownloads', (_e, input) => toResult(() => invoicePdfHandlers.invoicePdfSaveToDownloads(input)));

  ipcMain.handle('salesReceiptPdf:generate', (_e, input) => toResult(() => salesReceiptPdfHandlers.salesReceiptPdfGenerate(mainWindow, input)));
  ipcMain.handle('salesReceiptPdf:emailViaOutlook', (_e, input) => toResult(() => salesReceiptPdfHandlers.salesReceiptPdfEmailViaOutlook(input)));
  ipcMain.handle('salesReceiptPdf:saveToDownloads', (_e, input) => toResult(() => salesReceiptPdfHandlers.salesReceiptPdfSaveToDownloads(input)));

  ipcMain.handle('bankReconciliation:list', (_e, accountId) => toResult(() => bankReconciliationHandlers.bankReconciliationList(accountId)));
  ipcMain.handle('bankReconciliation:get', (_e, id) => toResult(() => bankReconciliationHandlers.bankReconciliationGet(id)));
  ipcMain.handle('bankReconciliation:start', (_e, input) => mutate('bankReconciliation', () => bankReconciliationHandlers.bankReconciliationStart(input)));
  ipcMain.handle('bankReconciliation:toggleLine', (_e, input) => mutate('bankReconciliation', () => bankReconciliationHandlers.bankReconciliationToggleLine(input)));
  ipcMain.handle('bankReconciliation:complete', (_e, input) => mutate('bankReconciliation', () => bankReconciliationHandlers.bankReconciliationComplete(input)));
  ipcMain.handle('bankReconciliation:reopen', (_e, id) => mutate('bankReconciliation', () => bankReconciliationHandlers.bankReconciliationReopen(Number(id))));
  ipcMain.handle('bankReconciliation:abandon', (_e, id) => mutate('bankReconciliation', () => bankReconciliationHandlers.bankReconciliationAbandon(Number(id))));

  ipcMain.handle('fxRates:getLatest', (_event, currency) => toResult(() => fxRatesHandlers.fxRatesGetLatest(currency)));
  ipcMain.handle('fixedAssets:list', () => toResult(() => fixedAssetsHandlers.fixedAssetsList()));
  ipcMain.handle('fixedAssets:save', (_e, input) => mutate('journal', () => fixedAssetsHandlers.fixedAssetsSave(input)));
  ipcMain.handle('fixedAssets:delete', (_e, id) => mutate('journal', () => fixedAssetsHandlers.fixedAssetsDelete(id)));
  ipcMain.handle('fixedAssets:schedule', (_e, id) => toResult(() => fixedAssetsHandlers.fixedAssetsSchedule(id)));
  ipcMain.handle('fixedAssets:runDepreciation', (_e, input) => mutate('journal', () => fixedAssetsHandlers.fixedAssetsRunDepreciation(input)));
  ipcMain.handle('fixedAssets:dispose', (_e, input) => mutate('journal', () => fixedAssetsHandlers.fixedAssetsDispose(input)));
  ipcMain.handle('approvals:pending', () => toResult(() => approvalsHandlers.approvalsPending()));
  ipcMain.handle('journal:setApproval', (_e, input) => mutate('journal', () => journalHandlers.journalSetApproval(input)));
  ipcMain.handle('purchaseOrders:setApproval', (_e, input) => mutate('purchaseOrders', () => purchaseOrdersHandlers.purchaseOrdersSetApproval(input)));
  ipcMain.handle('actionCentre:items', () => toResult(() => actionCentreHandlers.actionCentreItems()));
  ipcMain.handle('roe:preview', (_e, input) => toResult(() => roeHandlers.roePreview(input)));
  ipcMain.handle('roe:savePdf', (_e, input) => toResult(() => roeHandlers.roeSavePdf(mainWindow, input)));
  ipcMain.handle('roe:saveXml', (_e, input) => toResult(() => roeHandlers.roeSaveXml(mainWindow, input)));
  ipcMain.handle('payrollItems:list', () => toResult(() => payrollHandlers.payrollItemsList()));
  ipcMain.handle('payrollItems:save', (_event, input) => mutate('employees', () => payrollHandlers.payrollItemsSave(input)));
  ipcMain.handle('directDeposit:payDates', () => toResult(() => directDepositHandlers.directDepositPayDates()));
  ipcMain.handle('directDeposit:preview', (_event, input) => toResult(() => directDepositHandlers.directDepositPreview(input)));
  ipcMain.handle('directDeposit:saveFile', (_event, input) => mutate('company', () => directDepositHandlers.directDepositSaveFile(mainWindow, input)));
  ipcMain.handle('timeEntries:list', (_event, input) => toResult(() => timeEntriesHandlers.timeEntriesList(input)));
  ipcMain.handle('timeEntries:unbilled', () => toResult(() => timeEntriesHandlers.timeEntriesUnbilled()));
  ipcMain.handle('timeEntries:create', (_event, input) => mutate('invoices', () => timeEntriesHandlers.timeEntriesCreate(input)));
  ipcMain.handle('timeEntries:update', (_event, input) => mutate('invoices', () => timeEntriesHandlers.timeEntriesUpdate(input)));
  ipcMain.handle('timeEntries:delete', (_event, id) => mutate('invoices', () => timeEntriesHandlers.timeEntriesDelete(id)));
  ipcMain.handle('timeEntries:invoice', (_event, input) => mutate('invoices', () => timeEntriesHandlers.timeEntriesInvoice(input)));
  ipcMain.handle('recurringInvoices:list', () => toResult(() => recurringInvoicesHandlers.recurringInvoicesList()));
  ipcMain.handle('recurringInvoices:due', () => toResult(() => recurringInvoicesHandlers.recurringInvoicesDue()));
  ipcMain.handle('recurringInvoices:create', (_event, input) => mutate('invoices', () => recurringInvoicesHandlers.recurringInvoicesCreate(input)));
  ipcMain.handle('recurringInvoices:update', (_event, input) => mutate('invoices', () => recurringInvoicesHandlers.recurringInvoicesUpdate(input)));
  ipcMain.handle('recurringInvoices:delete', (_event, id) => mutate('invoices', () => recurringInvoicesHandlers.recurringInvoicesDelete(id)));
  ipcMain.handle('recurringInvoices:generateDue', (_event, input) => mutate('invoices', () => recurringInvoicesHandlers.recurringInvoicesGenerateDue(input)));
  ipcMain.handle('documentHistory:get', (_event, input) => toResult(() => documentHistoryHandlers.documentHistory(input)));
  ipcMain.handle('paymentReminders:preview', (_event, input) => toResult(() => paymentRemindersHandlers.paymentRemindersPreview(input)));
  ipcMain.handle('paymentReminders:emailViaOutlook', (_event, input) => toResult(() => paymentRemindersHandlers.paymentRemindersEmailViaOutlook(input)));
  ipcMain.handle('paymentReminders:overdueCustomers', () => toResult(() => paymentRemindersHandlers.paymentRemindersOverdueCustomers()));
  ipcMain.handle('receiptInbox:pickAndExtract', () => toResult(() => receiptInboxHandlers.receiptInboxPickAndExtract(mainWindow)));
  ipcMain.handle('journal:reclassifyCandidates', (_e, input) => toResult(() => reclassifyHandlers.reclassifyCandidates(input)));
  ipcMain.handle('journal:reclassify', (_e, input) => mutate('journal', () => reclassifyHandlers.reclassifyLines(input)));
  ipcMain.handle('voice:status', () => toResult(() => Promise.resolve(voiceHandlers.voiceStatusHandler())));
  ipcMain.handle('voice:prepare', () => toResult(() => voiceHandlers.voicePrepareHandler(mainWindow)));
  ipcMain.handle('voice:transcribe', (_e, input) => toResult(() => voiceHandlers.voiceTranscribeHandler(input)));
  ipcMain.handle('reports:yearEndSignoff', (_e, input) => toResult(() => yearEndSignoffHandlers.yearEndSignoffReport(input)));
  ipcMain.handle('reports:yearEndSignoffHistory', () => toResult(() => yearEndSignoffHandlers.yearEndSignoffHistory()));
  ipcMain.handle('reports:yearEndSignoffSign', (_e, input) => mutate('accounting', () => yearEndSignoffHandlers.yearEndSignoffSign(input)));
  ipcMain.handle('appSettings:get', () => toResult(() => appSettingsHandlers.appSettingsGet()));
  ipcMain.handle('appSettings:save', (_e, input) => toResult(() => { requireWriteAccess('company'); return appSettingsHandlers.appSettingsSave(input); }));
  ipcMain.handle('appSettings:pickBackupFolder', () => toResult(() => appSettingsHandlers.appSettingsPickBackupFolder(mainWindow)));
  ipcMain.handle('appSettings:sendTestEmail', (_e, input) => toResult(() => appSettingsHandlers.appSettingsSendTestEmail(input)));
  ipcMain.handle('company:pickLogo', () => toResult(() => companyHandlers.companyPickLogoHandler(mainWindow)));
  ipcMain.handle('reports:activityLog', (_e, input) => toResult(() => reportsHandlers.reportsActivityLog(input)));
  ipcMain.handle('customerStatements:list', () => toResult(() => customerStatementsHandlers.customerStatementsList()));
  ipcMain.handle('customerStatements:saveAll', (_e, input) => toResult(() => customerStatementsHandlers.customerStatementsSaveAll(mainWindow, input)));
  ipcMain.handle('customerStatements:email', (_e, input) => toResult(() => customerStatementsHandlers.customerStatementsEmail(input)));
  ipcMain.handle('attachments:list', (_event, input) => toResult(() => attachmentsHandlers.attachmentsList(input)));
  ipcMain.handle('attachments:add', (_event, input) => toResult(() => attachmentsHandlers.attachmentsAdd(mainWindow, input)));
  ipcMain.handle('attachments:open', (_event, id) => toResult(() => attachmentsHandlers.attachmentsOpen(id)));
  ipcMain.handle('attachments:remove', (_event, id) => toResult(() => attachmentsHandlers.attachmentsRemove(id)));
  ipcMain.handle('attachments:counts', (_event, input) => toResult(() => attachmentsHandlers.attachmentsCounts(input)));
  ipcMain.handle('fx:foreignBalances', (_event, input) => toResult(() => fxHandlers.fxForeignBalances(input)));
  ipcMain.handle('fx:revaluationPreview', (_event, input) => toResult(() => fxHandlers.fxRevaluationPreview(input)));
  ipcMain.handle('fx:revaluationPost', (_event, input) => mutate('journal', () => fxHandlers.fxRevaluationPost(input)));
  ipcMain.handle('fxRates:getOnDate', (_event, currency, date) => toResult(() => fxRatesHandlers.fxRatesGetOnDate(currency, date)));

  ipcMain.handle('market:quotes', () => toResult(() => marketHandlers.marketQuotes()));
  ipcMain.handle('market:news', () => toResult(() => marketHandlers.marketNews()));

  ipcMain.handle('receiptInbox:list', () => toResult(() => receiptInboxHandlers.receiptInboxList()));
  ipcMain.handle('receiptInbox:history', () => toResult(() => receiptInboxHandlers.receiptInboxHistory()));
  ipcMain.handle('receiptInbox:reprocess', (_e, id) => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxReprocess(Number(id))));
  ipcMain.handle('receiptInbox:importFiles', () => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxImportFiles(mainWindow)));
  ipcMain.handle('receiptInbox:scannerStatus', () => toResult(() => receiptInboxHandlers.receiptInboxScannerStatus()));
  ipcMain.handle('receiptInbox:scan', () => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxScan()));
  ipcMain.handle('receiptInbox:getPreview', (_e, fileName) => toResult(() => receiptInboxHandlers.receiptInboxGetPreview(fileName)));
  ipcMain.handle('receiptInbox:extractFields', (_e, fileName) => toResult(() => receiptInboxHandlers.receiptInboxExtractFields(fileName)));
  ipcMain.handle('receiptInbox:importAsBill', (_e, input) => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxImportAsBill(input)));
  ipcMain.handle('receiptInbox:importAsQuickEntry', (_e, input) => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxImportAsQuickEntry(input)));
  ipcMain.handle('receiptInbox:dismiss', (_e, fileName) => mutate('receiptInbox', () => receiptInboxHandlers.receiptInboxDismiss(fileName)));
  ipcMain.handle('receiptInbox:openFile', (_e, filePath) => toResult(() => receiptInboxHandlers.receiptInboxOpenFile(filePath)));
  ipcMain.handle('receiptInbox:getForJournalEntry', (_e, journalEntryId) => toResult(() => receiptInboxHandlers.receiptInboxGetForJournalEntry(journalEntryId)));
  ipcMain.handle('receiptInbox:showFolder', () => toResult(() => receiptInboxHandlers.receiptInboxShowFolder()));

  ipcMain.handle('forms:generatePdf', (_e, input) => toResult(() => formsHandlers.formsGeneratePdf(mainWindow, input)));
  ipcMain.handle('forms:emailViaOutlook', (_e, input) => toResult(() => formsHandlers.formsEmailViaOutlook(input)));
  ipcMain.handle('forms:saveToDownloads', (_e, input) => toResult(() => formsHandlers.formsSaveToDownloads(input)));
}
