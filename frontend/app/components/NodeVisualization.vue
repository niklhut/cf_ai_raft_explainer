<script setup lang="ts">
import type { NodeState } from '@raft-simulator/shared'

defineProps<{
  nodes: NodeState[]
}>()

const getNodeColor = (role: string) => {
  if (role === "dead") return 'bg-gray-800 border-gray-600 text-gray-500'
  switch (role) {
    case 'leader': return 'bg-yellow-500/20 border-yellow-500 text-yellow-500'
    case 'candidate': return 'bg-blue-500/20 border-blue-500 text-blue-500'
    case 'follower': return 'bg-green-500/20 border-green-500 text-green-500'
    default: return 'bg-gray-800 border-gray-600'
  }
}
</script>

<template>
  <div class="grid grid-cols-5 gap-4">
    <div 
      v-for="node in nodes" 
      :key="node.id"
      class="flex flex-col items-center justify-center p-4 border-2 rounded-lg transition-all duration-300"
      :class="getNodeColor(node.role)"
    >
      <div class="text-2xl font-bold mb-2">Node {{ node.id }}</div>
      <div class="text-sm uppercase font-semibold">{{ node.role === 'dead' ? 'DEAD' : node.role }}</div>
      <div class="text-xs mt-1">Term: {{ node.term }}</div>
      <UIcon v-if="node.role === 'dead'" name="i-heroicons-x-circle" class="w-8 h-8 mt-2 text-red-500" />
      <UIcon v-else-if="node.role === 'leader'" name="i-heroicons-star" class="w-8 h-8 mt-2 text-yellow-500" />
    </div>
  </div>
</template>
