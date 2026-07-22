export {
  narrationService,
  loadNarrationPreference,
  DEFAULT_NARRATION_SETTINGS,
  NARRATOR_VOICES,
  type NarrationFrequency,
  type NarrationSettings,
  type GameNarrationEvent,
} from './NarrationService'
export { loadNarrationSettings } from './preferences'
export { useGameNarration, narrateError, narrateAiThinking, resetGameNarrationSession } from './useGameNarration'
