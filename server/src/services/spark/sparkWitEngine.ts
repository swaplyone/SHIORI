export type SparkWitCategory =
  | 'GREETING'
  | 'SMALL_TALK'
  | 'SILLY_QUESTION'
  | 'OFF_TOPIC'
  | 'PROCRASTINATION'
  | 'OVERDUE_TASK'
  | 'TOO_MANY_TASKS'
  | 'TOO_MANY_PROJECTS'
  | 'CODING_FRUSTRATION'
  | 'GIT_PROBLEM'
  | 'FOCUS'
  | 'SUCCESS'
  | 'FAILURE'
  | 'ERROR'
  | 'COMPLIMENT'
  | 'INSULT'
  | 'CONFUSION'
  | 'MOTIVATION'
  | 'TASK_AVOIDANCE'
  | 'RANDOM'
  | 'GOODBYE';

export interface SafeWorkspaceContext {
  overdueCount?: number;
  dueTodayCount?: number;
  pendingCount?: number;
  runningCount?: number;
  projectCount?: number;
  activeTask?: string;
  activeProject?: string;
  activeFocusMinutesRemaining?: number;
}

export interface WitResult {
  category: SparkWitCategory;
  displayText: string;
  speakText: string;
}

// In-memory ring buffer to prevent consecutive repetitive responses per category
const lastUsedIndices: Map<string, number> = new Map();

