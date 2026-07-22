import type { NarrationProvider, SpeakOptions } from '../types'

export class WebSpeechProvider implements NarrationProvider {
  readonly id = 'webspeech'

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  stop(): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
  }

  speak(text: string, options: SpeakOptions): Promise<void> {
    if (!this.isAvailable()) return Promise.resolve()

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = options.speed
      utterance.volume = options.volume
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find((voice) => /english/i.test(voice.lang))
      if (preferred) utterance.voice = preferred
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    })
  }
}
