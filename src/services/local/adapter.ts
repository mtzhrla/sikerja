import type { DataService } from '@/services/types';
import { localAttachments } from './attachments.service';
import { localAudit } from './audit.service';
import { localAccounts, localAuth } from './auth.service';
import { localBoard, localTasks } from './board.services';
import { localBus } from './bus';
import { localEmployees, localSettings, localTaxonomy, localTemplates } from './core.services';
import { localDistribution } from './distribution.service';
import { localActivities, localIntegrations } from './integrations.service';
import { localNotifications } from './notifications.service';

/**
 * Adapter LOKAL — development/demo tanpa backend.
 * Data tersimpan di perangkat (localStorage + IndexedDB untuk berkas).
 * Realtime antar-tab lewat BroadcastChannel.
 */
export const localAdapter: DataService = {
  mode: 'local',
  auth: localAuth,
  accounts: localAccounts,
  notifications: localNotifications,
  employees: localEmployees,
  board: localBoard,
  tasks: localTasks,
  attachments: localAttachments,
  taxonomy: localTaxonomy,
  templates: localTemplates,
  distribution: localDistribution,
  integrations: localIntegrations,
  activities: localActivities,
  audit: localAudit,
  settings: localSettings,
  realtime: {
    subscribe: (listener) => localBus.subscribe(listener),
  },
};
