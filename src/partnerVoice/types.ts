export interface PartnerVoiceSettings {
  enabled: boolean
  volume: number
  speed: number
  voiceId: string
}

export const DEFAULT_PARTNER_VOICE_SETTINGS: PartnerVoiceSettings = {
  enabled: true,
  volume: 0.85,
  speed: 1,
  voiceId: 'dealer',
}

export const PARTNER_ACK_APPROVE = [
  'Go for it.',
  'Yes — make the play.',
  'Sounds good to me.',
]

export const PARTNER_ACK_DENY = [
  'Okay, I\'ll wait.',
  'Got it — holding off.',
  'Alright, not yet then.',
]
