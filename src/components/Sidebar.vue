<template>
  <div
    class="
      py-2
      h-full
      flex
      justify-between
      flex-col
      bg-gray-25
      dark:bg-gray-900
      relative
    "
    :class="{
      'window-drag': platform !== 'Windows',
    }"
  >
    <div>
      <!-- Company name -->
      <div
        class="px-4 flex flex-row items-center justify-between mb-4"
        :class="
          platform === 'Mac' && languageDirection === 'ltr' ? 'mt-10' : 'mt-2'
        "
      >
        <h6
          data-testid="company-name"
          class="
            font-semibold
            dark:text-gray-200
            whitespace-nowrap
            overflow-auto
            no-scrollbar
            select-none
          "
        >
          {{ companyName }}
        </h6>
      </div>

      <!-- Sidebar Items -->
      <div v-for="group in groups" :key="group.label">
        <div
          class="
            px-4
            flex
            items-center
            cursor-pointer
            hover:bg-gray-100
            dark:hover:bg-gray-875
            h-10
          "
          :class="
            isGroupActive(group) && !group.items
              ? 'bg-gray-100 dark:bg-gray-875 border-s-4 border-gray-800 dark:border-gray-100'
              : ''
          "
          @click="routeToSidebarItem(group)"
        >
          <Icon
            class="flex-shrink-0"
            :name="group.icon"
            :size="group.iconSize || '18'"
            :height="group.iconHeight ?? 0"
            :active="!!isGroupActive(group)"
            :darkMode="darkMode"
            :class="isGroupActive(group) && !group.items ? '-ms-1' : ''"
          />
          <div
            class="ms-2 text-lg text-gray-700"
            :class="
              isGroupActive(group) && !group.items
                ? 'text-gray-900 dark:text-gray-25'
                : 'dark:text-gray-300'
            "
          >
            {{ group.label }}
          </div>
        </div>

        <!-- Expanded Group -->
        <div v-if="group.items && isGroupActive(group)">
          <div
            v-for="item in group.items"
            :key="item.label"
            class="
              text-base
              h-10
              ps-10
              cursor-pointer
              flex
              items-center
              hover:bg-gray-100
              dark:hover:bg-gray-875
            "
            :class="
              isItemActive(item)
                ? 'bg-gray-100 dark:bg-gray-875 text-gray-900 dark:text-gray-100 border-s-4 border-gray-800 dark:border-gray-100'
                : 'text-gray-700 dark:text-gray-400'
            "
            @click="routeToSidebarItem(item)"
          >
            <p :style="isItemActive(item) ? 'margin-left: -4px' : ''">
              {{ item.label }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Report Issue and DB Switcher -->
    <div class="window-no-drag flex flex-col gap-2 py-2 px-4">
      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="viewShortcuts = true"
      >
        <feather-icon name="command" class="h-4 w-4 flex-shrink-0" />
        <p>{{ t`Shortcuts` }}</p>
      </button>

      <button
        data-testid="change-db"
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="$emit('change-db-file')"
      >
        <feather-icon name="database" class="h-4 w-4 flex-shrink-0" />
        <p>{{ t`Change DB` }}</p>
      </button>

      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="syncDatabaseManual"
      >
        <feather-icon
          name="refresh-cw"
          class="h-4 w-4 flex-shrink-0"
          :class="{ 'animate-spin': isSyncing }"
        />
        <p>
          {{ isSyncing ? t`Syncing...` : t`Sync Database` }}
        </p>
      </button>

      <button
        class="
          flex
          text-sm text-gray-600
          dark:text-gray-500
          hover:text-gray-800
          dark:hover:text-gray-400
          gap-1
          items-center
        "
        @click="openReportIssueModal"
      >
        <feather-icon name="flag" class="h-4 w-4 flex-shrink-0" />
        <p>
          {{ t`Report Issue` }}
        </p>
      </button>

      <p
        v-if="showDevMode"
        class="text-xs text-gray-500 select-none cursor-pointer"
        @click="showDevMode = false"
        title="Open dev tools with Ctrl+Shift+I"
      >
        dev mode
      </p>
    </div>

    <!-- Hide Sidebar Button -->
    <button
      class="
        absolute
        bottom-0
        end-0
        text-gray-600
        dark:text-gray-500
        hover:bg-gray-100
        dark:hover:bg-gray-875
        rounded
        p-1
        m-4
        rtl-rotate-180
      "
      @click="() => toggleSidebar()"
    >
      <feather-icon name="chevrons-left" class="w-4 h-4" />
    </button>

    <Modal :open-modal="viewShortcuts" @closemodal="viewShortcuts = false">
      <ShortcutsHelper class="w-form" />
    </Modal>

    <Modal
      :open-modal="showReportIssue"
      @closemodal="() => (showReportIssue = false)"
    >
      <div class="p-4 text-gray-900 dark:text-gray-100 w-form">
        <h2 class="text-xl font-semibold select-none">
          {{ t`Report Issue` }}
        </h2>

        <p class="text-sm mt-1 text-gray-600 dark:text-gray-400">
          {{ t`Tell us what happened and how to reproduce it.` }}
        </p>

        <div class="mt-6 flex flex-col gap-4 text-base">
          <div class="flex flex-col gap-2">
            <label class="text-gray-600 dark:text-gray-400">{{
            t`Title`
          }}</label>
          <input
            v-model="reportIssueTitle"
            type="text"
            class="
              bg-gray-100
              dark:bg-gray-875
              focus:bg-gray-200
              dark:focus:bg-gray-890
              rounded-md
              px-3
              py-2
              outline-none
            "
            :placeholder="t`Short summary`"
            :disabled="isReportingIssue"
          />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-gray-600 dark:text-gray-400">{{
            t`Description`
          }}</label>
          <textarea
            v-model="reportIssueDescription"
            rows="6"
            class="
              bg-gray-100
              dark:bg-gray-875
              focus:bg-gray-200
              dark:focus:bg-gray-890
              rounded-md
              px-3
              py-2
              outline-none
              resize-y
            "
            :placeholder="t`Explain what happened and steps to reproduce`"
            :disabled="isReportingIssue"
          />
          </div>
        </div>

        <div class="flex justify-between mt-8">
          <Button
            :disabled="isReportingIssue"
            @click="() => (showReportIssue = false)"
          >
            {{ t`Cancel` }}
          </Button>
          <Button
            type="primary"
            :disabled="isReportingIssue"
            @click="submitReportIssue"
          >
            {{ isReportingIssue ? t`Sending...` : t`Send` }}
          </Button>
        </div>
      </div>
    </Modal>
  </div>
