/**
 * What the app already knows about Canadian places, so a province never has to be picked by hand
 * when the city or the postal code already says which one it is.
 *
 *   Postal code → province   the first letter of a Canadian postal code is fixed by Canada Post:
 *                            A Newfoundland and Labrador, B Nova Scotia, C Prince Edward Island,
 *                            E New Brunswick, G/H/J Quebec, K/L/M/N/P Ontario, R Manitoba,
 *                            S Saskatchewan, T Alberta, V British Columbia, X Nunavut and the
 *                            Northwest Territories, Y Yukon.
 *   City → province          the larger municipalities, one province each. A city that exists in
 *                            two provinces (there is a Windsor in Ontario and one in Nova Scotia)
 *                            lists the larger one; the postal code settles the rest.
 *
 * What a person types on top of this is learned per machine (see textSuggestions.ts), so an
 * unlisted town becomes a suggestion, with its province, after the first time.
 */
export type ProvinceCode = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

const POSTAL_LETTER_PROVINCE: Record<string, ProvinceCode> = {
  A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC', K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON', R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT',
};

/** The province a Canadian postal code belongs to, from its first letter; null when the text is
 * not the start of a Canadian postal code. X0A–X0C are Nunavut; other X codes the Northwest Territories. */
export function provinceFromPostalCode(postalCode: string): ProvinceCode | null {
  const cleaned = postalCode.trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[ABCEGHJ-NPRSTVXY]\d/.test(cleaned)) return null;
  if (cleaned.startsWith('X0') && /^X0[ABC]/.test(cleaned)) return 'NU';
  return POSTAL_LETTER_PROVINCE[cleaned[0]] ?? null;
}

