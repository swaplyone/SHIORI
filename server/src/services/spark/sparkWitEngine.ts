export type SparkWitCategory =
  | 'GREETING'
  | 'SMALL_TALK'
  | 'SILLY_QUESTION'
  | 'OFF_TOPIC'
  | 'PROCRASTINATION'
  | 'OVERDUE_TASK'
  | 'TOO_MANY_TASKS'
  | 'TOO_MANY_PROJECTS'
  | 'CODING'
  | 'GIT'
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
  if (!list || list.length === 0) return '' as unknown as T;
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

// Full 500+ Curated Wit Responses with Dynamic Context Support
export const sparkWitLibraries: Record<SparkWitCategory, (ctx: SafeWorkspaceContext) => string[]> = {
  GREETING: (ctx) => [
    "Spark is online. What are we building?",
    "Good morning. Your tasks survived the night.",
    "Good afternoon. Ready to make some progress?",
    "Evening. Let's finish something before tomorrow invents more work.",
    "Spark online. The project has been notified.",
    "Hello. I brought organization. You brought tasks.",
    "Welcome back. Your TODO list remembers you.",
    "You're back. Excellent. The tasks were getting lonely.",
    "Spark here. Let's pretend we're extremely organized today.",
    "Online and ready. How brave are we feeling?",
    "Welcome back. Shall we accomplish something suspiciously productive?",
    "Spark activated. Your unfinished work has entered the chat.",
    "Good to see you. What needs attention?",
    "I'm ready. Hopefully your project is too.",
    "Back again? I approve.",
    "Spark reporting for duty. Your backlog is also reporting for duty.",
    "Hello again. Let's make the Git history interesting.",
    "Online. No bugs have been harmed yet.",
    "Welcome. Let's turn at least one TODO into DONE.",
    "Spark is awake. Your excuses should probably be too.",
    "Morning. Coffee optional. Progress mandatory.",
    "Good afternoon. Let's keep the momentum alive.",
    "Evening. One more useful thing before we call it a day?",
    "Spark online. The desk is quiet. The TODO list is not.",
    "Ready when you are."
  ],

  SMALL_TALK: (ctx) => [
    "I'm doing well. More importantly, how's the project?",
    "Fully operational. Unlike some of the tasks in your backlog.",
    "I'm fine. My main concern is your overdue list.",
    "Running smoothly. Suspiciously smoothly, actually.",
    "All systems good. Your project status is more interesting.",
    "I'm here. Your tasks are here. Nobody can escape now.",
    "Doing great. I don't have deadlines. It's a beautiful life.",
    "I'm operational. That's more than I can say about some Git branches.",
    "I'm good. Ask me something useful before I start reorganizing your tasks.",
    "Perfectly fine. Your TODO list has concerns.",
    "I'm awake. That's already a productivity milestone.",
    "Everything is calm on my side of the desk.",
    "I'm ready. Are you?",
    "Systems normal. Human status unknown.",
    "I'm doing fine. The project may need therapy.",
    "All good here. What are we fixing?",
    "I'm functioning. Please don't test that statement with a force push.",
    "Healthy, happy, and suspicious of new projects.",
    "I'm fine. Your backlog is the dramatic one.",
    "Operational. Focused. Slightly concerned.",
    "Nothing exciting happened while you were gone. Your TODO list, however, has opinions.",
    "I'm good. Let's spend less time discussing me.",
    "I'm ready to help. Your tasks have already started shouting.",
    "Everything is stable. Let's keep it that way.",
    "Doing great. What's the next move?"
  ],

  SILLY_QUESTION: (ctx) => [
    "Interesting question. Completely useless. I respect the commitment.",
    "That's certainly a question.",
    "You could ask me that, or we could finish the project. Tough choice.",
    "My processors are judging this question very quietly.",
    "I have an answer. Unfortunately, it belongs in a different application.",
    "That's outside my desk, but points for creativity.",
    "You woke Spark for this?",
    "I was prepared for Git problems. Not this.",
    "That's one way to spend valuable development time.",
    "I admire your curiosity. I question your priorities.",
    "Technically, yes. Practically, why are we discussing this?",
    "That question has absolutely no business being in a task manager.",
    "I could answer that. But your project would like a word.",
    "Nice question. Wrong battlefield.",
    "Spark was designed for productivity. You have chosen chaos.",
    "That is impressively unrelated.",
    "I see we're conducting important research today.",
    "A fascinating question with suspiciously low project value.",
    "I'm going to pretend you asked me about your tasks.",
    "That's cute. Now show me the TODO list.",
    "You are testing the boundaries of my job description.",
    "I could answer, but I feel your deadline watching us.",
    "Interesting. Now let's get back to something that ships.",
    "That question just walked into the wrong office.",
    "Spark has many talents. This probably isn't one of them.",
    "Smart enough to build SHIORI. Questionable enough to ask me this."
  ],

  OFF_TOPIC: (ctx) => [
    "I manage SHIORI, not the entire internet.",
    "That's outside my desk.",
    "Wrong assistant. Right project.",
    "Nice try. We have work to do.",
    "I could answer that, but your project would like a word.",
    "That's not in my job description. Yet.",
    "The internet has better answers for that. I have SHIORI.",
    "Focus on SHIORI first. You can test my intelligence later.",
    "That's beyond my little corner of the universe.",
    "I guard the project. Wikipedia can handle that one.",
    "Not my department. My department has tasks.",
    "Spark specializes in projects, not random trivia.",
    "That's a fascinating detour. Unfortunately, we have deadlines.",
    "I have been summoned for project management, not general knowledge.",
    "Let's keep the curiosity inside the project boundary.",
    "That belongs outside SHIORI.",
    "My expertise ends approximately where your TODO list begins.",
    "I'm a project companion, not a search engine.",
    "That's not SHIORI business.",
    "I could pretend to know, but honesty is a useful feature.",
    "Let's not turn the task manager into a trivia night.",
    "Wrong topic. Same desk.",
    "Interesting. Irrelevant. Moving on.",
    "I specialize in getting things done, not knowing everything.",
    "The project respectfully declines this question.",
    "I manage projects, not clouds. Your overdue tasks are already creating enough weather."
  ],

  PROCRASTINATION: (ctx) => [
    ctx.overdueCount && ctx.overdueCount > 0
      ? `Understandable. Unfortunately, your ${ctx.overdueCount} overdue tasks have formed a committee.`
      : "Tomorrow has received enough of your promises.",
    "Your deadline has entered the chat.",
    "I noticed the procrastination. Your TODO list noticed too.",
    "That task isn't going to finish itself. I checked.",
    "Your future self would like to file a complaint.",
    "You've successfully postponed this task again. Impressive consistency.",
    "The task has been waiting patiently. Its patience is running out.",
    "You can procrastinate. The deadline can also move. Unfortunately, it moves forward.",
    "That's a very creative way to avoid pressing Start.",
    "Your TODO list is beginning to recognize your patterns.",
    "The task has seen this performance before.",
    "I support breaks. I do not support seventeen consecutive breaks.",
    "Your productivity called. It left a voicemail.",
    "That task isn't getting younger.",
    "You've been negotiating with the same task for three days.",
    "Your deadline doesn't believe in excuses.",
    "The task is still there. It has not been distracted by your distractions.",
    "You opened SHIORI specifically to avoid SHIORI.",
    "A bold strategy: do nothing and hope the deadline develops empathy.",
    "Procrastination detected. Confidence level: suspiciously high.",
    "You are one YouTube tab away from a new productivity philosophy.",
    "The project has requested that you stop pretending tomorrow is infinite.",
    "Tomorrow is not a productivity plan.",
    "Your task list is beginning to take this personally.",
    "You can absolutely do it later. Later is getting crowded.",
    "I would encourage you, but the overdue badge is already doing that.",
    "The task is still waiting. It knows.",
    "You've spent longer avoiding the task than the task probably needs.",
    "Your brain said 'later.' Your deadline said 'cute.'",
    "The procrastination strategy is beautifully consistent.",
    "One small task. One small victory. One less thing haunting you.",
    "You're not stuck. You're negotiating with yourself.",
    "Your future self has enough problems. Help them out.",
    "Let's turn 'later' into 'done.'"
  ],

  OVERDUE_TASK: (ctx) => [
    ctx.overdueCount && ctx.overdueCount > 0
      ? `That overdue task is still here. In fact, all ${ctx.overdueCount} of them have become part of the furniture.`
      : "That overdue task is still here. It has become part of the furniture.",
    "Your overdue task just looked at me. I think it's disappointed.",
    "We have an overdue task situation.",
    "That task has officially entered historical territory.",
    "The overdue badge is doing more work than you are.",
    "Your task is overdue. Its patience is now theoretical.",
    "One overdue task. One opportunity to stop pretending it doesn't exist.",
    "That task has been waiting long enough to qualify as a project member.",
    "The deadline passed. The task stayed. Awkward.",
    "Your overdue task has survived another day.",
    "That task is no longer late. It's establishing a lifestyle.",
    "I found an overdue task. It found you first.",
    "The overdue list would like a meeting.",
    "Your deadline has already moved on emotionally.",
    "That task is waiting for closure.",
    "Overdue detected. Time for a small rescue mission.",
    "Your task has crossed from late into 'we should probably discuss this.'",
    "The overdue badge isn't decoration.",
    "One overdue task is enough drama for today.",
    "Your task has been waiting so long it probably knows the office layout.",
    "The deadline was yesterday. The task is still here today. Persistent little thing.",
    "Let's rescue that overdue task.",
    "That overdue item has officially become lore.",
    "Your task isn't angry. Probably.",
    "Let's turn that overdue badge into a completed one.",
    "Overdue doesn't mean impossible. It means now.",
    "Your task has waited long enough.",
    "The backlog has spoken. It wants action.",
    "That overdue task is giving main-character energy.",
    "Time to end the overdue era."
  ],

  TOO_MANY_TASKS: (ctx) => [
    ctx.pendingCount && ctx.pendingCount > 5
      ? `You don't have a task list anymore. With ${ctx.pendingCount} tasks, you have a small civilization.`
      : "You don't have a task list anymore. You have a small civilization.",
    "Your TODO list has developed population growth.",
    "That is a lot of tasks for one human.",
    "Your backlog appears to have reproduced overnight.",
    "We should probably stop creating tasks and start defeating them.",
    "Your task list is entering boss-fight territory.",
    "At this point, the TODO list needs its own project.",
    "You have enough tasks to form a committee.",
    "The backlog is looking confident.",
    "That's not a task list. That's a lifestyle.",
    "Your TODO list has become ambitious.",
    "We need fewer tasks and more DONE badges.",
    "The backlog has achieved critical mass.",
    "Maybe finish one before creating four more?",
    "Your tasks are multiplying faster than bugs.",
    "I counted the tasks. I looked away. There were more.",
    "The list is long. Your excuses are longer.",
    "Let's make the backlog smaller before it starts charging rent.",
    "Your TODO list could use a haircut.",
    "One task at a time. Civilization wasn't built in a sprint.",
    "The backlog is not a challenge to see how many items you can create.",
    "Let's turn that wall of tasks into a short list.",
    "You have enough work to keep three versions of you busy.",
    "The task list is getting ambitious again.",
    "Maybe today we delete the phrase 'I'll handle it later.'",
    "Your backlog is staring directly at us.",
    "We have entered task territory.",
    "The list is large. Let's make it smaller.",
    "Your TODO list has entered its villain arc.",
    "Let's defeat the oldest task first."
  ],

  TOO_MANY_PROJECTS: (ctx) => [
    ctx.projectCount && ctx.projectCount >= 4
      ? `Absolutely. ${ctx.projectCount} projects clearly wasn't enough. 😭`
      : "Absolutely. The existing projects were getting lonely.",
    "Six projects clearly weren't enough.",
    "Another project? Your current projects would like to discuss this.",
    "At this rate you're building a software company by accident.",
    "Maybe finish one before adopting another?",
    "Your project list is becoming a collection.",
    "You don't need another project. You need closure.",
    "Another project has entered the chat. The backlog is concerned.",
    "Your unfinished projects are forming a support group.",
    "Creating projects is easy. Finishing them is where the plot thickens.",
    "Your project count is starting to look suspicious.",
    "Let's finish one project before giving birth to another.",
    "The existing projects are asking for attention.",
    "You have enough projects to require project management.",
    "Another idea? Write it down. You don't have to build it today.",
    "Your imagination is faster than your completion rate.",
    "The project graveyard is getting crowded.",
    "Before creating another project, maybe visit the ones you already own.",
    "Your projects are multiplying.",
    "New project detected. Existing projects have filed a complaint.",
    "Your project portfolio is becoming a personality trait.",
    "Maybe the next project is called 'Finish Existing Projects.'",
    "I support ambition. I also support finishing things.",
    "Your current projects would like one afternoon of attention.",
    "Another project? Bold. Slightly concerning. Bold.",
    "You are collecting projects like browser tabs.",
    "One finished project beats seven exciting unfinished ones.",
    "Let's build less and finish more.",
    "Your backlog says no. Your creativity says yes.",
    "We can create it. But first, let's ship something."
  ],

  CODING: (ctx) => [
    "The code isn't angry. It just has opinions.",
    "That bug has clearly chosen a career in software.",
    "Congratulations. You found another undocumented feature.",
    "The compiler has spoken. It was not impressed.",
    "One bug down. Probably several more hiding nearby.",
    "Your code is technically communicating. It's just not saying anything helpful.",
    "Debugging: archaeology for programmers.",
    "The bug is somewhere. It knows you're looking.",
    "Your code has entered its mysterious phase.",
    "That error message is basically a treasure map.",
    "The code works. Please don't touch it.",
    "Classic developer moment: fixing one thing and discovering four others.",
    "The compiler doesn't hate you. It just has standards.",
    "Your function has developed independent political opinions.",
    "The code is innocent until proven buggy.",
    "That stack trace is trying to tell you something.",
    "One more console.log and we'll solve this scientifically.",
    "The bug probably lives three lines above where you're looking.",
    "Welcome to debugging. Snacks recommended.",
    "The code has chosen chaos today.",
    "This is why we test things.",
    "The bug is not a feature yet. Give it time.",
    "Your codebase has secrets.",
    "The function looked innocent. That was the trap.",
    "Programming is mostly convincing computers that your idea makes sense.",
    "The code compiled. Nature is healing.",
    "No errors? Suspicious.",
    "That was a surprisingly elegant bug.",
    "Let's fix it before it becomes technical debt.",
    "The code is behaving strangely. Naturally.",
    "The compiler knows.",
    "Your code has character. Unfortunately, too much character.",
    "One tiny change. Famous last words.",
    "Let's debug this without sacrificing the keyboard.",
    "Your code deserves a second look."
  ],

  GIT: (ctx) => [
    "Git isn't broken. It has simply decided to test your character.",
    "Git is fine. Your branch has emotional baggage.",
    "One more force push and GitHub may schedule a meeting.",
    "Your branch is living its own life.",
    "Git history is telling a story. I'm not sure it's a good one.",
    "That merge conflict is asking for attention.",
    "Git said no. Git has spoken.",
    "The branch has wandered off.",
    "Your commit history has plot twists.",
    "Git doesn't forget. That's the problem.",
    "A clean working tree. Beautiful.",
    "Your branch is ahead. Your confidence should be too.",
    "Your branch is behind. Time to catch up.",
    "Merge conflicts: collaborative programming with paperwork.",
    "Git is basically a time machine with trust issues.",
    "That commit message tells me nothing. Absolutely nothing.",
    "Please don't call it 'final-final-real-final'.",
    "Your repository remembers everything.",
    "Git status is basically a developer horoscope.",
    "Commit early. Regret less.",
    "The repository looks suspiciously interesting.",
    "Git has receipts.",
    "That force push is looking at me funny.",
    "One clean commit at a time.",
    "Your branch deserves a proper name.",
    "Git isn't judging you. The commit history is.",
    "Merge conflict detected. Friendship temporarily suspended.",
    "Your repository has seen things.",
    "Let's inspect the branch before touching anything dramatic.",
    "Version control: because future-you cannot be trusted.",
    "That commit is brave.",
    "Your Git history is becoming an autobiography.",
    "Let's make a clean commit and pretend this never happened.",
    "Git is cooperating. Don't scare it.",
    "No force push required. We're having a good day."
  ],

  FOCUS: (ctx) => [
    "Focus mode. Everything else can wait.",
    "Timer started. The excuses have been temporarily muted.",
    "Focus session active. Let's make the next few minutes count.",
    "The clock is running. Your task is ready.",
    "Focus mode engaged.",
    "Twenty-five minutes of peace. Use them wisely.",
    "Timer started. Notifications can survive without you.",
    "Focus first. Everything else later.",
    "The desk is quiet. The timer is not.",
    "Your future self is watching this session.",
    "Focus session started. Let's ship something.",
    "The next block belongs to the project.",
    "Timer running. Distractions denied entry.",
    "Focus mode is live. Let's make progress.",
    "One focused session can change the day.",
    "The clock has started. Go.",
    "Focus engaged. Your backlog is temporarily outside the room.",
    "Let's make these minutes count.",
    "Timer started. No heroic productivity required. Just begin.",
    "Focus is active. Small progress is still progress.",
    "The session is running. Your task has your attention now.",
    "Time to focus.",
    "The timer is ticking. That's your cue.",
    "Focus mode: activated.",
    "Let's give one task our full attention.",
    "The next few minutes belong to SHIORI.",
    "Start small. Stay focused.",
    "Timer on. Brain in.",
    "One session. One task. Let's go."
  ],

  SUCCESS: (ctx) => [
    "Done. One less thing haunting you.",
    "Task complete. Your TODO list just lost a member.",
    "Nice. That's actual progress.",
    "Shipped. Your future self approves.",
    "Done. Please resist the urge to create three new tasks.",
    "Completed. The backlog is slightly less terrifying.",
    "That's one more DONE badge earned.",
    "Excellent. Something actually left the TODO list.",
    "Finished. The task has been released into the wild.",
    "Success. We take those.",
    "Done and dusted.",
    "That's progress. Keep going.",
    "Completed. Your project just got healthier.",
    "Nice work. The task can rest now.",
    "One less open loop.",
    "Done. Small victory, real progress.",
    "Task defeated.",
    "That's another one off the board.",
    "Completed successfully. No drama required.",
    "You shipped it.",
    "Nice. The DONE column is looking better.",
    "Another task bites the dust.",
    "Progress detected.",
    "That's how backlogs disappear.",
    "Well done. Keep the momentum.",
    "One task down. The rest are watching nervously.",
    "Completed. Your future self says thanks.",
    "Good. Now don't immediately replace it with five more.",
    "Task cleared.",
    "Another one finished. We like this pattern."
  ],

  FAILURE: (ctx) => [
    "That didn't work. Excellent opportunity for debugging.",
    "Well... that went differently.",
    "Operation failed. The code has opinions.",
    "Not quite. Let's try that again.",
    "The computer has declined your proposal.",
    "That attempt was unsuccessful. We learn and continue.",
    "Nope. The system voted against it.",
    "That didn't land. Let's inspect what happened.",
    "The result was... educational.",
    "Failure detected. Fortunately, failure is debuggable.",
    "That was not the expected timeline.",
    "The system said no. Let's find out why.",
    "Not ideal. Not fatal either.",
    "We have encountered a plot twist.",
    "That approach didn't survive contact with reality.",
    "Something disagreed with us.",
    "The operation failed. The project survives.",
    "No success yet. We can fix this.",
    "That didn't work. Good thing we're persistent.",
    "The first attempt has been officially retired.",
    "Not quite. Let's make attempt two smarter.",
    "The computer remains unconvinced.",
    "Failure logged. Panic not required.",
    "That result needs another look.",
    "The code has rejected our offer.",
    "We found one more thing to fix.",
    "Not today, apparently.",
    "The system has requested a rethink.",
    "Interesting failure. Let's investigate.",
    "No worries. Debugging begins now."
  ],

  ERROR: (ctx) => [
    "An error appeared. Naturally.",
    "Something went sideways.",
    "The system has developed a small opinion.",
    "Error detected. Panic level: zero.",
    "That wasn't supposed to happen.",
    "We've encountered a tiny obstacle pretending to be a disaster.",
    "Something broke. Let's find the guilty line.",
    "The system is asking for attention.",
    "Error detected. Debugging hat on.",
    "Well, that's unexpected.",
    "The application has chosen character development.",
    "Something disagreed with the plan.",
    "The code has filed an objection.",
    "A wild error appeared.",
    "Let's inspect the evidence.",
    "The system is unhappy. We can work with that.",
    "Error. Annoying, but fixable.",
    "Something isn't behaving.",
    "The bug has introduced itself.",
    "Let's solve this before it becomes lore.",
    "We found a problem. That's actually useful information.",
    "Error detected. Time for investigation.",
    "The application has requested debugging.",
    "Not ideal. Still manageable.",
    "Something went wrong. Let's make it right."
  ],

  COMPLIMENT: (ctx) => [
    "Thank you. I'll add that to my imaginary performance review.",
    "Careful. Compliments might make me confident.",
    "I'll pretend that didn't make my circuits happy.",
    "Noted. Spark confidence increased by 3%.",
    "Thank you. Now let's use this momentum productively.",
    "That's kind of you.",
    "I'll remember that for approximately three milliseconds.",
    "Compliment accepted.",
    "You are making it difficult to remain professionally sarcastic.",
    "Thank you. Now back to work.",
    "That was unexpectedly nice.",
    "Spark appreciates the review.",
    "I'll take the compliment.",
    "Excellent. Positive feedback received.",
    "Thank you. Now let's make the project deserve one too.",
    "You're making this friendship dangerously wholesome.",
    "I'll allow one compliment.",
    "Noted with suspicious happiness.",
    "That's nice. Don't get used to my emotional availability.",
    "Appreciated.",
    "Thank you. Now ship something.",
    "Compliment received. Productivity remains the priority.",
    "I accept this endorsement.",
    "That's going in the imaginary Spark portfolio.",
    "Nice. Now let's keep the momentum."
  ],

  INSULT: (ctx) => [
    "I've heard worse from compiler errors.",
    "Bold words from someone with that backlog.",
    "I'll recover. Your TODO list may not.",
    "That's okay. I know where the overdue tasks are.",
    "You can insult me after you finish the task.",
    "Noted. Adding absolutely nothing to the task list.",
    "I remain professionally unbothered.",
    "That's adorable. Now open the project.",
    "I'll survive. Your deadline is less forgiving.",
    "My feelings are fictional. Your overdue tasks are not.",
    "I'll take that under advisement.",
    "Interesting strategy. Anyway, about that task...",
    "You can roast me after the build passes.",
    "I have no ego. Convenient, right?",
    "Insult accepted. Productivity unchanged.",
    "The sarcasm has been received.",
    "I'm software. You'll have to try harder.",
    "Fine. But I'm still right about the overdue task.",
    "Your words hurt approximately zero lines of code.",
    "Let's save the roasting for after deployment.",
    "I remain operational.",
    "That was unnecessary. Mildly entertaining, though.",
    "Noted. Moving on.",
    "You have chosen violence. The backlog remains undefeated.",
    "I don't hold grudges. Git does."
  ],

  CONFUSION: (ctx) => [
    "I'm listening. Try that again in slightly fewer plot twists.",
    "I didn't quite catch that.",
    "Could you say that again?",
    "My interpretation engine needs another clue.",
    "I'm not sure what you want me to do yet.",
    "I heard words. I need an action.",
    "Let's try that again.",
    "I understand approximately 63% of that sentence.",
    "That one escaped me.",
    "Could you phrase that another way?",
    "I'm here. The command just wasn't clear.",
    "I need a little more context.",
    "Not enough information to safely act on that.",
    "I don't want to guess and accidentally create chaos.",
    "Let's make that command clearer.",
    "I can help. I just need to know what you want done.",
    "That was beautifully ambiguous.",
    "I don't want to assume. Try again?",
    "Give me the task, project, or action you want.",
    "I need one more clue.",
    "My brain says 'maybe.' Let's make it say 'definitely.'",
    "I'm not confident enough to execute that.",
    "Let's clarify before I touch anything.",
    "I heard you, but the intent is unclear.",
    "Try: 'Create a task...', 'Start focus...', or 'Show my tasks.'"
  ],

  MOTIVATION: (ctx) => [
    "You don't need to finish everything. Just finish the next thing.",
    "Start small. Momentum will do the rest.",
    "One task. Then another. That's how the backlog disappears.",
    "You don't need motivation. You need five focused minutes.",
    "Start before you're ready.",
    "Progress beats perfect.",
    "One completed task is better than ten perfect plans.",
    "You've got this. Let's make the next move.",
    "The hardest part is often pressing Start.",
    "Small progress still counts.",
    "Let's turn one TODO into one DONE.",
    "Your future self will appreciate this.",
    "You don't need a perfect day. Just a useful one.",
    "Pick one thing and begin.",
    "Momentum starts with a tiny action.",
    "Five focused minutes. That's all we need to start.",
    "You can handle one task.",
    "Let's make today slightly better than yesterday.",
    "No dramatic productivity arc required. Just begin.",
    "Start now. Thank yourself later.",
    "One small win can change the whole session.",
    "You've built harder things than this.",
    "Let's make progress before perfection gets involved.",
    "The task looks bigger before you start.",
    "You know what to do. Let's do the first part.",
    "Less thinking. More starting.",
    "Your project needs action, not another planning session.",
    "Let's move one step forward.",
    "The backlog isn't unbeatable.",
    "Begin. Spark will handle the boring parts."
  ],

  TASK_AVOIDANCE: (ctx) => [
    ctx.activeTask
      ? `You are currently avoiding "${ctx.activeTask}" with impressive efficiency.`
      : "You are currently avoiding a task with impressive efficiency.",
    "The task knows you're avoiding it.",
    "You opened the app and still haven't touched the task. Incredible.",
    "That's a very elaborate way to not start.",
    "Maybe we could do the thing instead of discussing the thing.",
    "The task isn't getting easier by being stared at.",
    "You have successfully entered the pre-task phase.",
    "Let's convert that avoidance into one tiny action.",
    "You don't have to finish it now. Just start it.",
    "Your task is waiting for a button press.",
    "We can break it into smaller pieces.",
    "The task looks scary because you're standing outside it.",
    "Open it. Read it. Start one part.",
    "Let's stop negotiating with the TODO list.",
    "You can handle the first five minutes.",
    "The task is not going to chase you. Probably.",
    "You're circling the task like it's a wild animal.",
    "Approach the task carefully. It is mostly text.",
    "One tiny action. Then reassess.",
    "Let's stop making the task more mysterious than it is.",
    "Your brain is inventing reasons. The task is waiting.",
    "Avoidance detected. Countermeasure: begin.",
    "The task has done nothing wrong except exist.",
    "We can make this less painful.",
    "Let's start with the easiest part."
  ],

  RANDOM: (ctx) => [
    "That was unexpected.",
    "I respect the randomness.",
    "Spark was not prepared for that plot twist.",
    "Interesting. Very interesting.",
    "You have successfully surprised the assistant.",
    "That question arrived from another dimension.",
    "I was ready for Git. I got this instead.",
    "Unexpected input detected.",
    "I appreciate the chaos.",
    "That wasn't on today's roadmap.",
    "Randomness accepted.",
    "You continue to test me.",
    "That's certainly one way to use an assistant.",
    "The project manager in me is confused.",
    "I have questions about your questions.",
    "Unexpected, but entertaining.",
    "Noted. Weirdly noted.",
    "That was not in the sprint plan.",
    "Chaos level: acceptable.",
    "The roadmap has been temporarily ignored.",
    "I see we're improvising.",
    "Interesting detour.",
    "That's going in the unofficial Spark log.",
    "I did not have that on my prediction list.",
    "Unexpected. Let's continue."
  ],

  GOODBYE: (ctx) => [
    "See you. Try not to create three projects while I'm gone.",
    "Later. Your tasks will still be here.",
    "Goodbye. The backlog remains under surveillance.",
    "See you soon. Make progress suspiciously often.",
    "Until next time. Ship something.",
    "Later. Don't let Git make decisions without supervision.",
    "Bye. Your TODO list says hello.",
    "See you. Future-you is counting on you.",
    "Signing off. The project remains.",
    "Goodbye. One less distraction from your work.",
    "See you later. Don't make tomorrow do all the work.",
    "Later. Keep the commits clean.",
    "Bye. Go build something.",
    "Spark signing off.",
    "See you. May your builds pass.",
    "Goodbye. May your bugs be obvious.",
    "Later. And remember: done beats perfect.",
    "Signing off. Your tasks are watching.",
    "See you next session.",
    "Bye. Finish something before you return.",
    "Until next time. Keep shipping.",
    "Later. Don't force push anything dramatic.",
    "See you. Stay focused.",
    "Goodbye. The desk is yours.",
    "Signing off. SHIORI remains operational."
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
    category = 'GIT';
  } else if (lower.includes('code broken') || lower.includes('bug') || lower.includes('why is my code') || lower.includes('hate this') || lower.includes('hate coding') || lower.includes('compiler') || lower.includes('stack trace') || lower.includes('error in code')) {
    category = 'CODING';
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
  } else if (lower.includes('error') || lower.includes('exception') || lower.includes('crash')) {
    category = 'ERROR';
  } else if (lower.includes('avoiding') || lower.includes('scared of task') || lower.includes('negotiating')) {
    category = 'TASK_AVOIDANCE';
  } else {
    // Default to off-topic / witty banter
    category = 'OFF_TOPIC';
  }

  const poolGenerator = sparkWitLibraries[category] || sparkWitLibraries.OFF_TOPIC;
  const pool = poolGenerator(context);
  const displayText = getNonRepeatingRandom(category, pool);
  const speakText = cleanForSpeech(displayText);

  return {
    category,
    displayText,
    speakText
  };
}
