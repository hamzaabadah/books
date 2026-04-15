import { Fyo } from 'fyo';
import { DocValueMap } from 'fyo/core/types';
import { Doc } from 'fyo/model/doc';
import { DateTime } from 'luxon';
import { createNumberSeries } from 'fyo/model/naming';
import {
  DEFAULT_CURRENCY,
  DEFAULT_LOCALE,
  DEFAULT_SERIES_START,
} from 'fyo/utils/consts';
import {
  AccountRootTypeEnum,
  AccountTypeEnum,
} from 'models/baseModels/Account/types';
import { AccountingSettings } from 'models/baseModels/AccountingSettings/AccountingSettings';
import { numberSeriesDefaultsMap } from 'models/baseModels/Defaults/Defaults';
import { InventorySettings } from 'models/inventory/InventorySettings';
import { ValuationMethod } from 'models/inventory/types';
import { ModelNameEnum } from 'models/types';
import { createRegionalRecords } from 'src/regional';
import {
  initializeInstance,
  setCurrencySymbols,
} from 'src/utils/initialization';
import { getRandomString } from 'utils';
import { getDefaultLocations, getDefaultUOMs } from 'utils/defaults';
import { getCountryCodeFromCountry, getCountryInfo } from 'utils/misc';
import { CountryInfo } from 'utils/types';
import { CreateCOA } from './createCOA';
import { SetupWizardOptions } from './types';

export default async function setupInstance(
  dbPath: string,
  setupWizardOptions: SetupWizardOptions,
  fyo: Fyo
) {
  const { companyName, country, bankName, chartOfAccounts } =
    setupWizardOptions;

  fyo.store.skipTelemetryLogging = true;
  await initializeDatabase(dbPath, country, fyo);
  await updateSystemSettings(setupWizardOptions, fyo);
  await updateAccountingSettings(setupWizardOptions, fyo);
  await updatePrintSettings(setupWizardOptions, fyo);

  await createCurrencyRecords(fyo);
  await createAccountRecords(bankName, country, chartOfAccounts, fyo);
  await createRegionalRecords(country, fyo);
  await createDefaultEntries(fyo);
  await createDefaultNumberSeries(fyo);
  await updateInventorySettings(fyo);

  if (fyo.isElectron) {
    const { updatePrintTemplates } = await import('src/utils/printTemplates');
    await updatePrintTemplates(fyo);
  }

  await completeSetup(companyName, fyo);
  if (!Object.keys(fyo.currencySymbols).length) {
    await setCurrencySymbols(fyo);
  }

  fyo.store.skipTelemetryLogging = false;
}

async function createDefaultEntries(fyo: Fyo) {
  /**
   * Create default UOM entries
   */
  for (const uom of getDefaultUOMs(fyo)) {
    await checkAndCreateDoc(ModelNameEnum.UOM, uom, fyo);
  }

  for (const loc of getDefaultLocations(fyo)) {
    await checkAndCreateDoc(ModelNameEnum.Location, loc, fyo);
  }
}

async function initializeDatabase(dbPath: string, country: string, fyo: Fyo) {
  const countryCode = getCountryCodeFromCountry(country);
  await initializeInstance(dbPath, true, countryCode, fyo);
}

async function updateAccountingSettings(
  {
    companyName,
    country,
    fullname,
    email,
    bankName,
    fiscalYearStart,
    fiscalYearEnd,
  }: SetupWizardOptions,
  fyo: Fyo
) {
  const accountingSettings = (await fyo.doc.getDoc(
    'AccountingSettings'
  )) as AccountingSettings;
  await accountingSettings.setAndSync({
    companyName,
    country,
    fullname,
    email,
    bankName,
    fiscalYearStart,
    fiscalYearEnd,
  });
  return accountingSettings;
}

async function updatePrintSettings(
  { logo, companyName, email }: SetupWizardOptions,
  fyo: Fyo
) {
  const printSettings = await fyo.doc.getDoc('PrintSettings');
  await printSettings.setAndSync({
    logo,
    companyName,
    email,
    displayLogo: logo ? true : false,
  });
}

async function updateSystemSettings(
  { country, currency: companyCurrency }: SetupWizardOptions,
  fyo: Fyo
) {
  const countryInfo = getCountryInfo();
  const countryOptions = countryInfo[country] as CountryInfo;
  const currency =
    companyCurrency ?? countryOptions.currency ?? DEFAULT_CURRENCY;
  const locale = countryOptions.locale ?? DEFAULT_LOCALE;
  const countryCode = getCountryCodeFromCountry(country);
  const systemSettings = await fyo.doc.getDoc('SystemSettings');
  const instanceId = getRandomString();

  await systemSettings.setAndSync({
    locale,
    currency,
    instanceId,
    countryCode,
  });
}