export const CANADIAN_CITIES: ReadonlyArray<{ city: string; province: ProvinceCode }> = [
  // Ontario
  { city: 'Toronto', province: 'ON' }, { city: 'Ottawa', province: 'ON' }, { city: 'Mississauga', province: 'ON' }, { city: 'Brampton', province: 'ON' },
  { city: 'Hamilton', province: 'ON' }, { city: 'London', province: 'ON' }, { city: 'Markham', province: 'ON' }, { city: 'Vaughan', province: 'ON' },
  { city: 'Kitchener', province: 'ON' }, { city: 'Windsor', province: 'ON' }, { city: 'Richmond Hill', province: 'ON' }, { city: 'Oakville', province: 'ON' },
  { city: 'Burlington', province: 'ON' }, { city: 'Oshawa', province: 'ON' }, { city: 'Barrie', province: 'ON' }, { city: 'St. Catharines', province: 'ON' },
  { city: 'Cambridge', province: 'ON' }, { city: 'Kingston', province: 'ON' }, { city: 'Guelph', province: 'ON' }, { city: 'Whitby', province: 'ON' },
  { city: 'Ajax', province: 'ON' }, { city: 'Thunder Bay', province: 'ON' }, { city: 'Waterloo', province: 'ON' }, { city: 'Chatham-Kent', province: 'ON' },
  { city: 'Brantford', province: 'ON' }, { city: 'Pickering', province: 'ON' }, { city: 'Niagara Falls', province: 'ON' }, { city: 'Newmarket', province: 'ON' },
  { city: 'Peterborough', province: 'ON' }, { city: 'Sarnia', province: 'ON' }, { city: 'Sault Ste. Marie', province: 'ON' }, { city: 'Milton', province: 'ON' },
  { city: 'Caledon', province: 'ON' }, { city: 'Halton Hills', province: 'ON' }, { city: 'Aurora', province: 'ON' }, { city: 'Welland', province: 'ON' },
  { city: 'North Bay', province: 'ON' }, { city: 'Belleville', province: 'ON' }, { city: 'Cornwall', province: 'ON' }, { city: 'Stouffville', province: 'ON' },
  { city: 'Clarington', province: 'ON' }, { city: 'Sudbury', province: 'ON' }, { city: 'Greater Sudbury', province: 'ON' }, { city: 'Woodstock', province: 'ON' },
  { city: 'Orillia', province: 'ON' }, { city: 'Stratford', province: 'ON' }, { city: 'Timmins', province: 'ON' }, { city: 'Orangeville', province: 'ON' },
  { city: 'Bradford', province: 'ON' }, { city: 'Innisfil', province: 'ON' }, { city: 'Georgina', province: 'ON' }, { city: 'Scarborough', province: 'ON' },
  { city: 'Etobicoke', province: 'ON' }, { city: 'North York', province: 'ON' }, { city: 'Nepean', province: 'ON' }, { city: 'Kanata', province: 'ON' },
  { city: 'Brockville', province: 'ON' }, { city: 'Owen Sound', province: 'ON' }, { city: 'Collingwood', province: 'ON' }, { city: 'Cobourg', province: 'ON' },
  { city: 'Leamington', province: 'ON' }, { city: 'Grimsby', province: 'ON' }, { city: 'Lindsay', province: 'ON' }, { city: 'Kawartha Lakes', province: 'ON' },
  // Quebec
  { city: 'Montreal', province: 'QC' }, { city: 'Montréal', province: 'QC' }, { city: 'Quebec City', province: 'QC' }, { city: 'Québec', province: 'QC' },
  { city: 'Laval', province: 'QC' }, { city: 'Gatineau', province: 'QC' }, { city: 'Longueuil', province: 'QC' }, { city: 'Sherbrooke', province: 'QC' },
  { city: 'Saguenay', province: 'QC' }, { city: 'Lévis', province: 'QC' }, { city: 'Trois-Rivières', province: 'QC' }, { city: 'Terrebonne', province: 'QC' },
  { city: 'Saint-Jean-sur-Richelieu', province: 'QC' }, { city: 'Repentigny', province: 'QC' }, { city: 'Brossard', province: 'QC' }, { city: 'Drummondville', province: 'QC' },
  { city: 'Saint-Jérôme', province: 'QC' }, { city: 'Granby', province: 'QC' }, { city: 'Blainville', province: 'QC' }, { city: 'Dollard-des-Ormeaux', province: 'QC' },
  { city: 'Pointe-Claire', province: 'QC' }, { city: 'Saint-Laurent', province: 'QC' }, { city: 'Mirabel', province: 'QC' }, { city: 'Shawinigan', province: 'QC' },
  // British Columbia
  { city: 'Vancouver', province: 'BC' }, { city: 'Surrey', province: 'BC' }, { city: 'Burnaby', province: 'BC' }, { city: 'Richmond', province: 'BC' },
  { city: 'Abbotsford', province: 'BC' }, { city: 'Coquitlam', province: 'BC' }, { city: 'Kelowna', province: 'BC' }, { city: 'Langley', province: 'BC' },
  { city: 'Saanich', province: 'BC' }, { city: 'Delta', province: 'BC' }, { city: 'North Vancouver', province: 'BC' }, { city: 'Kamloops', province: 'BC' },
  { city: 'Nanaimo', province: 'BC' }, { city: 'Victoria', province: 'BC' }, { city: 'Chilliwack', province: 'BC' }, { city: 'Maple Ridge', province: 'BC' },
  { city: 'New Westminster', province: 'BC' }, { city: 'Prince George', province: 'BC' }, { city: 'Port Coquitlam', province: 'BC' }, { city: 'West Vancouver', province: 'BC' },
  { city: 'Vernon', province: 'BC' }, { city: 'Penticton', province: 'BC' }, { city: 'Courtenay', province: 'BC' }, { city: 'Campbell River', province: 'BC' },
  { city: 'Mission', province: 'BC' }, { city: 'Port Moody', province: 'BC' }, { city: 'White Rock', province: 'BC' }, { city: 'Squamish', province: 'BC' },
  // Alberta
  { city: 'Calgary', province: 'AB' }, { city: 'Edmonton', province: 'AB' }, { city: 'Red Deer', province: 'AB' }, { city: 'Lethbridge', province: 'AB' },
  { city: 'St. Albert', province: 'AB' }, { city: 'Medicine Hat', province: 'AB' }, { city: 'Grande Prairie', province: 'AB' }, { city: 'Airdrie', province: 'AB' },
  { city: 'Spruce Grove', province: 'AB' }, { city: 'Leduc', province: 'AB' }, { city: 'Fort McMurray', province: 'AB' }, { city: 'Sherwood Park', province: 'AB' },
  { city: 'Okotoks', province: 'AB' }, { city: 'Cochrane', province: 'AB' }, { city: 'Lloydminster', province: 'AB' }, { city: 'Camrose', province: 'AB' },
  { city: 'Brooks', province: 'AB' }, { city: 'Fort Saskatchewan', province: 'AB' }, { city: 'Chestermere', province: 'AB' }, { city: 'Canmore', province: 'AB' },
  // Manitoba
  { city: 'Winnipeg', province: 'MB' }, { city: 'Brandon', province: 'MB' }, { city: 'Steinbach', province: 'MB' }, { city: 'Thompson', province: 'MB' },
  { city: 'Portage la Prairie', province: 'MB' }, { city: 'Winkler', province: 'MB' }, { city: 'Selkirk', province: 'MB' }, { city: 'Morden', province: 'MB' },
  // Saskatchewan
  { city: 'Saskatoon', province: 'SK' }, { city: 'Regina', province: 'SK' }, { city: 'Prince Albert', province: 'SK' }, { city: 'Moose Jaw', province: 'SK' },
  { city: 'Swift Current', province: 'SK' }, { city: 'Yorkton', province: 'SK' }, { city: 'North Battleford', province: 'SK' }, { city: 'Estevan', province: 'SK' },
  // Nova Scotia
  { city: 'Halifax', province: 'NS' }, { city: 'Dartmouth', province: 'NS' }, { city: 'Sydney', province: 'NS' }, { city: 'Truro', province: 'NS' },
  { city: 'New Glasgow', province: 'NS' }, { city: 'Kentville', province: 'NS' }, { city: 'Bedford', province: 'NS' }, { city: 'Yarmouth', province: 'NS' },
  // New Brunswick
  { city: 'Moncton', province: 'NB' }, { city: 'Saint John', province: 'NB' }, { city: 'Fredericton', province: 'NB' }, { city: 'Dieppe', province: 'NB' },
  { city: 'Miramichi', province: 'NB' }, { city: 'Bathurst', province: 'NB' }, { city: 'Edmundston', province: 'NB' }, { city: 'Riverview', province: 'NB' },
  // Newfoundland and Labrador
  { city: "St. John's", province: 'NL' }, { city: 'Mount Pearl', province: 'NL' }, { city: 'Corner Brook', province: 'NL' }, { city: 'Conception Bay South', province: 'NL' },
  { city: 'Paradise', province: 'NL' }, { city: 'Grand Falls-Windsor', province: 'NL' }, { city: 'Gander', province: 'NL' }, { city: 'Happy Valley-Goose Bay', province: 'NL' },
  // Prince Edward Island
  { city: 'Charlottetown', province: 'PE' }, { city: 'Summerside', province: 'PE' }, { city: 'Stratford', province: 'PE' }, { city: 'Cornwall', province: 'PE' },
  // Territories
  { city: 'Whitehorse', province: 'YT' }, { city: 'Dawson City', province: 'YT' }, { city: 'Yellowknife', province: 'NT' }, { city: 'Hay River', province: 'NT' },
  { city: 'Inuvik', province: 'NT' }, { city: 'Iqaluit', province: 'NU' }, { city: 'Rankin Inlet', province: 'NU' }, { city: 'Arviat', province: 'NU' },
];