</template>
<script lang="ts">
import { getFeatureFlags, reportIssue } from 'src/errorHandling';
import { fyo } from 'src/initFyo';
import { languageDirectionKey, shortcutsKey } from 'src/utils/injectionKeys';
import { getSidebarConfig } from 'src/utils/sidebarConfig';
import { SidebarConfig, SidebarItem, SidebarRoot } from 'src/utils/types';
import { routeTo, toggleSidebar } from 'src/utils/ui';
import { showToast } from 'src/utils/interactive';
import { defineComponent, inject } from 'vue';
import router from '../router';
import Button from './Button.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import ShortcutsHelper from './ShortcutsHelper.vue';

const COMPONENT_NAME = 'Sidebar';

export default defineComponent({
  components: {
    Button,
    Icon,
    Modal,
    ShortcutsHelper,
  },
  props: {
    darkMode: { type: Boolean, default: false },
  },
  emits: ['change-db-file', 'toggle-darkmode'],
  setup() {
    return {
      languageDirection: inject(languageDirectionKey),
      shortcuts: inject(shortcutsKey),
    };
  },
  data(): {
    companyName: string;
    groups: SidebarConfig;
    viewShortcuts: boolean;
    activeGroup: null | SidebarRoot;
    showDevMode: boolean;
    isSyncing: boolean;
    showReportIssue: boolean;
    reportIssueTitle: string;
    reportIssueDescription: string;
    isReportingIssue: boolean;
  } {
    return {
      companyName: '',
      groups: [],
      viewShortcuts: false,
      activeGroup: null,
      showDevMode: fyo.store.isDevelopment,
      isSyncing: false,
      showReportIssue: false,
      reportIssueTitle: '',
      reportIssueDescription: '',
      isReportingIssue: false,
    };
  },
  computed: {
    appVersion() {
      return fyo.store.appVersion;
    },
  },
  async mounted() {
    const { companyName } = await fyo.doc.getDoc('AccountingSettings');
    this.companyName = companyName as string;
    this.groups = await getSidebarConfig();

    this.setActiveGroup();
    router.afterEach(() => {
      this.setActiveGroup();
    });

    this.shortcuts?.shift.set(COMPONENT_NAME, ['KeyH'], () => {
      if (document.body === document.activeElement) {
        this.toggleSidebar();
      }
    });

    this.showDevMode = fyo.store.isDevelopment;
  },
  unmounted() {
    this.shortcuts?.delete(COMPONENT_NAME);
  },
  methods: {
    routeTo,
    reportIssue,
    toggleSidebar,
    openReportIssueModal() {
      this.reportIssueTitle = '';
      this.reportIssueDescription = '';
      this.showReportIssue = true;
    },
    async submitReportIssue() {
      const title = this.reportIssueTitle?.trim();
      const description = this.reportIssueDescription?.trim();

      if (!title || !description) {
        showToast({
          message: this.t`Please fill title and description.`,
          type: 'error',
        });
        return;
      }

      if (this.isReportingIssue) return;
      this.isReportingIssue = true;

      try {
        let logs =
          `Path: ${router.currentRoute.value.fullPath}\n` +
          `Version: ${fyo.store.appVersion}\n` +
          `Platform: ${fyo.store.platform}\n` +
          `Language: ${fyo.config.get('language') ?? '-'}\n` +
          `Country: ${fyo.singles.SystemSettings?.countryCode ?? '-'}\n`;

        const flags = getFeatureFlags();
        if (flags.length) {
          logs += `\n${flags.join('\n')}\n`;
        }
        const res = await ipc.reportIssue({
          title,
          description,
          instance_id: fyo.store.instanceId,
          app_version: fyo.store.appVersion,
          platform: fyo.store.platform,
          logs,
        });

        if (res.success) {
          showToast({
            message: this.t`Issue sent successfully.`,
            type: 'success',
          });
          this.showReportIssue = false;
          return;
        }

        showToast({
          message: res.message || this.t`Failed to send issue.`,
          type: 'error',
        });
      } catch (err) {
        showToast({
          message: this.t`Connection failed.`,
          type: 'error',
        });
      } finally {
        this.isReportingIssue = false;
      }
    },
    setActiveGroup() {
      const { fullPath } = this.$router.currentRoute.value;
      const fallBackGroup = this.activeGroup;
      this.activeGroup =
        this.groups.find((g) => {
          if (fullPath.startsWith(g.route) && g.route !== '/') {
            return true;
          }

          if (g.route === fullPath) {
            return true;
          }

          if (g.items) {
            let activeItem = g.items.filter(
              ({ route }) => route === fullPath || fullPath.startsWith(route)
            );

            if (activeItem.length) {
              return true;
            }
          }
        }) ??
        fallBackGroup ??
        this.groups[0];
    },
    isItemActive(item: SidebarItem) {
      const { path: currentRoute, params } = this.$route;
      const routeMatch = currentRoute === item.route;

      const schemaNameMatch =
        item.schemaName && params.schemaName === item.schemaName;

      const isMatch = routeMatch || schemaNameMatch;
      if (params.name && item.schemaName && !isMatch) {
        return currentRoute.includes(`${item.schemaName}/${params.name}`);
      }

      return isMatch;
    },
    isGroupActive(group: SidebarRoot) {
      return this.activeGroup && group.label === this.activeGroup.label;
    },
    routeToSidebarItem(item: SidebarItem | SidebarRoot) {
      routeTo(this.getPath(item));
    },
    getPath(item: SidebarItem | SidebarRoot) {
      const { route: path, filters } = item;
      if (!filters) {
        return path;
      }

      return { path, query: { filters: JSON.stringify(filters) } };
    },
    async syncDatabaseManual() {
      if (this.isSyncing) return;
      this.isSyncing = true;
      try {
        const res = await ipc.syncDbNow();
        if (res.success) {
          showToast({
            message: this.t`Database synced to the server successfully.`,
            type: 'success',
          });
        } else {
          showToast({
            message: res.message || this.t`Failed to sync database.`,
            type: 'error',
          });
        }
      } catch (err) {
        showToast({
          message: this.t`Connection failed.`,
          type: 'error',
        });
      } finally {
        this.isSyncing = false;
      }
    },
  },
});
</script>
