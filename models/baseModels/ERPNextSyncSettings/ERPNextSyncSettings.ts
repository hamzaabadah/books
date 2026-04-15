import { Doc } from 'fyo/model/doc';
import { ChangeArg, HiddenMap } from 'fyo/model/types';
import { initERPNSync, syncDocumentsToERPNext } from 'src/utils/erpnextSync';
import { ErrorLogEnum } from 'fyo/telemetry/types';

function safeStringify(value: unknown, maxLen = 20000): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + `\n... (truncated, total ${s.length} chars)`;
  } catch (e) {
    return `<<failed to stringify: ${e instanceof Error ? e.message : String(e)}>>`;
  }
}

export class ERPNextSyncSettings extends Doc {
  deviceID?: string;
  instanceName?: string;
  baseURL?: string;
  authToken?: string;
  erpnextCompany?: string;
  integrationAppVersion?: string;
  isEnabled?: boolean;
  initialSyncData?: boolean;

  dataSyncInterval?: string;
  syncDataFromServer?: boolean;
  syncDataToServer?: boolean;

  registerInstance?: string;
  syncSettings?: string;
  syncDataToERPNext?: string;
  fetchFromERPNextQueue?: string;
  clearSyncedDocsFromErpNextSyncQueue?: string;

  hidden: HiddenMap = {
    syncPriceList: () => {
      return !this.fyo.singles.AccountingSettings?.enablePriceList;
    },
    priceListSyncType: () => {
      return !this.fyo.singles.AccountingSettings?.enablePriceList;
    },
    syncSerialNumber: () => {
      return !this.fyo.singles.InventorySettings?.enableSerialNumber;
    },
    serialNumberSyncType: () => {
      return !this.fyo.singles.InventorySettings?.enableSerialNumber;
    },
    syncBatch: () => {
      return !this.fyo.singles.InventorySettings?.enableBatches;
    },
    batchSyncType: () => {
      return !this.fyo.singles.InventorySettings?.enableBatches;
    },
    syncDataFromServer: () => {
      return !this.deviceID;
    },
    syncDataToServer: () => {
      return !this.deviceID;
    },
  };

  async change(ch: ChangeArg) {
    if (ch.changed === 'syncDataFromServer') {
      try {
        const { showToast } = await import('src/utils/interactive');
        showToast({
          type: 'warning',
          message: 'Fetching data from server.',
          duration: 'very_long',
        });
        await initERPNSync(this.fyo);
        ipc.reloadWindow();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        try {
          await this.fyo.doc
            .getNewDoc(ErrorLogEnum.IntegrationErrorLog, {
              error: errorMessage,
              data: safeStringify({
                instance: this.deviceID,
                operation: 'sync_data_from_server',
                trigger: 'change_event',
                stack: error instanceof Error ? error.stack : undefined,
                rawError: error,
              }),
            })
            .sync();
        } catch (logError) {
          throw logError;
        }
      }
    } else if (ch.changed === 'syncDataToServer') {
      try {
        await syncDocumentsToERPNext(this.fyo);
        ipc.reloadWindow();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        try {
          await this.fyo.doc
            .getNewDoc(ErrorLogEnum.IntegrationErrorLog, {
              error: errorMessage,
              data: safeStringify({
                instance: this.deviceID,
                operation: 'sync_data_to_server',
                trigger: 'change_event',
                stack: error instanceof Error ? error.stack : undefined,
                rawError: error,
              }),
            })
            .sync();
        } catch (logError) {
          throw logError;
        }
      }
    }
  }
}
