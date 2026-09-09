/**
 * SparkSpeechFormatter
 * Formats structured responses into warm, natural, human conversational speech.
 * Converts robotic phrasing and markdown syntax into natural spoken audio text with contractions and pauses.
 */

export class SparkSpeechFormatter {
  /**
   * Formats raw text or response into natural human-like speech.
   */
  public static format(text: string): string {
    if (!text || !text.trim()) return '';

    let speech = text.trim();

    // 1. Strip markdown links, code blocks, headers, bullet points and formatting
    speech = speech
      .replace(/```[\s\S]*?```/g, ' ') // Code blocks
      .replace(/`([^`]+)`/g, '$1') // Inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown links [text](url) -> text
      .replace(/^#{1,6}\s+/gm, '') // Headers
      .replace(/^[\*\-•✓⚠️⚡]\s+/gm, '') // Bullet symbols
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '') // Emojis
      .replace(/[*_~`]/g, '') // Formatting asterisks, underscores, tildes
      .replace(/\s+/g, ' ')
      .trim();

    // 2. Specific robotic system phrase replacements
    const phraseReplacements: [RegExp, string][] = [
      [/^Task successfully created\.?/i, "Done. I've created the task."],
      [/^Task created successfully\.?/i, "Done. I've created the task."],
      [/^Task (?:successfully )?deleted\.?/i, "Done. Task deleted."],
      [/^Task (?:successfully )?updated\.?/i, "Done. I've updated the task."],
      [/^No overdue tasks were found\.?/i, "Nothing's overdue. Nice."],
      [/^No active tasks found\.?/i, "You don't have any active tasks right now."],
      [/^No in-progress tasks found\.?/i, "No in-progress tasks right now."],
      [/^No completed tasks found\.?/i, "You haven't completed any tasks yet."],
      [/^Focus session (?:successfully )?started for (\d+)\s*minutes?\.?/i, "Alright. $1 minutes. Let's get it done."],
      [/^Focus timer (?:successfully )?started for (\d+)\s*minutes?\.?/i, "Alright. $1 minutes. Let's get it done."],
      [/^Focus session paused\.?/i, "Focus paused. Take a quick breath."],
      [/^Focus session resumed\.?/i, "Focus resumed. Back to it."],
      [/^Focus session stopped\.?/i, "Focus session stopped."],
      [/^You currently have (\d+) active tasks?\.?/i, "You've got $1 active tasks right now."],
      [/^You currently have/i, "You've got"],
      [/^You currently/i, "You've"]
    ];

    for (const [pattern, replacement] of phraseReplacements) {
      if (pattern.test(speech)) {
        speech = speech.replace(pattern, replacement);
      }
    }

    // 3. Natural conversational contractions (avoid robotic formal phrasing)
    const contractions: [RegExp, string][] = [
      [/\bYou have (\d+)\b/g, "You've got $1"],
      [/\byou have (\d+)\b/g, "you've got $1"],
      [/\bYou have (one|two|three|four|five|six|seven|eight|nine|ten|a few|some|several)\b/gi, "You've got $1"],
      [/\bYou have\b/g, "You've got"],
      [/\byou have\b/g, "you've got"],
      [/\bYou are\b/g, "You're"],
      [/\byou are\b/g, "you're"],
      [/\bYou will\b/g, "You'll"],
      [/\byou will\b/g, "you'll"],
      [/\bIt is\b/g, "It's"],
      [/\bit is\b/g, "it's"],
      [/\bThat is\b/g, "That's"],
      [/\bthat is\b/g, "that's"],
      [/\bThere is\b/g, "There's"],
      [/\bthere is\b/g, "there's"],
      [/\bI have\b/g, "I've"],
      [/\bI will\b/g, "I'll"],
      [/\bI would\b/g, "I'd"],
      [/\bis not\b/g, "isn't"],
      [/\bare not\b/g, "aren't"],
      [/\bdo not\b/g, "don't"],
      [/\bdoes not\b/g, "doesn't"],
      [/\bdid not\b/g, "didn't"],
      [/\bcannot\b/g, "can't"],
      [/\bcould not\b/g, "couldn't"],
      [/\bwould not\b/g, "wouldn't"],
      [/\bshould not\b/g, "shouldn't"]
    ];

    for (const [pattern, replacement] of contractions) {
      speech = speech.replace(pattern, replacement);
    }

    // 4. Number word conversion for small numbers and focus minutes for warmer prosody
    speech = speech
      .replace(/\b25 minutes\b/gi, 'twenty-five minutes')
      .replace(/\b50 minutes\b/gi, 'fifty minutes')
      .replace(/\b15 minutes\b/gi, 'fifteen minutes')
      .replace(/\b30 minutes\b/gi, 'thirty minutes')
      .replace(/\b45 minutes\b/gi, 'forty-five minutes');

    // 5. Clean up any trailing double spaces or stray punctuation
    speech = speech
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,!?])/g, '$1')
      .trim();

    return speech;
  }
}
