<script setup lang="ts">
const { model, models } = useModels()

const items = computed(() => models.value.map(m => ({
    label: m.name,
    value: m.id,
    icon: m.id.startsWith('@cf') ? 'i-simple-icons-meta' : 'i-simple-icons-google'
})))

const currentIcon = computed(() => model.value.startsWith('@cf') ? 'i-simple-icons-meta' : 'i-simple-icons-google')
</script>

<template>
    <USelectMenu v-model="model" :items="items" :icon="currentIcon" variant="ghost" value-key="value"
        class="hover:bg-default focus:bg-default data-[state=open]:bg-default" :ui="{
            trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
        }" />
</template>
