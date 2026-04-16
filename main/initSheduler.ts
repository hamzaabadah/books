import Bree from 'bree';
import fs from 'fs-extra';
import path from 'path';
import main from 'main';

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
    ],
    worker: {
      argv: ['--require', 'ts-node/register'],
    },
  });

  bree.on('worker created', () => {
    main.mainWindow?.webContents.send('trigger-erpnext-sync');
  });

  await bree.start();
}