async function createCurrencyRecords(fyo: Fyo) {
  const promises: Promise<Doc | undefined>[] = [];
  const queue: string[] = [];
  const countrySettings = Object.values(getCountryInfo()) as CountryInfo[];

  for (const country of countrySettings) {
    const {
      currency,
      currency_fraction,
      currency_fraction_units,
      smallest_currency_fraction_value,
      currency_symbol,
    } = country;

    if (!currency || queue.includes(currency)) {
      continue;
    }

    const docObject = {
      name: currency,
      fraction: currency_fraction ?? '',
      fractionUnits: currency_fraction_units ?? 100,
      smallestValue: smallest_currency_fraction_value ?? 0.01,
      symbol: currency_symbol ?? '',
    };

    const doc = checkAndCreateDoc('Currency', docObject, fyo);
    promises.push(doc);
    queue.push(currency);
  }
  return Promise.all(promises);
}

async function createAccountRecords(
  bankName: string,
  country: string,
  chartOfAccounts: string,
  fyo: Fyo
) {
  const createCOA = new CreateCOA(chartOfAccounts, fyo);
  await createCOA.run();
  const parentAccount = await getBankAccountParentName(country, fyo);
  const bankAccountDoc = {
    name: bankName,
    rootType: AccountRootTypeEnum.Asset,
    parentAccount,
    accountType: 'Bank',
    isGroup: false,
  };

  await checkAndCreateDoc('Account', bankAccountDoc, fyo);
  await createDiscountAccount(fyo);
  await setDefaultAccounts(fyo);
}

export async function createDiscountAccount(fyo: Fyo) {
  const incomeAccountName = fyo.t`Indirect Income`;
  const accountExists = await fyo.db.exists(
    ModelNameEnum.Account,
    incomeAccountName
  );

  if (!accountExists) {
    return;
  }

  const discountAccountName = fyo.t`Discounts`;
  const discountAccountDoc = {
    name: discountAccountName,
    rootType: AccountRootTypeEnum.Income,
    parentAccount: incomeAccountName,
    accountType: 'Income Account',
    isGroup: false,
  };

  await checkAndCreateDoc(ModelNameEnum.Account, discountAccountDoc, fyo);
  await fyo.singles.AccountingSettings!.setAndSync(
    'discountAccount',
    discountAccountName
  );
}

async function setDefaultAccounts(fyo: Fyo) {
  await setDefaultAccount('writeOffAccount', fyo.t`Write Off`, fyo);
  const isSet = await setDefaultAccount(
    'roundOffAccount',
    fyo.t`Rounded Off`,
    fyo
  );

  if (!isSet) {
    await setDefaultAccount('roundOffAccount', fyo.t`Round Off`, fyo);
  }
}

async function setDefaultAccount(key: string, accountName: string, fyo: Fyo) {
  const accountExists = await fyo.db.exists(ModelNameEnum.Account, accountName);
  if (!accountExists) {
    return false;
  }

  await fyo.singles.AccountingSettings!.setAndSync(key, accountName);
  return true;
}

async function completeSetup(companyName: string, fyo: Fyo) {
  await fyo.singles.AccountingSettings!.setAndSync('setupComplete', true);
}

async function checkAndCreateDoc(
  schemaName: string,
  docObject: DocValueMap,
  fyo: Fyo
): Promise<Doc | undefined> {
  const canCreate = await checkIfExactRecordAbsent(schemaName, docObject, fyo);
  if (!canCreate) {
    return;
  }

  const doc = fyo.doc.getNewDoc(schemaName, docObject);
  return doc.sync();
}

async function checkIfExactRecordAbsent(
  schemaName: string,
  docMap: DocValueMap,
  fyo: Fyo
) {
  const name = docMap.name as string;
  const newDocObject = Object.assign({}, docMap);

  const rows = await fyo.db.getAllRaw(schemaName, {
    fields: ['*'],
    filters: { name },
  });

  if (rows.length === 0) {
    return true;
  }

  const storedDocObject = rows[0];
  const matchList = Object.keys(newDocObject).map((key) => {
    const newValue = newDocObject[key];
    const storedValue = storedDocObject[key];
    return newValue == storedValue; // Should not be type sensitive.
  });

  if (!matchList.every(Boolean)) {
    await fyo.db.delete(schemaName, name);
    return true;
  }

  return false;
}

