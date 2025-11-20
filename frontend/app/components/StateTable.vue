<script setup lang="ts">
defineProps<{
  data: Record<string, string>
}>()
</script>

<template>
  <UCard>
    <template #header>
      <h3 class="text-lg font-semibold">Committed State</h3>
    </template>
    
    <div v-if="Object.keys(data).length === 0" class="text-gray-500 text-center py-4">
      No data committed yet.
    </div>
    
    <UTable 
      v-else
      :data="Object.entries(data).map(([key, value]) => ({ key, value }))"
    />
  </UCard>
</template>
