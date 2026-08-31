// Minimal ambient types for the Web Speech API (SpeechRecognition).
// TypeScript's lib.dom.d.ts doesn't ship these because the API is non-standard,
// but Chromium/Safari/Edge implement it. Only the fields we actually consume
// are declared here — enough to satisfy useVoiceInput.ts under strict tsc.

interface SpeechRecognitionAlternative {
  readonly transcript: string
  readonly confidence: number
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}

interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => unknown) | null
  onerror:  ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => unknown) | null
  onend:    ((this: SpeechRecognition, ev: Event) => unknown) | null
  start(): void
  stop(): void
  abort(): void
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition
  new(): SpeechRecognition
}
