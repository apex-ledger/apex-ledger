export type FormFieldType = 'text' | 'checkbox' | 'longtext';

export interface FormField {
  name: string;
  label: string;
  type: FormFieldType;
}

/** A table of fillable cells. If `rowLabels` is given, the first column is those fixed labels
 * (not fillable) and every other column gets one fillable field per row — the common shape for
 * an expense category list ("Fuel: $____"). Without `rowLabels`, every cell in `rows` blank rows
 * is fillable — for open-ended lists like dependants or capital improvements. */
export interface FormTable {
  columns: string[];
  rowLabels?: string[];
  rows?: number;
}

export interface FormSection {
  title: string;
  fields?: FormField[];
  table?: FormTable;
  /** Plain wrapped body text, one entry per paragraph — for letter-style documents (engagement
   * letters, cover letters) where most of the content is prose rather than fields to fill in. */
  paragraphs?: string[];
}

export type FormCategory = 'client_compliance' | 'tax_accounting';

export interface FormTemplate {
  id: string;
  title: string;
  description: string;
  /** Groups the form in the Forms page. Defaults to tax/accounting when omitted. */
  category?: FormCategory;
  sections: FormSection[];
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'new_client_intake',
    title: 'New Client Basic Information Intake',
    description: 'Personal details, dependants, banking, and a documents checklist for onboarding a new personal tax client.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Personal Information',
        fields: [
          { name: 'fullLegalName', label: 'Full Legal Name', type: 'text' },
          { name: 'dateOfBirth', label: 'Date of Birth', type: 'text' },
          { name: 'sin', label: 'Social Insurance Number', type: 'text' },
          { name: 'maritalStatus', label: 'Marital Status', type: 'text' },
          { name: 'phone', label: 'Phone', type: 'text' },
          { name: 'email', label: 'Email', type: 'text' },
          { name: 'address', label: 'Mailing Address', type: 'text' },
        ],
      },
      {
        title: 'Spouse / Partner Information (if applicable)',
        fields: [
          { name: 'spouseName', label: 'Full Legal Name', type: 'text' },
          { name: 'spouseDob', label: 'Date of Birth', type: 'text' },
          { name: 'spouseSin', label: 'Social Insurance Number', type: 'text' },
        ],
      },
      {
        title: 'Dependants',
        table: { columns: ['Name', 'Date of Birth', 'Relationship', 'Net Income'], rows: 4 },
      },
      {
        title: 'Employment',
        fields: [
          { name: 'employerName', label: 'Employer Name', type: 'text' },
          { name: 'occupation', label: 'Occupation', type: 'text' },
        ],
      },
      {
        title: 'Direct Deposit Banking Information',
        fields: [
          { name: 'bankName', label: 'Bank Name', type: 'text' },
          { name: 'transitNumber', label: 'Transit Number', type: 'text' },
          { name: 'institutionNumber', label: 'Institution Number', type: 'text' },
          { name: 'accountNumber', label: 'Account Number', type: 'text' },
        ],
      },
      {
        title: 'Prior Accountant & CRA Authorization',
        fields: [
          { name: 'previousAccountant', label: 'Previous Accountant (name / contact)', type: 'text' },
          { name: 'authorizeRepresentative', label: 'CRA representative access requested (online, or AUT-01 for offline access)', type: 'checkbox' },
          { name: 'authorizationExpiry', label: 'Requested authorization expiry date (if any)', type: 'text' },
        ],
      },
      {
        title: 'Documents Checklist (check all that you are providing)',
        fields: [
          { name: 'docT4', label: 'T4 — Employment Income', type: 'checkbox' },
          { name: 'docT4a', label: 'T4A — Other Income / Pension', type: 'checkbox' },
          { name: 'docT5', label: 'T5 — Investment Income', type: 'checkbox' },
          { name: 'docT3', label: 'T3 — Trust Income', type: 'checkbox' },
          { name: 'docRrsp', label: 'RRSP Contribution Receipts', type: 'checkbox' },
          { name: 'docMedical', label: 'Medical Expense Receipts', type: 'checkbox' },
          { name: 'docDonations', label: 'Charitable Donation Receipts', type: 'checkbox' },
          { name: 'docTuition', label: 'T2202 — Tuition', type: 'checkbox' },
          { name: 'docChildcare', label: 'Childcare Receipts', type: 'checkbox' },
          { name: 'docOther', label: 'Other (specify in notes)', type: 'checkbox' },
        ],
      },
    ],
  },
  {
    id: 'client_engagement',
    title: 'Client Intake / Engagement Form',
    description: 'Client type, services requested, and engagement authorization to start a new working relationship.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Client Type',
        fields: [
          { name: 'typeIndividual', label: 'Individual', type: 'checkbox' },
          { name: 'typeSoleProp', label: 'Sole Proprietor', type: 'checkbox' },
          { name: 'typeCorporation', label: 'Corporation', type: 'checkbox' },
          { name: 'typePartnership', label: 'Partnership', type: 'checkbox' },
        ],
      },
      {
        title: 'Services Requested',
        fields: [
          { name: 'svcT1', label: 'Personal Tax Return (T1)', type: 'checkbox' },
          { name: 'svcT2', label: 'Corporate Tax Return (T2)', type: 'checkbox' },
          { name: 'svcBookkeeping', label: 'Bookkeeping', type: 'checkbox' },
          { name: 'svcPayroll', label: 'Payroll', type: 'checkbox' },
          { name: 'svcHst', label: 'GST/HST Filing', type: 'checkbox' },
          { name: 'svcFinancials', label: 'Financial Statements', type: 'checkbox' },
          { name: 'svcOther', label: 'Other (specify below)', type: 'checkbox' },
        ],
      },
      {
        title: 'Contact Preferences',
        fields: [
          { name: 'preferredContact', label: 'Preferred Contact Method', type: 'text' },
          { name: 'bestTimeToReach', label: 'Best Time to Reach You', type: 'text' },
        ],
      },
      {
        title: 'Fee Arrangement Notes',
        fields: [{ name: 'feeNotes', label: 'Notes', type: 'longtext' }],
      },
      {
        title: 'Authorization',
        fields: [
          { name: 'clientSignature', label: 'Client Signature', type: 'text' },
          { name: 'signatureDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'engagement_letter',
    title: 'Client Engagement Letter',
    description: 'A formal letter setting out the scope of services, fees, and mutual responsibilities for a new engagement — for signature by both parties.',
    category: 'client_compliance',
    sections: [
      {
        title: '',
        fields: [
          { name: 'letterDate', label: 'Date', type: 'text' },
          { name: 'clientAddressee', label: 'Client Name / Business Name', type: 'text' },
          { name: 'engagementPeriod', label: 'Engagement Period / Fiscal Year', type: 'text' },
        ],
      },
      {
        title: 'Purpose',
        paragraphs: [
          'This letter sets out the terms of the engagement between our firm and you (the "Client") and the nature and limitations of the services we will provide. Please review it carefully and sign and return a copy to confirm your agreement with these terms before we begin work.',
        ],
      },
      {
        title: 'Scope of Services',
        paragraphs: ['We will provide the following services, as checked below, for the period stated above:'],
        fields: [
          { name: 'svcBookkeeping', label: 'Bookkeeping / Write-Up', type: 'checkbox' },
          { name: 'svcT1', label: 'Personal Income Tax Return (T1)', type: 'checkbox' },
          { name: 'svcT2', label: 'Corporate Income Tax Return (T2)', type: 'checkbox' },
          { name: 'svcHst', label: 'GST/HST Filing', type: 'checkbox' },
          { name: 'svcPayroll', label: 'Payroll Processing & Remittances', type: 'checkbox' },
          { name: 'svcFinancials', label: 'Financial Statement Preparation (Compilation)', type: 'checkbox' },
          { name: 'svcAdvisory', label: 'General Advisory / Consulting', type: 'checkbox' },
          { name: 'svcOther', label: 'Other (describe below)', type: 'checkbox' },
          { name: 'svcOtherDetail', label: 'Other Services Detail', type: 'longtext' },
        ],
      },
      {
        title: 'Your Responsibilities',
        paragraphs: [
          'You are responsible for the accuracy and completeness of the financial records, receipts, and other information you provide to us, and for retaining the source documents supporting that information for the period required by the Canada Revenue Agency. Our work will rely on the information you provide being complete and accurate; we do not audit or independently verify it unless separately engaged to do so.',
          'You remain responsible for the accuracy and completeness of every return or filing prepared under this engagement, even though we assist in its preparation, and for reviewing any document before it is filed or signed.',
          'You will provide complete information and approvals by the dates we communicate. We are not responsible for a missed deadline, interest, or penalty caused by late, incomplete, inaccurate, or withheld information, although we will tell you promptly when an issue becomes known to us.',
        ],
      },
      {
        title: 'Our Responsibilities and Limitations',
        paragraphs: [
          'We will perform the services listed above with reasonable care and skill, in accordance with applicable professional standards, and using the information you provide. This engagement does not constitute an audit or review engagement, and no opinion or assurance will be expressed on the financial information unless a separate written engagement for that purpose is agreed.',
          'We will not be responsible for detecting fraud, error, or non-compliance with laws or regulations that a properly performed compilation, bookkeeping, or tax-preparation engagement would not be expected to detect.',
        ],
      },
      {
        title: 'Fees and Billing',
        fields: [
          { name: 'feeArrangement', label: 'Fee Arrangement (flat fee, hourly rate, retainer, etc.)', type: 'longtext' },
        ],
        paragraphs: [
          'Invoices are due upon receipt unless other terms are agreed in writing. We reserve the right to suspend work, including filings with statutory deadlines, if an account becomes significantly overdue, and will provide reasonable notice before doing so.',
        ],
      },
      {
        title: 'Confidentiality',
        paragraphs: [
          'We will keep your information confidential and will not disclose it to third parties without your consent, except where required by law, professional standards, or a valid order of a court or regulatory authority (including the Canada Revenue Agency).',
        ],
      },
      {
        title: 'Privacy, Technology and Electronic Communications',
        paragraphs: [
          'We may use secure electronic communication, cloud storage, software providers, and other service providers to perform this engagement. Applicable providers, storage locations, material risks, and safeguards should be identified in the separate Privacy and Technology Consent. We remain responsible for protecting confidential information and applying professional judgment; client consent does not waive those duties.',
        ],
        fields: [
          { name: 'electronicCommunicationApproved', label: 'Electronic communication approved', type: 'checkbox' },
          { name: 'privacyConsentAttached', label: 'Privacy and Technology Consent attached', type: 'checkbox' },
        ],
      },
      {
        title: 'Conflicts, Independence and Use of Specialists',
        paragraphs: [
          'Before accepting or continuing the engagement, we will assess conflicts of interest, competence, resources, and any independence requirement that applies to the service. Any identified conflict, threat, safeguard, referral, or specialist arrangement requiring disclosure or consent must be documented separately before work proceeds.',
        ],
        fields: [
          { name: 'acceptanceCheckComplete', label: 'Acceptance / continuance and conflict check completed', type: 'checkbox' },
          { name: 'disclosureAttached', label: 'Required conflict / independence disclosure or consent attached', type: 'checkbox' },
        ],
      },
      {
        title: 'Records, Working Papers and CRA Access',
        paragraphs: [
          'Your original records remain your property. Our working papers and internal documentation remain our property, subject to applicable law and professional obligations. Each party will retain records for the period applicable to the engagement. CRA representative access is a separate authorization, is limited to the approved account and level, and should be reviewed or cancelled when it is no longer required.',
        ],
      },
      {
        title: 'Compilation Engagements (if selected)',
        paragraphs: [
          'For a compilation engagement, management remains responsible for the accompanying financial information and for selecting an appropriate basis of accounting. Intended users, third-party use, the basis of accounting, and management acknowledgement must be documented in the separate Compilation Engagement — Management Acknowledgement before the compiled financial information is released. A compilation engagement provides no assurance.',
        ],
      },
      {
        title: 'Term and Termination',
        paragraphs: [
          'This engagement begins on the date this letter is signed and continues until the services described above are completed, unless terminated earlier by either party with written notice. You remain responsible for fees for work performed up to the date of termination.',
        ],
      },
      {
        title: 'Acceptance',
        paragraphs: ['Please sign below to confirm your agreement with the terms of this engagement.'],
        fields: [
          { name: 'firmRepresentative', label: 'Firm Representative (print name)', type: 'text' },
          { name: 'firmSignature', label: 'Firm Signature', type: 'text' },
          { name: 'clientSignature', label: 'Client Signature', type: 'text' },
          { name: 'signatureDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'client_acceptance_continuance',
    title: 'Client Acceptance / Continuance and Conflict Check',
    description: 'Documents the professional decision to accept or continue a client engagement before work starts.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Client and Engagement',
        fields: [
          { name: 'clientName', label: 'Client / Entity Name', type: 'text' },
          { name: 'engagementPeriod', label: 'Period / Fiscal Year', type: 'text' },
          { name: 'services', label: 'Services to Be Provided', type: 'longtext' },
          { name: 'intendedUsers', label: 'Known Intended Users / Third Parties', type: 'longtext' },
        ],
      },
      {
        title: 'Acceptance and Continuance Review',
        fields: [
          { name: 'clientIntegrity', label: 'Client integrity and business purpose considered', type: 'checkbox' },
          { name: 'predecessorCommunication', label: 'Predecessor communication completed or reason not required documented', type: 'checkbox' },
          { name: 'competenceResources', label: 'Firm has competence, time, technology, and resources', type: 'checkbox' },
          { name: 'licensingAuthority', label: 'Required provincial licence / authority for the service confirmed', type: 'checkbox' },
          { name: 'scopeClear', label: 'Scope, intended users, deadlines, and reporting basis are clear', type: 'checkbox' },
          { name: 'unusualRisk', label: 'Unusual client, fraud, legal, regulatory, or reputation risks identified below', type: 'checkbox' },
          { name: 'riskNotes', label: 'Risk Findings and Planned Response', type: 'longtext' },
        ],
      },
      {
        title: 'Conflicts and Independence',
        fields: [
          { name: 'conflictSearchComplete', label: 'Conflict search completed before acceptance / continuance', type: 'checkbox' },
          { name: 'conflictFound', label: 'Actual or potential conflict identified', type: 'checkbox' },
          { name: 'independenceRequired', label: 'Independence is required for this engagement', type: 'checkbox' },
          { name: 'threatsFound', label: 'Independence threats identified', type: 'checkbox' },
          { name: 'safeguardsConsent', label: 'Safeguards and required informed consent are documented', type: 'checkbox' },
          { name: 'conflictNotes', label: 'Conflict / Independence Details, Safeguards, Referrals, or Consent', type: 'longtext' },
        ],
      },
      {
        title: 'Decision',
        fields: [
          { name: 'decisionAccept', label: 'Accept', type: 'checkbox' },
          { name: 'decisionContinue', label: 'Continue', type: 'checkbox' },
          { name: 'decisionDecline', label: 'Decline / Withdraw', type: 'checkbox' },
          { name: 'conditions', label: 'Conditions or Follow-Up Required Before Work Starts', type: 'longtext' },
          { name: 'reviewer', label: 'Completed / Approved By', type: 'text' },
          { name: 'reviewDate', label: 'Review Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'privacy_technology_consent',
    title: 'Privacy and Technology Consent',
    description: 'Records informed client choices for collection, electronic communication, cloud providers, retention, and secure technology use.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Purpose and Information',
        paragraphs: [
          'Use this form with the engagement letter. Identify the actual systems and providers used by the firm. Consent does not remove the firm\'s confidentiality, privacy, security, or professional obligations.',
        ],
        fields: [
          { name: 'clientName', label: 'Client / Entity Name', type: 'text' },
          { name: 'purposes', label: 'Purposes for Collecting, Using, and Disclosing Information', type: 'longtext' },
          { name: 'informationTypes', label: 'Types of Personal / Confidential Information Required', type: 'longtext' },
        ],
      },
      {
        title: 'Technology and Service Providers',
        fields: [
          { name: 'emailApproved', label: 'Email / electronic communication approved', type: 'checkbox' },
          { name: 'portalApproved', label: 'Secure client portal approved', type: 'checkbox' },
          { name: 'cloudProviders', label: 'Cloud, Hosting, Backup, Document, Payroll, Tax, and Other Providers', type: 'longtext' },
          { name: 'storageLocations', label: 'Known Data Storage / Processing Locations', type: 'longtext' },
          { name: 'materialRisks', label: 'Material Technology or Communication Risks Explained', type: 'longtext' },
          { name: 'aiUse', label: 'Secure AI-assisted tools may be used subject to confidentiality and human review', type: 'checkbox' },
          { name: 'aiLimits', label: 'Approved AI Purpose, Provider, Data Limits, and Human Validation', type: 'longtext' },
        ],
      },
      {
        title: 'Retention, Access and Choices',
        fields: [
          { name: 'retentionPeriod', label: 'Retention and Secure Destruction Policy / Period', type: 'longtext' },
          { name: 'accessCorrection', label: 'How the Client Can Request Access or Correction', type: 'longtext' },
          { name: 'withdrawalImpact', label: 'How Consent Can Be Withdrawn and Service Impact', type: 'longtext' },
          { name: 'privacyOfficer', label: 'Privacy Officer / Contact', type: 'text' },
          { name: 'clientSignature', label: 'Client / Authorized Representative Signature', type: 'text' },
          { name: 'signatureDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'cra_rep_authorization_checklist',
    title: 'CRA Representative Authorization Checklist',
    description: 'Tracks CRA access method, scope, confirmation, retention, expiry, and revocation without treating the engagement letter as authorization.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Authorization Details',
        fields: [
          { name: 'clientName', label: 'Client / Entity Name', type: 'text' },
          { name: 'programAccounts', label: 'CRA Program Accounts Covered', type: 'longtext' },
          { name: 'representativeId', label: 'RepID / GroupID / Business Number', type: 'text' },
          { name: 'accessLevel', label: 'Requested Access Level', type: 'text' },
          { name: 'expiryDate', label: 'Expiry Date (if any)', type: 'text' },
        ],
      },
      {
        title: 'Submission and Confirmation',
        fields: [
          { name: 'onlineRequest', label: 'Request submitted through Represent a Client', type: 'checkbox' },
          { name: 'offlineAut01', label: 'AUT-01 used only for offline CRA access', type: 'checkbox' },
          { name: 'clientConfirmationRequired', label: 'Client advised to confirm request in CRA My Account / My Business Account', type: 'checkbox' },
          { name: 'confirmationDeadline', label: 'Client Confirmation Deadline (normally within 10 business days if required)', type: 'text' },
          { name: 'authorizationVerified', label: 'Access verified before relying on authorization', type: 'checkbox' },
        ],
      },
      {
        title: 'Records and Closure',
        fields: [
          { name: 'efilePagesRetained', label: 'Applicable signed EFILE authorization pages retained for required period', type: 'checkbox' },
          { name: 'scopeReviewed', label: 'Access limited to the client, accounts, level, and period required', type: 'checkbox' },
          { name: 'revokeDate', label: 'Review / Revoke Access Date', type: 'text' },
          { name: 'completedBy', label: 'Completed By', type: 'text' },
          { name: 'completedDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'compilation_management_acknowledgement',
    title: 'Compilation Engagement — Management Acknowledgement',
    description: 'Captures CSRS 4200 acceptance, intended users, basis of accounting, and management responsibility for compiled information.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Engagement Context',
        fields: [
          { name: 'entityName', label: 'Entity Name', type: 'text' },
          { name: 'periodEnd', label: 'Financial Period End', type: 'text' },
          { name: 'intendedUse', label: 'Intended Use of the Compiled Financial Information', type: 'longtext' },
          { name: 'intendedUsers', label: 'Management and Known Third-Party Users', type: 'longtext' },
          { name: 'thirdPartyConditions', label: 'Third-Party Conditions / Required Form of Information', type: 'longtext' },
        ],
      },
      {
        title: 'Basis of Accounting and Entity Understanding',
        fields: [
          { name: 'basisDescription', label: 'Selected Basis of Accounting and Description for the Notes', type: 'longtext' },
          { name: 'basisAppropriate', label: 'Management acknowledges the basis is appropriate for intended use', type: 'checkbox' },
          { name: 'systemsUnderstanding', label: 'Entity business, operations, accounting systems, and records documented', type: 'checkbox' },
        ],
      },
      {
        title: 'Management Acknowledgement',
        paragraphs: [
          'Management is responsible for the accompanying compiled financial information, including its accuracy, completeness, and the selected basis of accounting. The practitioner provides no assurance and management must review and approve the final information before release.',
        ],
        fields: [
          { name: 'completeInformation', label: 'All relevant, accurate, and complete information has been provided', type: 'checkbox' },
          { name: 'finalApproval', label: 'Management approves the final compiled financial information', type: 'checkbox' },
          { name: 'managementName', label: 'Management Representative (print name / title)', type: 'text' },
          { name: 'managementSignature', label: 'Management Signature', type: 'text' },
          { name: 'signatureDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'fintrac_applicability_kyc',
    title: 'FINTRAC Applicability & Client Identification',
    description: 'A conditional screen for accountants who perform a triggering financial activity on a client’s behalf or instructions.',
    category: 'client_compliance',
    sections: [
      {
        title: 'Applicability Screen',
        paragraphs: [
          'Accounting services alone are not automatically covered. Audit, review, compilation, and receiving professional fees do not by themselves trigger the accountant obligations. Complete the remaining sections only when the accountant or accounting firm performs a listed financial activity for the client or on the client\'s instructions.',
        ],
        fields: [
          { name: 'receivePayFunds', label: 'Receiving or paying funds or virtual currency for the client', type: 'checkbox' },
          { name: 'buySellAssets', label: 'Purchasing or selling securities, real property, business assets, or entities', type: 'checkbox' },
          { name: 'transferAssets', label: 'Transferring funds, virtual currency, or securities', type: 'checkbox' },
          { name: 'noTrigger', label: 'No triggering activity identified — document reason and stop here', type: 'checkbox' },
          { name: 'applicabilityNotes', label: 'Applicability Decision and Reason', type: 'longtext' },
        ],
      },
      {
        title: 'Identity and Beneficial Ownership (if triggered)',
        fields: [
          { name: 'identityMethod', label: 'Identity Verification Method, Source, Reference, and Date', type: 'longtext' },
          { name: 'entityRecords', label: 'Entity Existence / Registration Records', type: 'longtext' },
          { name: 'beneficialOwners', label: 'Beneficial Owners, Ownership / Control, and Verification Measures', type: 'longtext' },
          { name: 'thirdParty', label: 'Third-Party Determination and Details', type: 'longtext' },
        ],
      },
      {
        title: 'Purpose, Risk and Monitoring (if triggered)',
        fields: [
          { name: 'purposeNature', label: 'Purpose and Intended Nature of Business Relationship / Transaction', type: 'longtext' },
          { name: 'sourceOfFunds', label: 'Source of Funds / Virtual Currency and Supporting Information', type: 'longtext' },
          { name: 'pepHio', label: 'PEP / HIO, Family Member, or Close Associate Determination', type: 'longtext' },
          { name: 'riskRating', label: 'Money-Laundering / Terrorist-Financing Risk Rating and Rationale', type: 'longtext' },
          { name: 'monitoring', label: 'Ongoing Monitoring and Enhanced Measures Required', type: 'longtext' },
          { name: 'reportRecordAction', label: 'Reporting, Recordkeeping, or Escalation Action / Deadline', type: 'longtext' },
          { name: 'reviewer', label: 'Completed / Reviewed By', type: 'text' },
          { name: 'reviewDate', label: 'Date', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'rental_property_expense',
    title: 'Investment / Rental Property Expense Sheet (T1 — Form T776)',
    description: 'Organizes rental income and expenses by the same categories as CRA Form T776, ready to hand to your accountant.',
    sections: [
      {
        title: 'Property Information',
        fields: [
          { name: 'propertyAddress', label: 'Property Address', type: 'text' },
          { name: 'ownershipPercent', label: 'Your Ownership %', type: 'text' },
          { name: 'numberOfUnits', label: 'Number of Units', type: 'text' },
          { name: 'propertyType', label: 'Property Type (residential / commercial)', type: 'text' },
        ],
      },
      {
        title: 'Rental Income',
        fields: [
          { name: 'grossRents', label: 'Gross Rents Received', type: 'text' },
          { name: 'otherIncome', label: 'Other Related Income', type: 'text' },
        ],
      },
      {
        title: 'Current Expenses (T776 categories)',
        table: {
          columns: ['Category', 'Amount'],
          rowLabels: [
            'Advertising',
            'Insurance',
            'Interest & Bank Charges',
            'Office Expenses',
            'Professional Fees',
            'Management & Administration Fees',
            'Repairs & Maintenance',
            'Salaries, Wages & Benefits',
            'Property Taxes',
            'Travel',
            'Utilities',
            'Motor Vehicle Expenses',
            'Other Expenses',
          ],
        },
      },
      {
        title: 'Capital Improvements (separate from repairs)',
        table: { columns: ['Description', 'Amount'], rows: 4 },
      },
    ],
  },
  {
    id: 'uber_driver_expense',
    title: 'Uber / Rideshare Driver Expense Sheet',
    description: 'Income and vehicle expense categories for rideshare drivers filing a T1 with self-employment income.',
    sections: [
      {
        title: 'Period & Platform',
        fields: [
          { name: 'periodCovered', label: 'Period Covered', type: 'text' },
          { name: 'platforms', label: 'Platform(s) Driven For (Uber, Lyft, etc.)', type: 'text' },
        ],
      },
      {
        title: 'Vehicle Information',
        fields: [
          { name: 'vehicleInfo', label: 'Vehicle Make / Model / Year', type: 'text' },
          { name: 'businessUsePercent', label: 'Business Use %', type: 'text' },
        ],
      },
      {
        title: 'Income',
        fields: [
          { name: 'grossFares', label: 'Total Gross Fares / Trip Income (from platform tax summary)', type: 'text' },
          { name: 'platformFees', label: 'Platform Fees Already Deducted', type: 'text' },
        ],
      },
      {
        title: 'Vehicle & Other Expenses',
        table: {
          columns: ['Category', 'Amount'],
          rowLabels: [
            'Fuel',
            'Vehicle Insurance',
            'Lease / Loan Interest',
            'Maintenance & Repairs',
            'Car Washes',
            'Parking & Tolls (407 / Highway)',
            'Phone / Data Plan',
            'Supplies (water, mints, etc.)',
            'Other',
          ],
        },
      },
      {
        title: 'Kilometre Log',
        fields: [
          { name: 'totalKm', label: 'Total KM Driven (period)', type: 'text' },
          { name: 'businessKm', label: 'Business KM Driven (period)', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'truck_driver_expense',
    title: 'Truck Driver Expense Sheet',
    description: 'Income and expense categories for owner-operator / long-haul truck drivers filing a T1 with self-employment income.',
    sections: [
      {
        title: 'Period & Truck Information',
        fields: [
          { name: 'periodCovered', label: 'Period Covered', type: 'text' },
          { name: 'truckInfo', label: 'Truck Make / Model / Year / Unit #', type: 'text' },
        ],
      },
      {
        title: 'Income',
        fields: [{ name: 'grossFreightIncome', label: 'Gross Freight Income', type: 'text' }],
      },
      {
        title: 'Expenses',
        table: {
          columns: ['Category', 'Amount'],
          rowLabels: [
            'Fuel',
            'Truck Insurance',
            'Lease / Loan Payments',
            'Repairs & Maintenance',
            'Tires',
            'Permits & Licences (IFTA / IRP)',
            'Tolls & Scales',
            'Truck Washes',
            'Lodging',
            'ELD / Log Device Subscription',
            'Cell Phone',
            'Other',
          ],
        },
      },
      {
        title: 'Meals While Away From Home',
        fields: [
          { name: 'daysAway', label: 'Number of Days Away From Home', type: 'text' },
          { name: 'mealMethod', label: 'Meal Claim Method (simplified / detailed receipts)', type: 'text' },
        ],
      },
    ],
  },
];

export function getFormTemplate(id: string): FormTemplate | undefined {
  return FORM_TEMPLATES.find((f) => f.id === id);
}
