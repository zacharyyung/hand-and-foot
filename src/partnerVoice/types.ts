export interface PartnerVoiceSettings {
  enabled: boolean
  volume: number
  speed: number
  voiceId: string
}

export const DEFAULT_PARTNER_VOICE_SETTINGS: PartnerVoiceSettings = {
  enabled: false,
  volume: 0.85,
  speed: 1,
  voiceId: 'dealer',
}
