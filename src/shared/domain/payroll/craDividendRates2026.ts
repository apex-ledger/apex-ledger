/**
 * Federal dividend gross-up and dividend tax credit rates — used to compute T5 slip boxes
 * 10-12 (dividends other than eligible dividends) and 24-26 (eligible dividends). Unlike the
 * CPP/EI/tax-bracket constants elsewhere in this app, these are NOT sourced from a verbatim CRA
 * T4127/T5 guide PDF — canada.ca is unreachable from this environment (WebFetch returns 403,
 * direct network access fails). They're corroborated across two independent fetches of
 * taxtips.ca (a specialized, long-standing Canadian tax reference) plus a search whose top
 * result was CRA's own "Completing the T5 slip" page (also unreachable directly, but its box
 * numbers and rates match). These rates are also long-stable federal integration-mechanism
 * constants, not indexed annually like CPP/EI/brackets — eligible dividend rates unchanged since
 * 2018, non-eligible since 2019 — so the risk of a same-year change is much lower than for the
 * annually-indexed figures elsewhere in this file's siblings. Still, re-verify against CRA's
 * T4015 (T5 Guide) or Income Tax Act ss. 82(1)/121 before relying on this for a real filing if
 * you have any doubt.
 */
export const ELIGIBLE_DIVIDEND_GROSSUP_RATE = 0.38; // Box 25 = Box 24 x 1.38
export const ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE = 0.150198; // Box 26 = Box 25 x this rate

export const NON_ELIGIBLE_DIVIDEND_GROSSUP_RATE = 0.15; // Box 11 = Box 10 x 1.15
export const NON_ELIGIBLE_DIVIDEND_FEDERAL_DTC_RATE = 0.090301; // Box 12 = Box 11 x this rate
