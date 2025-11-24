export interface Model {
  id: string
  name: string
}

export const useModels = () => {
  const model = useState<string>(
    "chat-model",
    () => "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  )
  const models = useState<Model[]>("chat-models", () => [])

  const fetchModels = async () => {
    try {
      const { get } = useApi()
      const res = (await get("/models")) as { models: Model[] }
      models.value = res.models

      // If current model is not in list (and list is not empty), switch to first available
      if (
        models.value.length > 0 &&
        !models.value.some((m) => m.id === model.value)
      ) {
        model.value = models.value[0]!.id
      }
    } catch (e) {
      console.error("Failed to fetch models", e)
    }
  }

  // Fetch models when composable is used, if not already fetched
  onMounted(() => {
    if (models.value.length === 0) {
      fetchModels()
    }
  })

  return {
    model,
    models,
  }
}