async function getBankAccountParentName(country: string, fyo: Fyo) {
  const parentBankAccount = await fyo.db.getAllRaw('Account', {
    fields: ['*'],
    filters: { isGroup: true, accountType: 'Bank' },
  });

  if (parentBankAccount.length === 0) {
    // This should not happen if the fixtures are correct.
    return 'Bank Accounts';
  } else if (parentBankAccount.length > 1) {
    switch (country) {
      case 'Indonesia':
        return 'Bank Rupiah - 1121.000';
      default:
        break;
    }
  }

  return parentBankAccount[0].name;
}

async function createDefaultNumberSeries(fyo: Fyo) {
  const numberSeriesFields = Object.values(fyo.schemaMap)
    .map((f) => f?.fields)
    .flat()
    .filter((f) => f?.fieldname === 'numberSeries');

  for (const field of numberSeriesFields) {
    const defaultValue = field?.default as string | undefined;
    const schemaName = field?.schemaName;
    if (!defaultValue || !schemaName) {
      continue;
    }

    await createNumberSeries(
      defaultValue,
      schemaName,
      DEFAULT_SERIES_START,
      fyo
    );

    const defaultKey = numberSeriesDefaultsMap[schemaName];
    if (!defaultKey || fyo.singles.Defaults?.[defaultKey]) {
      continue;
    }

    await fyo.singles.Defaults?.setAndSync(defaultKey as string, defaultValue);
  }
}

async function updateInventorySettings(fyo: Fyo) {
  const inventorySettings = (await fyo.doc.getDoc(
    ModelNameEnum.InventorySettings
  )) as InventorySettings;

  if (!inventorySettings.valuationMethod) {
    await inventorySettings.set('valuationMethod', ValuationMethod.FIFO);
  }
  const accountTypeDefaultMap = {
    [AccountTypeEnum.Stock]: 'stockInHand',
    [AccountTypeEnum['Stock Received But Not Billed']]:
      'stockReceivedButNotBilled',
    [AccountTypeEnum['Cost of Goods Sold']]: 'costOfGoodsSold',
  } as Record<string, string>;

  for (const accountType in accountTypeDefaultMap) {
    const accounts = (await fyo.db.getAllRaw('Account', {
      filters: { accountType, isGroup: false },
    })) as { name: string }[];

    if (!accounts.length) {
      continue;
    }

    const settingName = accountTypeDefaultMap[accountType]!;
    await inventorySettings.set(settingName, accounts[0].name);
  }

  const location = fyo.t`Stores`;
  if (await fyo.db.exists(ModelNameEnum.Location, location)) {
    await inventorySettings.set('defaultLocation', location);
  }

  await inventorySettings.sync();
}

function normalizeErpnextRootType(raw: string | undefined | null): string {
  if (raw == null || raw === '') {
    return AccountRootTypeEnum.Asset;
  }
  const t = String(raw).trim();
  if ((Object.values(AccountRootTypeEnum) as string[]).includes(t)) {
    return t;
  }
  const titled =
    t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  if ((Object.values(AccountRootTypeEnum) as string[]).includes(titled)) {
    return titled;
  }
  return AccountRootTypeEnum.Asset;
}

function normalizeErpnextAccountType(raw: string | undefined | null): string {
  if (raw == null || raw === '') {
    return '';
  }
  const t = String(raw).trim();
  if ((Object.values(AccountTypeEnum) as string[]).includes(t)) {
    return t;
  }
  return '';
}

function findFirstBankAccountName(
  accounts: Array<{ name: string; account_type?: string | null }>
): string | null {
  for (const row of accounts) {
    if (String(row.account_type ?? '').trim() === AccountTypeEnum.Bank) {
      return row.name;
    }
  }
  return null;
}

function erpDateToIsoForBooks(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate();
  }
  const s = String(value).trim();
  if (!s) {
    return null;
  }
  const d = DateTime.fromISO(s.slice(0, 10));
  return d.isValid ? d.toISODate() : null;
}

