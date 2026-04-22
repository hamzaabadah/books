<template>
  <div
    class="flex-1 flex justify-center items-center bg-gray-25 dark:bg-gray-900"
    :class="{ 'window-drag': platform !== 'Windows' }"
  >
    <div
      class="
        w-full
        shadow-lg
        rounded-lg
        border
        dark:border-gray-800
        bg-white
        dark:bg-gray-875
        p-8
      "
      style="max-width: 440px"
    >
      <!-- Header -->

      <div class="flex flex-col items-center mb-6">
        <Rukn class="ms-2 flex w-10 h-10" />
        <h1
          class="
            text-2xl
            font-semibold
            select-none
            dark:text-gray-25
            text-center
          "
        >
          {{ t`Subscription Required` }}
        </h1>
        <p class="text-gray-600 dark:text-gray-400 text-sm text-center mt-2">
          {{ t`Enter your API token to activate this application` }}
        </p>
      </div>

      <!-- Token Input -->
      <div class="flex flex-col gap-2 mb-6">
        <label
          class="text-sm font-medium text-gray-700 dark:text-gray-300"
          for="subscription-token"
        >
          {{ t`API Token` }}
        </label>
        <input
          id="subscription-token"
          v-model="token"
          type="password"
          :placeholder="t`api_key:api_secret`"
          class="
            bg-gray-100
            dark:bg-gray-800
            focus:bg-gray-200
            dark:focus:bg-gray-890
            rounded-md
            px-3
            py-2.5
            outline-none
            text-base text-gray-900
            dark:text-gray-100
            placeholder-gray-400
            dark:placeholder-gray-600
          "
          :disabled="loading"
          @keydown.enter="verify"
        />
      </div>

      <!-- Error Message -->
      <div
        v-if="errorMessage"
        class="
          bg-red-50
          dark:bg-red-950
          border border-red-200
          dark:border-red-800
          text-red-700
          dark:text-red-300
          rounded-md
          px-3
          py-2
          text-sm
          mb-4
        "
      >
        {{ errorMessage }}
      </div>

      <!-- Verify Button -->
      <Button
        type="primary"
        class="
          w-full
          font-medium
          rounded-md
          px-4
          py-2.5
          text-base
          transition-colors
          disabled:opacity-50 disabled:cursor-not-allowed
        "
        :disabled="loading || !token.trim()"
        @click="verify"
      >
        <span v-if="loading" class="flex items-center justify-center gap-2">
          <svg
            class="animate-spin w-4 h-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            />
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          {{ t`Verifying...` }}
        </span>
        <span v-else>{{ t`Verify & Activate` }}</span>
      </Button>

      <!-- Footer hint -->
      <p class="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
        {{ t`Contact your administrator if you don't have a token` }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import FeatherIcon from 'src/components/FeatherIcon.vue';
import Button from 'src/components/Button.vue';
import Rukn from 'src/components/Icons/18/rukn.vue';

export default defineComponent({
  name: 'SubscriptionGate',
  components: { Button, FeatherIcon, Rukn },
  emits: ['subscription-verified'],
  data() {
    return {
      token: '',
      loading: false,
      errorMessage: '',
    };
  },
  computed: {
    platform(): string {
      const self = this as unknown as {
        fyo?: { store?: { platform?: string } };
      };
      return self.fyo?.store?.platform ?? '';
    },
  },
  methods: {
    async verify() {
      const trimmed = this.token.trim();
      if (!trimmed) return;

      this.loading = true;
      this.errorMessage = '';

      try {
        const result = await ipc.verifySubscription(trimmed);

        if (result.valid) {
          this.$emit('subscription-verified');
        } else {
          this.errorMessage =
            result.message || this.t`Invalid or expired token`;
        }
      } catch (err) {
        this.errorMessage = this.t`Connection failed. Please try again.`;
      } finally {
        this.loading = false;
      }
    },
  },
});
</script>