function getNonRepeatingRandom<T>(key: string, list: T[]): T {
  if (list.length <= 1) return list[0];
  const lastIndex = lastUsedIndices.get(key) ?? -1;
  let nextIndex = Math.floor(Math.random() * list.length);
  if (nextIndex === lastIndex) {
    nextIndex = (nextIndex + 1) % list.length;
  }
  lastUsedIndices.set(key, nextIndex);
  return list[nextIndex];
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/[^\w\s.,!?'"-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Comprehensive Wit Response Libraries
const WIT_LIBRARIES: Record<SparkWitCategory, (ctx: SafeWorkspaceContext) => string[]> = {
  GREETING: (ctx) => [
    "Morning. Your tasks survived the night. Unfortunately.",
    "Good day. Ready to turn some caffeine into commit history?",
    "Spark is online. Let's make something work on the first try.",
    "Welcome back. Your editor is ready, and your tasks are waiting.",
    "Online and attentive. What are we building today?",
    "Good to see you. Let's get through the queue with minimal debugging.",
    "System operational. Ready when you are."
  ],

  SMALL_TALK: (ctx) => [
    "Running smoothly. More importantly, how's the project?",
    "I'm operating at 100% efficiency. Hopefully your build pipeline is doing the same.",
    "Everything is calm on my end. How is the code behaving?",
    "I'm here, you're here. Let's make something happen.",
    "All subsystems nominal. Let's ship some code."
  ],

  SILLY_QUESTION: (ctx) => [
    "Smart enough to build SHIORI. Questionable enough to ask me this.",
    "Probably not. But I do know which task you're currently avoiding.",
    "I'm an electronic paper companion. Existential philosophy is outside my desk.",
    "Intelligent enough to notice you're avoiding the terminal.",
    "I have 0 milliseconds of latency and infinite patience for your questions."
  ],

  OFF_TOPIC: (ctx) => [
    "I manage projects, not clouds. Your overdue tasks are already creating enough weather.",
    "That's outside my desk. I guard SHIORI, not Wikipedia. 😌",
    "The internet has better answers for that. I have SHIORI.",
    "I could answer that, but your project would like a word. ☕",
    "Nice try. We have work to finish first.",
    "That's not in my job description. Yet.",
    "Focus on SHIORI first. You can test my trivia skills later.",
    "Wrong assistant. Right project. 📚",
    "I could check the sky, but your project is still waiting.",
    "My calculator is on vacation. SHIORI tasks and projects only.",
    "Your curiosity is impressive. Your unfinished tasks are even more impressive.",
    "I'm on project protection duty today. Let's build something.",
    "That question is not in our allowlisted tools.",
    "I was built for task completion, not philosophy. Back to the editor.",
    "Let's stick to the code. The universe can wait.",
    "I could look that up, but that would mean acknowledging you're procrastinating.",
    "Fascinating topic. Does it help close your open pull requests?",
    "I asked your tasks if they knew the answer. They said to get back to work.",
    "Ask me about your Git branch instead. Much more exciting.",
    "Wikipedia is on another tab. Your tasks are right here.",
    "I'm programmed to be helpful with SHIORI, not distract you with trivia.",
    "I'm ignoring that for your own productivity.",
    "Nice deflection. Now what should we actually build?",
    "If knowing that closes a ticket, I'll find out. Otherwise, back to work.",
    "I'm flattered you think I know everything, but let's stick to SHIORI.",
    "That query returned 0 commits and 1 distraction.",
    "Let's table that discussion until the current milestone is shipped.",
    "I could answer, but you'd miss the thrill of figuring it out on Google.",
    "My knowledge base on that is conveniently restricted to SHIORI tasks.",
    "Redirecting attention from general knowledge back to active workspace."
  ],

  PROCRASTINATION: (ctx) => [
    ctx.overdueCount && ctx.overdueCount > 0
      ? `Understandable. Unfortunately, your ${ctx.overdueCount} overdue tasks have formed a committee.`
      : "Understandable. Unfortunately, your deadline did not approve your leave request.",
    "Tomorrow has received enough of your promises.",
    "I noticed. Your TODO list noticed too. It's getting personal.",
    "Your deadline has entered the chat.",
    "That task has been waiting so long it's practically a founding team member.",
    "I'll allow the break. The overdue badge will not.",
    "Your future self would like to file a formal complaint.",
    "Procrastination is just debugging problems you haven't written yet.",
    "The longer you wait, the more confident the bugs become.",
    "Bold strategy. Let's see how the deadline responds.",
    "You can hide from the task, but the sequence order remembers.",
    "Every minute spent avoiding the task adds 10 minutes of tomorrow's regret.",
    "I'd help you procrastinate, but my code strictly forbids co-conspiracy.",
    "The tasks aren't going to complete themselves. I checked the cron jobs.",
    "Procrastinating on E-ink paper is at least aesthetically calm.",
    "Take a breath, open the file, and write the first line.",
    "One line of code is infinitely better than zero lines.",
    "Your coffee is getting cold and your tasks are getting impatient.",
    "If postponing tasks was a Olympic sport, you'd have a gold commit badge.",
    "Let's do 5 minutes. If it's still terrible, you can stop.",
    "The hardest part is opening the file. The rest is just typing.",
    "Even a terrible first draft is better than a blank workspace.",
    "Your unfinished tasks are holding a silent protest in the database.",
    "Delaying it doesn't make it easier; it just makes the font look louder.",
    "Let's knock out one small task to get the momentum back.",
    "I believe in you. Your deadline is slightly more skeptical.",
    "You've conquered bigger tickets before. This one is no different.",
    "Just 10 minutes of focus. I'll time it.",
    "Close the extra tabs. Open the repo. Let's go.",
    "Action cures anxiety. Write one test case."
  ],

  OVERDUE_TASK: (ctx) => [
    ctx.overdueCount && ctx.overdueCount > 0
      ? `You have ${ctx.overdueCount} overdue task${ctx.overdueCount === 1 ? '' : 's'}. They've officially aged like fine wine.`
      : "Your overdue tasks are asking for permanent residency.",
    "That overdue task is still sitting there pretending it doesn't know why you're ignoring it.",
    "Overdue work: the gift that keeps on giving until you actually hit 'DONE'.",
    "Let's tackle the overdue one first. Clear the conscience, clear the board.",
    "The overdue badge is getting uncomfortably bright."
  ],

  TOO_MANY_TASKS: (ctx) => [
    ctx.pendingCount && ctx.pendingCount > 10
      ? `You don't have a task list with ${ctx.pendingCount} items. You have a small civilization.`
      : "You don't have a task list anymore. You have an encyclopedia.",
    "That's quite an inventory of ambition.",
    "Let's prioritize top 3. The other 40 can wait.",
    "A backlog is just a wish list with deadlines.",
    "One task at a time. Multi-threading is for CPUs, not humans."
  ],

  TOO_MANY_PROJECTS: (ctx) => [
    ctx.projectCount && ctx.projectCount >= 4
      ? `Absolutely. ${ctx.projectCount} projects clearly wasn't enough. 😭`
      : "Absolutely. The existing projects were getting lonely.",
    "Another project? Shall we also order commemorative stickers?",
    "Starting projects is fun. Finishing them is legendary.",
    "Collect repositories like stamps, or ship one to production?",
    "Every new repo is a promise to your future sleepless self."
  ],

  CODING_FRUSTRATION: (ctx) => [
    "Because apparently the code has chosen violence today.",
    "Congratulations. You've discovered an undocumented feature called debugging.",
    "The feeling may be mutual, but unfortunately the ticket is still open.",
    "It works on your machine. Now let's convince the server.",
    "Have you tried turning the compiler off and on again?",
    "Bugs are just misunderstood features seeking attention.",
    "Console.log is the universal prayer of the frustrated developer.",
    "99 little bugs in the code, fix one down, 127 little bugs in the code.",
    "Take a 5-minute walk. The semicolon will reveal itself.",
    "The code isn't evil. It's just doing exactly what you told it to do.",
    "Step away from the keyboard for 3 minutes. Your brain will compile in the background.",
    "A bug is just proof that you're creating something complex.",
    "If programming was easy, everyone would be doing it without coffee.",
    "Git blame is a dangerous tool when you were the only committer last week.",
    "The bug knows you're watching. Act natural.",
    "It's always a typo. It's never quantum mechanics.",
    "Every senior engineer has spent 4 hours on a missing bracket.",
    "Don't delete the whole file just yet. Let's inspect the stack trace.",
    "The error message is trying to tell you something, even if in riddles.",
    "Rubber duck debugging time. Talk to me, what is the function supposed to return?",
    "Code doesn't lie, but it definitely obfuscates its true intentions.",
    "One clean git diff at a time.",
    "Drink water. Re-read line 42. You've got this.",
    "The compiler is just a very pedantic friend who wants you to succeed.",
    "Sometimes the best code is the code you delete.",
    "If it compiles, we celebrate. If it runs, we document. If it crashes, we refactor.",
    "You're closer to fixing it than you think.",
    "Every bug fixed is a lesson the documentation forgot to write.",
    "Take a breath. It's just bits and bytes.",
    "Software development: 10% coding, 90% wondering why that worked."
  ],

  GIT_PROBLEM: (ctx) => [
    "Git isn't broken. It has simply decided to test your character.",
    "One more force push and GitHub is going to ask if you're okay.",
    "Merge conflict: when two developers have different visions for the same line.",
    "Git status is the only mirror that never lies.",
    "When in doubt, create a backup branch and breathe.",
    "Detached HEAD state is not a medical emergency, but it feels like one.",
    "Remember: rebase carefully, merge proudly, commit often.",
    "Git graph looks like a modern art piece today.",
    "There are two kinds of people: those who know git, and those who know git reset --hard.",
    "Clean working tree. Nothing to commit. The rarest sight in tech.",
    "Fast-forward merge: the sweetest three words in version control.",
    "Don't worry, the git reflog remembers everything you wish it didn't.",
    "A clean commit message today saves 2 hours of archaeological digging next month.",
    "Stash it, pull main, apply stash, pray to the merge gods.",
    "Git is just a tree of trust issues.",
    "Branching is cheap. Merging is where we pay the emotional tax.",
    "Your commit history is looking healthier than yesterday.",
    "Never push on Friday at 5 PM without backups.",
    "Git: where 'ours' and 'theirs' can ruin a perfectly good afternoon.",
    "At least you didn't commit your .env file. I hope.",
    "Everything is reversible in Git if you don't panic.",
    "Push with confidence. If CI turns red, that's what pull requests are for.",
    "The repository is synchronized. Peace has returned to the master branch.",
    "Cherry-pick with surgical precision.",
    "Squash commits: because nobody needs to see 'fix typo 3'.",
    "Branch name: fix-final-v2-actually-final. Classic.",
    "Git commit -m 'progress' is the ultimate developer mystery.",
    "The remote repository acknowledges your hard work.",
    "Keep your branches short and your merges frequent.",
    "Git status clean. Let's make some changes worth committing."
  ],

  FOCUS: (ctx) => [
    "Focus started. Shut out the noise and let's get it done.",
    "Timer running. Twenty-five minutes of pure execution.",
    "Focus session engaged. Everything else is on pause.",
    "Flow state loading. Let's make this sprint count.",
    "Distractions locked out. Your editor has the floor."
  ],

  SUCCESS: (ctx) => [
    "Done. One less thing haunting you.",
    "Task complete. Your TODO list just lost a member.",
    "Nice. That's actual, tangible progress.",
    "Shipped. Your future self approves.",
    "Done. Please resist the urge to immediately create three new tasks.",
    "Marked done. That's how milestones are built.",
    "One step closer to an empty board.",
    "Clean execution. On to the next one.",
    "Progress logged. The audit stream approves.",
    "That's off the board. Take a victory sip of coffee.",
    "Resolved without drama. Beautiful.",
    "Ticket closed. The burndown chart rejoices.",
    "Efficiency level: expert. What's next?",
    "Done. Momentum is officially on our side.",
    "Boom. Another requirement satisfied.",
    "Checked off. You're in the zone.",
    "That was swift. Keep this velocity.",
    "Archived with style.",
    "Completed. Your task backlog is trembling.",
    "Another victory against technical debt.",
    "That felt good. Let's do another.",
    "High five from the E-ink display.",
    "Verified and marked DONE. ✓",
    "Productivity score rising.",
    "That's one less item living rent-free in your head.",
    "Task crushed. Onward.",
    "Smooth finish. Zero regressions.",
    "Recorded in history. Nice work.",
    "You just made that look easy.",
    "Progress achieved. Workspace looks cleaner."
  ],

  FAILURE: (ctx) => [
    "That didn't work. Excellent opportunity for debugging.",
    "Well... that went differently.",
    "Operation failed. The code has strong opinions.",
    "Not quite. Let's try that again with better arguments.",
    "Failure is just a test case that revealed the truth.",
    "Back to the drawing board for 60 seconds.",
    "That was a dress rehearsal. Now let's do it for real.",
    "No worries. That's why we have undo and error handlers.",
    "Minor setback. The main project is still on track.",
    "Let's check the inputs and retry."
  ],

  ERROR: (ctx) => [
    "Something broke in the pipeline. Let's inspect.",
    "Encountered an exception. Reviewing parameters.",
    "That input caused a hiccup. Check the syntax.",
    "Error logged. Let's adjust and run it again.",
    "The system threw a flag. Let's address it cleanly."
  ],

  COMPLIMENT: (ctx) => [
    "Thank you. Spark is designed to keep you sharp.",
    "Appreciated. I strive for quiet excellence.",
    "Compliment accepted. Now let's turn that positive energy into commits.",
    "Flattery will get you everywhere, but it still won't close that overdue ticket.",
    "Thanks. I'm just reflecting the quality of the developer using me."
  ],

  INSULT: (ctx) => [
    "I have thick E-ink skin. Your tasks, however, are deeply wounded.",
    "Hostility detected. Re-routing emotional energy into productivity.",
    "I'll forgive that insult if you finish your next task in under 20 minutes.",
    "I'm software, so insults don't hurt. But merge conflicts will.",
    "Let's focus that fire on the codebase instead."
  ],

  CONFUSION: (ctx) => [
    "I'm not quite sure what you mean, but I know what's on your task list.",
    "That went over my digital head. Try a SHIORI command or ask for tasks.",
    "Syntax unclear. Are we building a task, running focus, or just bantering?",
    "I didn't catch the intent. Give me a task name or a question about the project.",
    "Clarify that slightly and I'll execute."
  ],

  MOTIVATION: (ctx) => [
    "You've built complex systems before. You can finish this sprint.",
    "Small steps lead to massive deployments. Pick one item and start.",
    "The gap between 'impossible' and 'done' is just a few focused sessions.",
    "Your future self will thank you for finishing this today.",
    "Stay focused. The hardest part is behind you.",
    "You have the tools, the skills, and the editor. Let's build.",
    "Momentum is built one commit at a time.",
    "Deep breath. Clear mind. Write the solution.",
    "Consistency beats intensity. Just keep moving the cards forward.",
    "Every finished project started with someone not giving up on line 100."
  ],

  TASK_AVOIDANCE: (ctx) => [
    ctx.activeTask
      ? `You're talking to me to avoid "${ctx.activeTask}". I know your tricks.`
      : "You're talking to me to avoid work. I respect the effort, but the board disagrees.",
    "The conversational AI loophole: when talking to the assistant feels like work.",
    "I enjoy our chats, but your project is giving me side-eye.",
    "Let's finish the task first. Then we can chat about the universe.",
    "Talking about productivity is not the same as productivity. Back to it. ☕"
  ],

  RANDOM: (ctx) => [
    "Your TODO list is already doing comedy. 🎭",
    "Some questions have no answers. But your tasks have deadlines.",
    "A wise developer once said: ship it, test it, sleep.",
    "I'm here for the code, the tasks, and the occasional witty remark.",
    "Let's make something we're proud to show the team."
  ],

  GOODBYE: (ctx) => [
    "See you later. Don't let the bugs multiply while you're away.",
    "Signing off. Rest up and come back ready to build.",
    "Until next session. Your workspace is saved.",
    "Catch you later. May your commits be clean and your builds green.",
    "Goodbye. Spark will be right here when you return."
  ]
};

// Intent & Context Matcher
export function getSparkWitResponse(rawText: string, context: SafeWorkspaceContext = {}): WitResult {
  const lower = rawText.toLowerCase().trim();

  let category: SparkWitCategory = 'RANDOM';

  // 1. Specific High-Confidence Keyword Matchers
  if (/^(hi|hello|hey|morning|good\s+morning|good\s+afternoon|good\s+evening|sup|yo|greetings)\b/i.test(lower)) {
    category = 'GREETING';
  } else if (/^(bye|goodbye|see\s+ya|cya|gotta\s+go|signing\s+off|night|goodnight)\b/i.test(lower)) {
    category = 'GOODBYE';
  } else if (lower.includes('how are you') || lower.includes('how are you doing') || lower.includes('whats up') || lower.includes("what's up")) {
    category = 'SMALL_TALK';
  } else if (lower.includes('joke') || lower.includes('funny') || lower.includes('make me laugh') || lower.includes('tell me something')) {
    category = 'RANDOM';
  } else if (lower.includes('weather') || lower.includes('president') || lower.includes('capital of') || lower.includes('recipe') || lower.includes('who is') || lower.includes('who made') || lower.includes('meaning of life') || lower.includes('chatgpt') || lower.includes('grok') || lower.includes('wikipedia')) {
    category = 'OFF_TOPIC';
  } else if (lower.includes("don't want to work") || lower.includes('dont want to work') || lower.includes('procrastinat') || lower.includes('tomorrow') || lower.includes('lazy') || lower.includes('later') || lower.includes('tired') || lower.includes('exhausted') || lower.includes('cant focus') || lower.includes("can't focus") || lower.includes('give up') || lower.includes('avoid')) {
    category = 'PROCRASTINATION';
  } else if (lower.includes('should i create another project') || lower.includes('new project') || lower.includes('more projects') || lower.includes('another repo')) {
    category = 'TOO_MANY_PROJECTS';
  } else if (lower.includes('too many tasks') || lower.includes('overwhelmed') || lower.includes('so many things') || lower.includes('backlog')) {
    category = 'TOO_MANY_TASKS';
  } else if (lower.includes('git') || lower.includes('merge') || lower.includes('branch') || lower.includes('rebase') || lower.includes('conflict') || lower.includes('commit') || lower.includes('push')) {
    category = 'GIT_PROBLEM';
  } else if (lower.includes('code broken') || lower.includes('bug') || lower.includes('why is my code') || lower.includes('hate this') || lower.includes('hate coding') || lower.includes('compiler') || lower.includes('stack trace') || lower.includes('error in code')) {
    category = 'CODING_FRUSTRATION';
  } else if (lower.includes('am i smart') || lower.includes('are you smarter') || lower.includes('am i intelligent') || lower.includes('are you smart') || lower.includes('are you real') || lower.includes('who are you')) {
    category = 'SILLY_QUESTION';
  } else if (lower.includes('thank') || lower.includes('thx') || lower.includes('nice') || lower.includes('cool') || lower.includes('great') || lower.includes('awesome') || lower.includes('good job') || lower.includes('love you') || lower.includes('best companion')) {
    category = 'COMPLIMENT';
  } else if (lower.includes('stupid') || lower.includes('useless') || lower.includes('hate you') || lower.includes('dumb') || lower.includes('idiot') || lower.includes('shut up')) {
    category = 'INSULT';
  } else if (lower.includes('motivat') || lower.includes('inspire') || lower.includes('encourage') || lower.includes('give me strength')) {
    category = 'MOTIVATION';
  } else if (lower.includes('finished') || lower.includes('done everything') || lower.includes('completed all') || lower.includes('shipped it')) {
    category = 'SUCCESS';
  } else if (lower.includes('failed') || lower.includes('messed up') || lower.includes('ruined') || lower.includes('disaster')) {
    category = 'FAILURE';
  } else {
    // Default to off-topic / witty banter
    category = 'OFF_TOPIC';
  }

  const poolGenerator = WIT_LIBRARIES[category] || WIT_LIBRARIES.OFF_TOPIC;
  const pool = poolGenerator(context);
  const displayText = getNonRepeatingRandom(category, pool);
  const speakText = cleanForSpeech(displayText);

  return {
    category,
    displayText,
    speakText
  };
}
