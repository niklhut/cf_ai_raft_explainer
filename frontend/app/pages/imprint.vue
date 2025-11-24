<script lang="ts" setup>
import policyText from '~/assets/imprint.md?raw'
</script>

<template>
    <UContainer class="py-12">
        <div class="mb-8 flex gap-4">
            <UButton to="/" variant="ghost" icon="i-heroicons-arrow-left">Back to App</UButton>
            <UButton to="/privacy" variant="ghost">Privacy</UButton>
        </div>
        <MDC :value="policyText" />
    </UContainer>
</template>
