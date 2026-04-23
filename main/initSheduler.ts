import Bree from 'bree';
import fs from 'fs-extra';
import path from 'path';
import main from 'main';
import config from 'utils/config';
import { retrieveToken, syncDatabaseToServer, isWithinGracePeriod } from './subscription';
import { emitMainProcessError } from 'backend/helpers';

let bree: Bree;

export async function initScheduler(interval: string) {
  const devJobsRoot = path.join(__dirname, '..', '..', 'jobs');
  const prodJobsRoot = path.join(process.resourcesPath, '..', 'jobs');
  const jobsRoot = main.isDevelopment ? devJobsRoot : prodJobsRoot;

  await fs.ensureDir(jobsRoot);

  if (bree) {
    await bree.stop();
  }

  bree = new Bree({
    root: jobsRoot,
    defaultExtension: 'ts',
    jobs: [
      {
        name: 'triggerErpNextSync',
        interval: interval,
        worker: {
          workerData: {
            useTsNode: true,
          },
        },
      },
      {
        name: 'checkLoyaltyProgramExpiry',
        interval: '24 hours',
        worker: {
          workerData: {
            useTsNode: true,
          },
        },
      },
      {
        name: 'triggerDatabaseSync',
        interval: '60 minutes',
        worker: {
          workerData: {
            useTsNode: true,
          },
        },
      },
    ],
    worker: {
      argv: ['--require', 'ts-node/register'],
    },
  });

  bree.on('worker created', (name: string) => {
    const worker = bree.workers.get(name);
    if (!worker) return;

    worker.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message) {
        const msg = message as { type: string };
        if (msg.type === 'trigger-erpnext-sync') {
          main.mainWindow?.webContents.send('trigger-erpnext-sync');
        } else if (msg.type === 'trigger-database-sync') {
          if (!isWithinGracePeriod()) {
            console.log('[Sync] Skipping scheduled database sync (not within grace period or no valid token)');
            return;
          }
          const token = retrieveToken();
          const dbPath = config.get('lastSelectedFilePath');
          if (token && typeof dbPath === 'string') {
            syncDatabaseToServer(dbPath, token).catch((err: unknown) => {
              emitMainProcessError(err);
            });
          }
        }
      }
    });

    worker.on('error', (err: unknown) => {
      emitMainProcessError(err);
    });
  });

  await bree.start();
}
