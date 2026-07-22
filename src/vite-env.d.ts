/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ELEVENLABS_API_KEY?: string
  readonly ELEVENLABS_MODEL?: string
  readonly VITE_LLM_API_KEY?: string
  readonly VITE_LLM_API_URL?: string
  readonly VITE_LLM_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
