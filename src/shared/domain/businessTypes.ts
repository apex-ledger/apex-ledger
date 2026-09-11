export interface BusinessType {
  id: string;
  label: string;
}

export const BUSINESS_TYPES: BusinessType[] = [
  { id: 'general', label: 'General / Other' },
  { id: 'uber_driver', label: 'Uber / Rideshare Driver' },
  { id: 'truck_driver', label: 'Trucking Company / Owner-Operator' },
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'car_repair_collision', label: 'Car, Truck Repair & Collision Centre' },
  { id: 'hvac_technician', label: 'HVAC Technician' },
  { id: 'plumber', label: 'Plumber' },
  { id: 'handyman_construction', label: 'Handyman / Small Construction' },
  { id: 'realtor', label: 'Realtor / Real Estate Agent' },
  { id: 'content_creator', label: 'YouTuber / Content Creator' },
  { id: 'insurance_advisor', label: 'Insurance Advisor' },
  { id: 'it_professional_wfh', label: 'IT Professional (Work From Home)' },
  { id: 'landscaping_lawn_care', label: 'Landscaping & Lawn Care' },
  { id: 'cleaning_services', label: 'Cleaning Services' },
  { id: 'salon_spa_barber', label: 'Salon / Spa / Barber' },
  { id: 'fitness_trainer', label: 'Personal Trainer / Fitness Instructor' },
  { id: 'daycare_childcare', label: 'Daycare / Home Childcare' },
  { id: 'photographer_videographer', label: 'Photographer / Videographer' },
  { id: 'consultant_freelancer', label: 'Consultant / Freelancer' },
  { id: 'retail_store', label: 'Retail Store' },
  { id: 'ecommerce_online_store', label: 'E-commerce / Online Store' },
  { id: 'farming_agriculture', label: 'Farming / Agriculture' },
  { id: 'medical_dental_professional', label: 'Medical / Dental Professional' },
  { id: 'law_firm', label: 'Law Firm / Legal Professional' },
  { id: 'bookkeeping_accounting', label: 'Bookkeeping / Accounting Firm' },
  { id: 'rental_property_landlord', label: 'Rental Property / Landlord' },
  { id: 'courier_delivery', label: 'Courier / Delivery Service' },
  { id: 'taxi_limo', label: 'Taxi / Limousine Service' },
  { id: 'non_profit_charity', label: 'Non-Profit / Charity' },
  { id: 'auto_dealer', label: 'Auto / Truck Dealer' },
  { id: 'grocery_store', label: 'Grocery Store' },
  { id: 'convenience_store', label: 'Convenience Store' },
  { id: 'drug_store', label: 'Drug Store / Pharmacy' },
  { id: 'cannabis_retail', label: 'Cannabis Retail Store' },
];

export interface SuggestedCategory {
  name: string;
  accountSubtype: 'Cost of Sales' | 'Operating Expense' | 'Revenue';
  /** A reasonable starting GIFI mapping — review and adjust per the accountant's own judgment.
   * Null where no CRA-confirmed code was found (see gifi_codes.seed.ts) rather than guessed. */
  gifiCode: string | null;
}

/** Curated expense categories most relevant to each trade — shown first in category pickers and
 * offered as one-click "suggested accounts" to add to the chart of accounts. This is a starting
 * point, not an exhaustive or authoritative list; every account stays visible and usable
 * regardless of business type, and GIFI mappings here are reasonable defaults to review, not
 * guaranteed-correct filings. Categories overlap with the Uber/Truck driver PDF expense-sheet
 * templates so the two features stay consistent. GIFI codes are cross-checked against CRA's own
 * published GIFI examples where possible — see gifi_codes.seed.ts for the full confidence key. */
