import { Injectable, signal } from '@angular/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

/**
 * Speaks text out loud.
 *
 * Text-to-Speech (TTS) turns written text into audio — the opposite of
 * Speech Recognition, which turns audio into text (that would be voice
 * INPUT, e.g. "Where am I?" spoken by the user; this app only does voice
 * OUTPUT, per spec section 8 — input is a possible future feature, not
 * built here).
 *
 * Like `@capacitor/geolocation`, this plugin ships BOTH a native
 * implementation (iOS `AVSpeechSynthesizer`, Android `TextToSpeech`) and a
 * web implementation (the browser's own `speechSynthesis` API). Capacitor
 * picks whichever one matches the platform automatically — this service
 * just calls `TextToSpeech.speak()` and never has to know which one is
 * running underneath. That's the same "one API, native or web under the
 * hood" pattern as Geolocation, which is also why GPS/voice can behave
 * differently in a browser vs. a real phone: different implementation,
 * same contract.
 *
 * The speech happens entirely on-device — no audio or text is sent to a
 * server for this.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly _isSpeaking = signal(false);
  readonly isSpeaking = this._isSpeaking.asReadonly();

  async speak(text: string, lang = 'en-US'): Promise<void> {
    this._isSpeaking.set(true);
    try {
      await TextToSpeech.speak({
        text,
        lang,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
      });
    } finally {
      this._isSpeaking.set(false);
    }
  }

  async stop(): Promise<void> {
    await TextToSpeech.stop();
    this._isSpeaking.set(false);
  }
}