/** Apply Company write-off / round-off / discount from ERPNext after COA exists. */
async function applyErpnextCompanyDefaultAccounts(
  fyo: Fyo,
  defaults?: Record<string, unknown>
) {
  if (!defaults) {
    return;
  }
  const acc = (await fyo.doc.getDoc(
    ModelNameEnum.AccountingSettings
  )) as AccountingSettings;

  const apply = async (
    booksField:
      | 'writeOffAccount'
      | 'roundOffAccount'
      | 'discountAccount'
      | 'defaultIncomeAccount'
      | 'defaultExpenseAccount',
    erpKey: string
  ) => {
    const v = defaults[erpKey];
    if (typeof v !== 'string' || !v) {
      return;
    }
    if (!(await fyo.db.exists(ModelNameEnum.Account, v))) {
      return;
    }
    await acc.setAndSync(booksField, v);
  };

  await apply('writeOffAccount', 'write_off_account');
  await apply('roundOffAccount', 'round_off_account');
  await apply('discountAccount', 'default_discount_account');
  await apply('defaultIncomeAccount', 'default_income_account');
  await apply('defaultExpenseAccount', 'default_expense_account');
}

async function createBooksTaxesFromItemTaxTemplates(
  fyo: Fyo,
  itemTaxTemplates:
    | Array<{
        name: string;
        title?: string;
        rows: Array<{ tax_type: string; tax_rate?: number }>;
      }>
    | undefined
): Promise<Array<{ erpn_tax_template: string; books_tax_template: string }>> {
  const mappings: Array<{ erpn_tax_template: string; books_tax_template: string }> =
    [];

  if (!itemTaxTemplates?.length) {
    return mappings;
  }

  for (const tmpl of itemTaxTemplates) {
    const erpName = String(tmpl.name ?? '').trim();
    if (!erpName) continue;

    const title = (tmpl.title ?? '').trim();
    const booksTaxName = title || erpName;

    const details = (tmpl.rows ?? [])
      .map((r) => {
        const account = String(r.tax_type ?? '').trim();
        const rate = Number(r.tax_rate ?? 0);
        if (!account || !Number.isFinite(rate)) return null;
        return { account, payment_account: null, rate };
      })
      .filter(Boolean) as Array<{
      account: string;
      payment_account: null;
      rate: number;
    }>;

    if (!details.length) continue;

    await checkAndCreateDoc(
      ModelNameEnum.Tax,
      {
        name: booksTaxName,
        details,
      },
      fyo
    );

    mappings.push({ erpn_tax_template: erpName, books_tax_template: booksTaxName });
  }

  return mappings;
}

async function createAccountsFromERPNextList(
  accounts: Array<{
    name: string;
    parent_account?: string | null;
    is_group?: number | boolean;
    root_type?: string;
    account_type?: string;
  }>,
  fyo: Fyo
) {
  for (const row of accounts) {
    const rootType = normalizeErpnextRootType(row.root_type);
    const isGroup = row.is_group === 1 || row.is_group === true;
    const accountType = normalizeErpnextAccountType(row.account_type);
    await checkAndCreateDoc(
      ModelNameEnum.Account,
      {
        name: row.name,
        parentAccount: row.parent_account ? row.parent_account : null,
        isGroup,
        rootType,
        accountType,
      },
      fyo
    );
  }
}

/**
 * Create a new Books database from an ERPNext company template (parent-first
 * accounts from books_integration.api.get_company_template).
 */
