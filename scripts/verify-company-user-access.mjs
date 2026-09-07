import fs from 'node:fs';

const failures = [];
const migration = fs.readFileSync('src/main/db/migrations/0066_company_users.sql', 'utf8');
for (const field of ['first_name', 'last_name', 'email', 'role', 'permissions_json', 'status', 'invitation_token']) {
  if (!migration.includes(field)) failures.push(`Company-user migration is missing ${field}.`);
}
if (!migration.includes('UNIQUE INDEX idx_company_users_email')) failures.push('Company user emails are not unique per company.');

const session = fs.readFileSync('src/main/accessSession.ts', 'utf8');
for (const permission of ['sales', 'purchases', 'banking', 'accounting', 'payroll', 'tax', 'inventory', 'company', 'users']) {
  if (!session.includes(`'${permission}'`)) failures.push(`Main-process enforcement is missing ${permission}.`);
}
if (!session.includes('state.permissions.includes(required)') && !session.includes('currentPermissions.includes(required)')) failures.push('Mutation permissions are not enforced in the main process.');
if (!session.includes('AsyncLocalStorage') || !session.includes('runWithAccessSession')) failures.push('Simultaneous windows do not have isolated access sessions.');

const handlers = fs.readFileSync('src/main/ipc/accessUsers.handlers.ts', 'utf8');
if (!handlers.includes("createHash('sha256')")) failures.push('Invitation tokens are stored without hashing.');
if (!handlers.includes('A pending user already exists') && !handlers.includes('user already exists with this email')) failures.push('Duplicate invitation protection is missing.');
if (!handlers.includes('accessSetupThreeUserDemo') || !handlers.includes('accessSwitchUser')) failures.push('Three-user test setup or local session switching is missing.');

const page = fs.readFileSync('src/renderer/features/access-permissions/AccessPermissionsPage.tsx', 'utf8');
for (const control of ['+ Add User', 'Create Invite', 'Copy new invite', 'Cancel invite', 'Suspend access', 'Custom role']) {
  if (!page.includes(control)) failures.push(`Users & Access screen is missing ${control}.`);
}

if (failures.length) {
  console.error('Company-user access verification FAILED:');
  failures.forEach((failure) => console.error(` - ${failure}`));
  process.exit(2);
}
console.log('Company-user access verification PASSED.');
console.log(' Company-scoped users, hashed invites, preset/custom roles, status controls and engine-level permission checks are present.');
