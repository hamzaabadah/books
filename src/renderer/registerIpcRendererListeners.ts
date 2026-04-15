import { handleError } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import {
  syncDocumentsFromERPNext,
  syncDocumentsToERPNext,
} from 'src/utils/erpnextSync';

export default function registerIpcRendererListeners() {
  ipc.registerMainProcessErrorListener(
    (_, error: unknown, more?: Record<string, unknown>) => {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (!more) {
        more = {};
      }

      if (typeof more !== 'object') {
        more = { more };
      }

      more.isMainProcess = true;
      more.notifyUser ??= true;

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleError(true, error, more, !!more.notifyUser);
    }
  );

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  ipc.registerTriggerFrontendActionListener(async () => {
    // Scheduled sync tick from main process (Bree job).
    // Run pull then push based on enabled settings.
    const isEnabled = !!fyo.singles.ERPNextSyncSettings?.isEnabled;
    if (!isEnabled) {
      return;
    }

    const pull = !!fyo.singles.ERPNextSyncSettings?.syncDataFromServer;
    const push = !!fyo.singles.ERPNextSyncSettings?.syncDataToServer;

    try {
      if (pull) {
        await syncDocumentsFromERPNext(fyo, false);
      }
      if (push) {
        await syncDocumentsToERPNext(fyo);
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      handleError(true, error, { operation: 'scheduled_erpnext_sync' }, false);
    }
  });

  ipc.registerConsoleLogListener((_, ...stuff: unknown[]) => {
    if (!fyo.store.isDevelopment) {
      return;
    }

    if (fyo.store.isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(...stuff);
    }
  });

  document.addEventListener('visibilitychange', () => {
    const { visibilityState } = document;
    if (visibilityState === 'visible' && !fyo.telemetry.started) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fyo.telemetry.start();
    }

    if (visibilityState !== 'hidden') {
      return;
    }

    fyo.telemetry.stop();
  });
}