export const BUSINESS_TYPE_EXPENSE_CATEGORIES: Record<string, SuggestedCategory[]> = {
  // The standard CRA Schedule 125 (T2 Income Statement Information) operating-expense line items —
  // shown for every business type (not just "General"), since these apply broadly regardless of
  // trade.
  general: [
    { name: 'Advertising & Promotion', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Bad Debts', accountSubtype: 'Operating Expense', gifiCode: '8590' },
    { name: 'Bank Charges', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Business Taxes & Licences', accountSubtype: 'Operating Expense', gifiCode: '8760' },
    { name: 'Delivery & Freight', accountSubtype: 'Operating Expense', gifiCode: '9275' },
    { name: 'Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Interest & Bank Charges (Long-Term Debt)', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Office Supplies', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Legal, Accounting & Professional Fees', accountSubtype: 'Operating Expense', gifiCode: '8860' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
    { name: 'Motor Vehicle Expenses', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Amortization / Depreciation', accountSubtype: 'Operating Expense', gifiCode: '8670' },
    { name: 'Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Salaries, Wages & Benefits', accountSubtype: 'Operating Expense', gifiCode: '9060' },
    { name: 'Subcontract Costs', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { name: 'Cell Phone', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Telephone & Utilities', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Travel Expenses', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { name: 'Cost of Goods Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Other Operating Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Commission Income', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'Consulting / Professional Fees', accountSubtype: 'Revenue', gifiCode: '8000' },
    { name: 'Other Income', accountSubtype: 'Revenue', gifiCode: '8230' },
  ],
  uber_driver: [
    { name: 'Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Vehicle Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Vehicle Lease / Loan Interest', accountSubtype: 'Operating Expense', gifiCode: '8915' },
    { name: 'Vehicle Maintenance & Repairs', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Car Washes', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Parking & Tolls', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Cell Phone', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Rideshare Supplies', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  truck_driver: [
    { name: 'Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Truck Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Truck Lease / Loan Payments', accountSubtype: 'Operating Expense', gifiCode: '8915' },
    { name: 'Truck Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Tires', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Permits & Licences', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Tolls & Scales', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Truck Washes', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Lodging', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { name: 'ELD / Log Device Subscription', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  restaurant: [
    { name: 'Food & Beverage Costs', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Kitchen Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Restaurant Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Smallwares', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Menu & Signage', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'POS & Delivery App Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Staff Meals', accountSubtype: 'Operating Expense', gifiCode: '8620' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
    { name: 'Liquor Licence Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
  ],
  car_repair_collision: [
    { name: 'Auto Parts', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Shop Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Paint & Materials', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Equipment Repairs', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Tool Purchases', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Waste Disposal', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Shop Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Towing Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  hvac_technician: [
    { name: 'Refrigerant & Materials', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Tools & Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Vehicle Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Vehicle Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Permits & Inspection Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Uniforms & Safety Gear', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  plumber: [
    { name: 'Pipes & Fittings', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Tools & Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Vehicle Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Vehicle Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Permits & Inspection Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Uniforms & Safety Gear', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  handyman_construction: [
    { name: 'Lumber & Materials', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Subcontractor Labour', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { name: 'Tools & Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Vehicle Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Equipment Rental', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Permits & Inspection Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Waste Disposal', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  realtor: [
    { name: 'MLS & Real Estate Board Fees', accountSubtype: 'Operating Expense', gifiCode: '8761' },
    { name: 'Real Estate Licence Renewal', accountSubtype: 'Operating Expense', gifiCode: '8760' },
    { name: 'Errors & Omissions Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Brokerage / Desk Fees', accountSubtype: 'Operating Expense', gifiCode: '8869' },
    { name: 'Referral Fees Paid', accountSubtype: 'Operating Expense', gifiCode: '9061' },
    { name: 'Advertising & Signage', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Client Closing Gifts', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Professional Photography & Staging', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Vehicle Fuel & Mileage', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Home Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  content_creator: [
    { name: 'Camera & Video Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Editing Software Subscriptions', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Studio / Set Props & Supplies', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Music & Stock Footage Licensing', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Internet & Phone', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Platform & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Advertising & Promotion', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Travel for Content Shoots', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { name: 'Home Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  insurance_advisor: [
    { name: 'Errors & Omissions Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Licensing & Continuing Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Referral Fees Paid', accountSubtype: 'Operating Expense', gifiCode: '9061' },
    { name: 'Client Gifts', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Office Supplies & Software', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Vehicle Fuel & Mileage', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Cell Phone', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Marketing & Advertising', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Home Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
    { name: 'Life Insurance Commission', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'Critical Illness Insurance Commission', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'Disability Insurance Commission', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'Super Visa Insurance Commission', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'Visitor Insurance Commission', accountSubtype: 'Revenue', gifiCode: '8120' },
    { name: 'RRSP / TFSA / RESP / FHSA Advisory Fees', accountSubtype: 'Revenue', gifiCode: '8120' },
  ],
  it_professional_wfh: [
    { name: 'Computer Hardware & Peripherals', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Software Subscriptions & Licences', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Cloud Hosting & Domain Fees', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Internet & Phone', accountSubtype: 'Operating Expense', gifiCode: '9225' },
    { name: 'Professional Certifications & Training', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Contractor / Subcontractor Fees', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { name: 'Home Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  landscaping_lawn_care: [
    { name: 'Plants, Sod & Materials', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Equipment Fuel', accountSubtype: 'Operating Expense', gifiCode: '9224' },
    { name: 'Equipment Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Tools & Equipment Purchases', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Equipment Rental', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Seasonal Labour', accountSubtype: 'Operating Expense', gifiCode: '9060' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  cleaning_services: [
    { name: 'Cleaning Supplies', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Equipment Purchases', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Equipment Repairs', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Vehicle Fuel & Mileage', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Uniforms', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Bonding & Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  salon_spa_barber: [
    { name: 'Salon Product Inventory', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Chair / Booth Rental', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Equipment & Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Licensing & Continuing Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Laundry & Linens', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  fitness_trainer: [
    { name: 'Gym / Studio Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Fitness Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Certifications & Continuing Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Client Programming Software', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  daycare_childcare: [
    { name: 'Childcare Supplies & Materials', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Food & Snacks', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Toys & Educational Materials', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Licensing & Inspection Fees', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'First Aid & Safety Training', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  photographer_videographer: [
    { name: 'Camera & Video Equipment', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Editing Software Subscriptions', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Studio Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Props & Backdrops', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Photo Printing & Album Costs', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Travel for Shoots', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  consultant_freelancer: [
    { name: 'Software Subscriptions', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Professional Development & Courses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Contractor / Subcontractor Fees', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { name: 'Client Travel', accountSubtype: 'Operating Expense', gifiCode: '9200' },
    { name: 'Home Office Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  retail_store: [
    { name: 'Merchandise Purchases', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Store Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Point of Sale & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Store Supplies & Bags', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Shrinkage / Inventory Loss', accountSubtype: 'Cost of Sales', gifiCode: '8458' },
    { name: 'Signage & Displays', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  ecommerce_online_store: [
    { name: 'Product / Inventory Purchases', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Shipping & Fulfillment', accountSubtype: 'Cost of Sales', gifiCode: '9274' },
    { name: 'Platform & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Packaging Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Warehouse / Storage Fees', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Online Advertising', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  farming_agriculture: [
    { name: 'Seed, Feed & Fertilizer', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Fuel & Equipment Operating Costs', accountSubtype: 'Operating Expense', gifiCode: '9224' },
    { name: 'Equipment Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Land / Equipment Lease Payments', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Crop / Livestock Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Veterinary & Animal Health', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  medical_dental_professional: [
    { name: 'Medical / Dental Supplies', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Clinic Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Malpractice / Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Licensing & Continuing Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Lab & Diagnostic Fees', accountSubtype: 'Operating Expense', gifiCode: '8866' },
    { name: 'Equipment Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  law_firm: [
    { name: 'Law Society / Bar Fees', accountSubtype: 'Operating Expense', gifiCode: '8761' },
    { name: 'Malpractice / E&O Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Legal Research Subscriptions', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Court & Filing Fees', accountSubtype: 'Operating Expense', gifiCode: '8764' },
    { name: 'Continuing Legal Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Office Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  bookkeeping_accounting: [
    { name: 'Software Subscriptions', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Professional Body Membership Fees', accountSubtype: 'Operating Expense', gifiCode: '8761' },
    { name: 'Continuing Professional Education', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Professional Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Office Rent', accountSubtype: 'Operating Expense', gifiCode: '8910' },
    { name: 'Contractor / Subcontractor Fees', accountSubtype: 'Operating Expense', gifiCode: '9110' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  rental_property_landlord: [
    { name: 'Property Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Property Management Fees', accountSubtype: 'Operating Expense', gifiCode: '8860' },
    { name: 'Property Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Property Taxes', accountSubtype: 'Operating Expense', gifiCode: '9180' },
    { name: 'Mortgage Interest', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Utilities Paid on Behalf of Tenants', accountSubtype: 'Operating Expense', gifiCode: '9220' },
    { name: 'Landscaping & Snow Removal', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  courier_delivery: [
    { name: 'Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Vehicle Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Vehicle Lease / Loan Payments', accountSubtype: 'Operating Expense', gifiCode: '8915' },
    { name: 'Vehicle Maintenance & Repairs', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Delivery Platform Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Parking & Tolls', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  taxi_limo: [
    { name: 'Fuel', accountSubtype: 'Operating Expense', gifiCode: '9281' },
    { name: 'Vehicle Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Vehicle Lease / Loan Payments', accountSubtype: 'Operating Expense', gifiCode: '8915' },
    { name: 'Vehicle Maintenance & Repairs', accountSubtype: 'Operating Expense', gifiCode: '8962' },
    { name: 'Taxi / Limo Licensing & Permits', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Dispatch & Booking Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  non_profit_charity: [
    { name: 'Program Costs', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Fundraising Expenses', accountSubtype: 'Operating Expense', gifiCode: '8521' },
    { name: 'Grant & Donor Reporting', accountSubtype: 'Operating Expense', gifiCode: '8860' },
    { name: 'Volunteer Expenses', accountSubtype: 'Operating Expense', gifiCode: '9270' },
    { name: 'Directors & Officers Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  auto_dealer: [
    { name: 'Cost of New Vehicles Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Cost of Used Vehicles Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Reconditioning Costs', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Floorplan Interest Expense', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Sales Commissions', accountSubtype: 'Operating Expense', gifiCode: '9060' },
    { name: 'Licensing & Dealer Fees', accountSubtype: 'Operating Expense', gifiCode: '8760' },
    { name: 'Finance & Insurance (F&I) Income', accountSubtype: 'Revenue', gifiCode: '8000' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  grocery_store: [
    { name: 'Cost of Groceries Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Spoilage & Shrinkage', accountSubtype: 'Cost of Sales', gifiCode: '8458' },
    { name: 'Refrigeration Repairs & Maintenance', accountSubtype: 'Operating Expense', gifiCode: '8960' },
    { name: 'Point of Sale & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Store Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Lottery & Tobacco Commission Income', accountSubtype: 'Revenue', gifiCode: '8230' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  convenience_store: [
    { name: 'Cost of Merchandise Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Cost of Tobacco Products Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Point of Sale & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Security & Surveillance', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Store Supplies', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Lottery Commission Income', accountSubtype: 'Revenue', gifiCode: '8230' },
    { name: 'ATM & Money Order Fee Income', accountSubtype: 'Revenue', gifiCode: '8230' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  drug_store: [
    { name: 'Cost of Prescription Drugs Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Cost of Front Store Merchandise Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Pharmacist Wages & Benefits', accountSubtype: 'Operating Expense', gifiCode: '9060' },
    { name: 'Professional Liability Insurance', accountSubtype: 'Operating Expense', gifiCode: '8690' },
    { name: 'Pharmacy Licensing Fees', accountSubtype: 'Operating Expense', gifiCode: '8760' },
    { name: 'Point of Sale & Insurance Claims Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Dispensing Fee Revenue', accountSubtype: 'Revenue', gifiCode: '8000' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
  cannabis_retail: [
    { name: 'Cost of Cannabis Products Sold', accountSubtype: 'Cost of Sales', gifiCode: '8320' },
    { name: 'Cannabis Excise Duty (Cost of Sales)', accountSubtype: 'Cost of Sales', gifiCode: '8450' },
    { name: 'Security & Surveillance', accountSubtype: 'Operating Expense', gifiCode: '9130' },
    { name: 'Compliance & Seed-to-Sale Software', accountSubtype: 'Operating Expense', gifiCode: '8810' },
    { name: 'Retail Cannabis Licence Fees', accountSubtype: 'Operating Expense', gifiCode: '8760' },
    { name: 'Point of Sale & Payment Processing Fees', accountSubtype: 'Operating Expense', gifiCode: '8710' },
    { name: 'Meals & Entertainment', accountSubtype: 'Operating Expense', gifiCode: '8523' },
  ],
};

export function businessTypeLabel(id: string | null): string | null {
  return BUSINESS_TYPES.find((t) => t.id === id)?.label ?? null;
}

/** Every category from every business type combined, deduplicated by name and sorted
 * alphabetically — lets the Company Settings "suggested categories" panel offer a searchable
 * catalog covering every trade, not just whichever one is currently selected (a landscaper might
 * still want "Home Office Expenses" from the IT professional list, say). */
export const ALL_SUGGESTED_CATEGORIES: SuggestedCategory[] = (() => {
  const seen = new Set<string>();
  const combined: SuggestedCategory[] = [];
  for (const categories of Object.values(BUSINESS_TYPE_EXPENSE_CATEGORIES)) {
    for (const category of categories) {
      const key = category.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(category);
    }
  }
  return combined.sort((a, b) => a.name.localeCompare(b.name));
})();

/** The trade-specific categories for this business type, plus the standard Schedule 125 baseline
 * (BUSINESS_TYPE_EXPENSE_CATEGORIES.general) every business benefits from — deduplicated by name
 * so a category present in both (e.g. a trade list that already lists "Insurance") isn't offered
 * twice. Trade-specific categories are listed first. */
export function suggestedCategoriesForBusinessType(businessType: string | null): SuggestedCategory[] {
  const specific = BUSINESS_TYPE_EXPENSE_CATEGORIES[businessType ?? 'general'] ?? [];
  const general = BUSINESS_TYPE_EXPENSE_CATEGORIES.general ?? [];
  const seen = new Set<string>();
  const combined: SuggestedCategory[] = [];
  for (const category of [...specific, ...general]) {
    const key = category.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(category);
  }
  return combined;
}