export async function setupInstanceFromERPNextTemplate(
  dbPath: string,
  template: {
    company: {
      name: string;
      abbr?: string;
      company_name?: string;
      country?: string;
      default_currency?: string;
    };
    _connection?: {
      baseURL: string;
      token: string;
      company: string;
    };
    accounts: Array<{
      name: string;
      parent_account?: string | null;
      is_group?: number | boolean;
      root_type?: string;
      account_type?: string;
    }>;
    defaults?: Record<string, unknown>;
    item_tax_templates?: Array<{
      name: string;
      title?: string;
      rows: Array<{ tax_type: string; tax_rate?: number }>;
    }>;
    fiscal_year?: {
      name?: string;
      year_start_date?: unknown;
      year_end_date?: unknown;
    } | null;
  },
  fyo: Fyo
) {
  const company = template.company;
  const country = (company.country ?? '').trim() || 'United States';
  const companyName = (
    (company.company_name ?? company.name ?? '') as string
  ).trim();

  if (!companyName) {
    throw new Error('ERPNext template is missing a company name');
  }

  const countryOptions = getCountryInfo()[country] as CountryInfo | undefined;
  const currency =
    (company.default_currency ?? '').trim() ||
    countryOptions?.currency ||
    DEFAULT_CURRENCY;

  let fiscalYearStart = DateTime.now().startOf('year').toISODate()!;
  let fiscalYearEnd = DateTime.now().endOf('year').toISODate()!;
  const fyRow = template.fiscal_year;
  if (fyRow) {
    const s = erpDateToIsoForBooks(fyRow.year_start_date);
    const e = erpDateToIsoForBooks(fyRow.year_end_date);
    if (s && e) {
      fiscalYearStart = s;
      fiscalYearEnd = e;
    }
  }

  const rawDefaults = template.defaults;
  const erpBankRaw =
    typeof rawDefaults?.default_bank_account === 'string'
      ? rawDefaults.default_bank_account.trim()
      : '';

  const setupWizardOptions: SetupWizardOptions = {
    logo: null,
    companyName,
    country,
    fullname: companyName,
    email: 'alaa@rukn-software.com',
    bankName: `${companyName} Bank`,
    currency,
    fiscalYearStart,
    fiscalYearEnd,
    chartOfAccounts: 'Standard',
  };

  fyo.store.skipTelemetryLogging = true;
  try {
    await initializeDatabase(dbPath, country, fyo);
    await updateSystemSettings(setupWizardOptions, fyo);
    await updatePrintSettings(setupWizardOptions, fyo);
    await createCurrencyRecords(fyo);
    await createAccountsFromERPNextList(template.accounts, fyo);
    const taxMappings = await createBooksTaxesFromItemTaxTemplates(
      fyo,
      template.item_tax_templates
    );

    let bankName = '';
    if (
      erpBankRaw &&
      (await fyo.db.exists(ModelNameEnum.Account, erpBankRaw))
    ) {
      bankName = erpBankRaw;
    } else {
      bankName = findFirstBankAccountName(template.accounts) ?? '';
    }

    if (!bankName) {
      const parent = await getBankAccountParentName(country, fyo);
      bankName = `${companyName} Bank`;
      await checkAndCreateDoc(
        ModelNameEnum.Account,
        {
          name: bankName,
          rootType: AccountRootTypeEnum.Asset,
          parentAccount: parent,
          accountType: AccountTypeEnum.Bank,
          isGroup: false,
        },
        fyo
      );
    }

    setupWizardOptions.bankName = bankName;

    await updateAccountingSettings(setupWizardOptions, fyo);

    // Persist ERPNext connection in the new DB so sync is ready.
    if (template._connection?.baseURL && template._connection?.token) {
      const syncSettings = await fyo.doc.getDoc(ModelNameEnum.ERPNextSyncSettings);
      await syncSettings.setAndSync({
        baseURL: template._connection.baseURL,
        authToken: template._connection.token,
        erpnextCompany: template._connection.company,
      });

      const accountingSettings = (await fyo.doc.getDoc(
        ModelNameEnum.AccountingSettings
      )) as AccountingSettings;
      await accountingSettings.setAndSync('enableERPNextSync', true);

      // Persist Item Tax Template mappings into ERPNext Books Sync Settings.
      if (taxMappings.length) {
        try {
          const { sendAPIRequest } = await import('src/utils/api');
          const url = `${template._connection.baseURL.replace(/\/$/, '')}/api/method/books_integration.api.upsert_item_tax_template_mappings`;
          await sendAPIRequest(url, {
            method: 'POST',
            headers: {
              Authorization: `token ${template._connection.token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ mappings: taxMappings }),
          });
        } catch {
          // non-fatal
        }
      }
    }

    const erpDiscount =
      typeof rawDefaults?.default_discount_account === 'string'
        ? rawDefaults.default_discount_account.trim()
        : '';
    if (
      !erpDiscount ||
      !(await fyo.db.exists(ModelNameEnum.Account, erpDiscount))
    ) {
      await createDiscountAccount(fyo);
    }
    await setDefaultAccounts(fyo);
    await applyErpnextCompanyDefaultAccounts(fyo, rawDefaults);
    await createRegionalRecords(country, fyo);
    await createDefaultEntries(fyo);
    await createDefaultNumberSeries(fyo);
    await updateInventorySettings(fyo);

    if (fyo.isElectron) {
      const { updatePrintTemplates } = await import('src/utils/printTemplates');
      await updatePrintTemplates(fyo);
    }

    await completeSetup(companyName, fyo);
    if (!Object.keys(fyo.currencySymbols).length) {
      await setCurrencySymbols(fyo);
    }
  } finally {
    fyo.store.skipTelemetryLogging = false;
  }
}