const CITY_PROVINCE = new Map<string, ProvinceCode>();
for (const { city, province } of CANADIAN_CITIES) if (!CITY_PROVINCE.has(city.toLowerCase())) CITY_PROVINCE.set(city.toLowerCase(), province);

/** The province a well-known Canadian city is in, or null when the app has not heard of it. */
export function provinceForKnownCity(city: string): ProvinceCode | null {
  return CITY_PROVINCE.get(city.trim().toLowerCase()) ?? null;
}

/** City names for a suggestion list, each once, in a stable order. */
export const CANADIAN_CITY_NAMES: readonly string[] = Array.from(new Set(CANADIAN_CITIES.map(({ city }) => city)));

/** The province to fill in for an address, in order of how sure the evidence is: what this
 * machine has learned for the city, then the built-in city list, then the postal code. Null when
 * nothing says. Never overrides a province the person has chosen — callers apply it only to an
 * empty field. */
export function suggestProvince(city: string, postalCode: string, learnedProvinceForCity: (city: string) => string | null): string | null {
  const trimmedCity = city.trim();
  if (trimmedCity) {
    const learned = learnedProvinceForCity(trimmedCity);
    if (learned) return learned;
    const known = provinceForKnownCity(trimmedCity);
    if (known) return known;
  }
  return provinceFromPostalCode(postalCode);
}
