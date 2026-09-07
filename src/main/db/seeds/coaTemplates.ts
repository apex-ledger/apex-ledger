import { GENERAL_SERVICES_TEMPLATE } from './coa_template.general_services.seed';
import { RETAIL_TEMPLATE } from './coa_template.retail.seed';
import type { CoaTemplate } from './coaTemplateTypes';

export const COA_TEMPLATES: CoaTemplate[] = [GENERAL_SERVICES_TEMPLATE, RETAIL_TEMPLATE];

export function getCoaTemplate(id: string): CoaTemplate | undefined {
  return COA_TEMPLATES.find((t) => t.id === id);
}

export { seedChartOfAccounts } from './coaTemplateTypes';
