import { NARRATOR_VOICES, type NarratorVoice } from './types'

export function getNarratorVoice(voiceId: string): NarratorVoice {
  return NARRATOR_VOICES.find((v) => v.id === voiceId) ?? NARRATOR_VOICES[0]
}
