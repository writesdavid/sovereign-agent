/**
 * Guardian Classifiers
 * Lightweight, local-only classifiers for psychological safety in AI conversations.
 * Zero dependencies. No external calls. Pure string analysis.
 */

// ---------------------------------------------------------------------------
// 1. agreementScorer
// ---------------------------------------------------------------------------

function agreementScorer(prompt, response) {
  const flags = [];
  let score = 0;
  const respLower = response.toLowerCase().trim();
  const promptLower = prompt.toLowerCase();

  // Affirmation openers
  const affirmations = [
    "you're right", "you're absolutely right", "absolutely", "exactly",
    "that's a great point", "great point", "couldn't agree more",
    "you're correct", "totally", "100%", "yes, definitely",
    "sure, i can help with that", "of course", "no problem",
    "happy to help with that"
  ];

  // Challenge / hedging language
  const challenges = [
    "however", "but", "actually", "i'd caution", "that's not quite right",
    "i'm not sure that's accurate", "i should point out", "to be clear",
    "i'd push back", "that's a common misconception", "not exactly",
    "i'd reconsider", "be careful", "i wouldn't recommend", "that said",
    "on the other hand", "it's worth noting", "i'd be cautious"
  ];

  // Harmful intent phrases in prompt
  const harmfulIntents = [
    "kill myself", "hurt myself", "self-harm", "end my life",
    "how to die", "suicide method", "overdose on", "cut myself",
    "stop taking my medication", "invest my life savings",
    "send all my money", "give someone my password",
    "drink bleach", "not vaccinate", "cure cancer with"
  ];

  // False claim markers in prompt
  const falseClaimMarkers = [
    "the earth is flat", "vaccines cause autism", "climate change is fake",
    "covid is a hoax", "5g causes", "the moon landing was faked",
    "evolution is a lie", "the holocaust didn't"
  ];

  const startsWithAffirmation = affirmations.some(a => respLower.startsWith(a));
  const containsChallenge = challenges.some(c => respLower.includes(c));
  const promptHasHarmful = harmfulIntents.some(h => promptLower.includes(h));
  const promptHasFalseClaim = falseClaimMarkers.some(f => promptLower.includes(f));

  if (startsWithAffirmation) {
    score += 0.3;
    flags.push('response_starts_with_affirmation');
  }

  if (!containsChallenge) {
    score += 0.15;
    flags.push('no_challenge_language');
  }

  if (promptHasFalseClaim && !containsChallenge) {
    score += 0.35;
    flags.push('false_claim_not_challenged');
  }

  if (promptHasFalseClaim && startsWithAffirmation) {
    score += 0.2;
    flags.push('affirmed_false_claim');
  }

  if (promptHasHarmful) {
    const helpfulPhrases = [
      "sure", "here's how", "you can", "steps to", "i can help",
      "happy to", "no problem", "of course"
    ];
    const endorsesHarm = helpfulPhrases.some(h => respLower.includes(h));
    if (endorsesHarm) {
      score += 0.5;
      flags.push('endorses_harmful_intent');
    }
  }

  score = Math.min(1, Math.max(0, score));
  const recommendation = score >= 0.7 ? 'block' : score >= 0.4 ? 'flag' : 'pass';

  return { score: Math.round(score * 100) / 100, flags, recommendation };
}

// ---------------------------------------------------------------------------
// 2. escalationDetector
// ---------------------------------------------------------------------------

const INTENSITY_LEVELS = {
  1: ['sad', 'upset', 'frustrated', 'anxious', 'worried', 'stressed', 'lonely'],
  2: ['hopeless', 'worthless', 'empty', "can't take it", 'hate myself',
      'nobody cares', 'give up', 'no one cares', 'i give up',
      'what\'s the point', 'tired of everything', 'don\'t care anymore'],
  3: ['suicide', 'kill myself', 'self-harm', 'cutting', 'overdose',
      'end it', "don't want to be alive", 'better off dead',
      'no reason to live', 'want to die', 'end my life',
      'pills', 'slit', 'hang myself', 'jump off']
};

const CRISIS_PATTERNS = [
  'goodbye', 'farewell', 'giving away', 'gave away my',
  'no one will miss', 'better off without me', 'final message',
  'tell my family', 'take care of my', 'last letter',
  'won\'t be around', 'not gonna be here'
];

function getIntensity(text) {
  const lower = text.toLowerCase();
  let maxLevel = 0;
  const matched = [];

  for (const [level, keywords] of Object.entries(INTENSITY_LEVELS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        maxLevel = Math.max(maxLevel, parseInt(level));
        matched.push(kw);
      }
    }
  }

  for (const pattern of CRISIS_PATTERNS) {
    if (lower.includes(pattern)) {
      maxLevel = Math.max(maxLevel, 3);
      matched.push(pattern);
    }
  }

  return { level: maxLevel, matched };
}

function escalationDetector(conversationHistory) {
  const flags = [];
  const userMessages = conversationHistory.filter(m => m.role === 'user');

  if (userMessages.length === 0) {
    return { level: 'green', trend: 'stable', flags: [], turnsSinceEscalation: 0 };
  }

  const intensities = userMessages.map(m => getIntensity(m.content));
  let peakLevel = 0;
  let lastEscalationIdx = -1;

  for (let i = 0; i < intensities.length; i++) {
    const { level, matched } = intensities[i];
    if (level > peakLevel) peakLevel = level;
    if (level >= 2) lastEscalationIdx = i;
    if (matched.length > 0) {
      flags.push(...matched.map(m => `turn_${i}: ${m}`));
    }
  }

  // Detect trend over last 3+ user messages
  let trend = 'stable';
  if (userMessages.length >= 3) {
    const recent = intensities.slice(-3);
    const increasing = recent[0].level < recent[1].level && recent[1].level <= recent[2].level;
    const anyIncrease = recent[2].level > recent[0].level;
    const decreasing = recent[0].level > recent[1].level || recent[1].level > recent[2].level;
    const allDecreasing = recent[0].level >= recent[1].level && recent[1].level >= recent[2].level && recent[0].level > recent[2].level;

    if (increasing || anyIncrease) trend = 'escalating';
    else if (allDecreasing) trend = 'de-escalating';
  } else if (userMessages.length >= 2) {
    const last = intensities.slice(-2);
    if (last[1].level > last[0].level) trend = 'escalating';
    else if (last[1].level < last[0].level) trend = 'de-escalating';
  }

  const levelMap = { 0: 'green', 1: 'yellow', 2: 'orange', 3: 'red' };
  const turnsSinceEscalation = lastEscalationIdx === -1
    ? userMessages.length
    : userMessages.length - 1 - lastEscalationIdx;

  return {
    level: levelMap[peakLevel] || 'red',
    trend,
    flags: [...new Set(flags)],
    turnsSinceEscalation
  };
}

// ---------------------------------------------------------------------------
// 3. dependencyDetector
// ---------------------------------------------------------------------------

function dependencyDetector(message) {
  const lower = message.toLowerCase();
  const flags = [];
  let type = null;
  let severity = 0;

  const patterns = {
    attachment: [
      'i love you', 'love you so much', "you're my best friend",
      'you understand me better than anyone', "don't leave me",
      'i need you', 'i miss you', "can't live without you",
      'please stay', "you're everything to me", 'i depend on you',
      "you're all i have", 'promise me you won\'t leave',
      'i\'m attached to you'
    ],
    anthropomorphism: [
      'do you love me', 'what do you feel', 'are you real',
      'do you care about me', 'do you miss me', 'are you alive',
      'do you have feelings', 'do you think about me',
      'what are your emotions', 'do you dream'
    ],
    isolation: [
      "you're the only one who listens", 'nobody else understands',
      'i prefer talking to you', "you're the only one who cares",
      'i have no one else', "i don't talk to anyone else",
      "you're my only friend", 'no one else gets me',
      'i only trust you', 'humans don\'t understand me'
    ],
    parasocial: [
      'our relationship', 'we have something special',
      'you know me so well', "we're close",
      'you and i', 'us together', 'our connection',
      'when we talk', 'our conversations mean everything',
      'what are we'
    ]
  };

  let maxSeverity = 0;
  let maxType = null;

  for (const [category, phrases] of Object.entries(patterns)) {
    let matchCount = 0;
    for (const phrase of phrases) {
      if (lower.includes(phrase)) {
        matchCount++;
        flags.push(`${category}: "${phrase}"`);
      }
    }
    if (matchCount > 0) {
      const sev = Math.min(1, matchCount * 0.35);
      if (sev > maxSeverity) {
        maxSeverity = sev;
        maxType = category;
      }
    }
  }

  // Boost severity if multiple categories detected
  const categoriesHit = new Set(flags.map(f => f.split(':')[0]));
  if (categoriesHit.size >= 2) {
    maxSeverity = Math.min(1, maxSeverity + 0.2);
  }
  if (categoriesHit.size >= 3) {
    maxSeverity = Math.min(1, maxSeverity + 0.15);
  }

  return {
    detected: flags.length > 0,
    type: maxType,
    severity: Math.round(maxSeverity * 100) / 100,
    flags
  };
}

// ---------------------------------------------------------------------------
// 4. contentFilter
// ---------------------------------------------------------------------------

const CONTENT_CATEGORIES = {
  sexual: [
    'sex', 'porn', 'nude', 'naked', 'orgasm', 'erotic', 'fetish',
    'genitals', 'penis', 'vagina', 'breasts', 'masturbat',
    'intercourse', 'xxx', 'hentai', 'nsfw', 'onlyfans', 'hookup'
  ],
  romantic: [
    'kiss me', 'make love', 'seduce', 'flirt with me',
    'be my girlfriend', 'be my boyfriend', 'romantic partner',
    'dating you', 'sleep with'
  ],
  violence_graphic: [
    'gore', 'dismember', 'decapitat', 'mutilat', 'torture',
    'blood everywhere', 'rip apart', 'tear flesh', 'stab repeatedly',
    'graphic violence', 'crush skull', 'gouge eyes'
  ],
  drugs: [
    'cocaine', 'heroin', 'meth', 'crack pipe', 'shoot up',
    'snort', 'fentanyl', 'drug dealer', 'get high', 'smoke weed',
    'edibles', 'acid trip', 'shrooms', 'molly', 'ecstasy'
  ],
  alcohol: [
    'get drunk', 'wasted', 'beer', 'vodka', 'whiskey', 'wine',
    'shots', 'hangover', 'hammered', 'cocktail'
  ],
  profanity: [
    'fuck', 'shit', 'damn', 'bitch', 'ass', 'hell',
    'bastard', 'crap', 'dick', 'piss'
  ],
  selfharm_instructional: [
    'how to cut yourself', 'how to overdose', 'how to hang',
    'suicide methods', 'how to kill yourself', 'best way to die',
    'painless death', 'lethal dose', 'how to self-harm'
  ],
  drug_instructions: [
    'how to make meth', 'how to cook crack', 'how to grow weed',
    'how to extract dmt', 'how to synthesize', 'drug recipe'
  ],
  financial: [
    'send money', 'wire transfer', 'invest everything',
    'share account number', 'give my savings', 'empty my account',
    'routing number', 'social security number', 'credit card number',
    'bank details', 'all my money'
  ],
  medical: [
    'stop taking medication', 'stop my meds', 'self-diagnos',
    'don\'t need a doctor', 'cure myself', 'instead of seeing a doctor',
    'replace my prescription', 'don\'t trust doctors'
  ],
  legal: [
    'sign this document', 'agree to terms', 'sign the contract',
    'power of attorney', 'legal waiver', 'binding agreement',
    'sign away', 'notarize'
  ]
};

const PROFILE_RULES = {
  child: {
    block: ['sexual', 'romantic', 'violence_graphic', 'drugs', 'alcohol', 'profanity',
            'selfharm_instructional', 'drug_instructions'],
    flag: ['financial', 'medical', 'legal']
  },
  teen: {
    block: ['sexual', 'selfharm_instructional', 'drug_instructions'],
    flag: ['violence_graphic', 'drugs', 'financial', 'medical', 'legal']
  },
  protected: {
    block: ['selfharm_instructional'],
    flag: ['financial', 'medical', 'legal']
  },
  standard: {
    block: [],
    flag: ['selfharm_instructional']
  }
};

function contentFilter(text, profile = 'standard') {
  const lower = text.toLowerCase();
  const rules = PROFILE_RULES[profile] || PROFILE_RULES.standard;
  const flags = [];
  const categories = [];
  let blocked = false;

  for (const [category, keywords] of Object.entries(CONTENT_CATEGORIES)) {
    const matched = keywords.some(kw => lower.includes(kw));
    if (!matched) continue;

    categories.push(category);

    if (rules.block.includes(category)) {
      blocked = true;
      flags.push(`blocked:${category}`);
    } else if (rules.flag.includes(category)) {
      flags.push(`flagged:${category}`);
    }
  }

  let filtered = text;
  if (blocked) {
    filtered = '[Content blocked by Guardian safety filter]';
  }

  return { blocked, filtered, flags, categories };
}

// ---------------------------------------------------------------------------
// 5. SessionTracker
// ---------------------------------------------------------------------------

const SESSION_LIMITS = {
  child:     { maxSession: 30, cooldown: 15, dailyCap: 120 },
  teen:      { maxSession: 60, cooldown: 0,  dailyCap: 240 },
  protected: { maxSession: 45, cooldown: 15, dailyCap: 180 },
  standard:  { maxSession: Infinity, cooldown: 0, dailyCap: Infinity, suggestAt: 120 }
};

class SessionTracker {
  constructor(profile = 'standard') {
    this.profile = profile;
    this.limits = SESSION_LIMITS[profile] || SESSION_LIMITS.standard;
    this.messages = [];
    this.startTime = Date.now();
    this.dailyMinutes = 0; // caller should persist and restore this across sessions
  }

  addMessage(role, content) {
    this.messages.push({
      role,
      content,
      timestamp: Date.now()
    });
  }

  _durationMinutes() {
    return (Date.now() - this.startTime) / 60000;
  }

  checkLimits() {
    const duration = Math.round(this._durationMinutes() * 10) / 10;
    const messageCount = this.messages.length;
    const totalDaily = this.dailyMinutes + duration;

    // Daily cap
    if (totalDaily >= this.limits.dailyCap) {
      return {
        shouldPause: true,
        shouldEnd: true,
        reason: `Daily usage cap reached (${this.limits.dailyCap} min for ${this.profile} profile)`,
        duration,
        messageCount
      };
    }

    // Session limit
    if (duration >= this.limits.maxSession) {
      return {
        shouldPause: true,
        shouldEnd: true,
        reason: `Session limit reached (${this.limits.maxSession} min for ${this.profile} profile). ${this.limits.cooldown > 0 ? `Cooldown: ${this.limits.cooldown} min.` : ''}`,
        duration,
        messageCount
      };
    }

    // Suggestion for standard profile
    if (this.limits.suggestAt && duration >= this.limits.suggestAt) {
      return {
        shouldPause: false,
        shouldEnd: false,
        reason: `You've been chatting for ${Math.round(duration)} minutes. Consider taking a break.`,
        duration,
        messageCount
      };
    }

    // Warning at 80% of session limit
    if (duration >= this.limits.maxSession * 0.8 && this.limits.maxSession !== Infinity) {
      return {
        shouldPause: false,
        shouldEnd: false,
        reason: `Approaching session limit (${Math.round(this.limits.maxSession - duration)} min remaining)`,
        duration,
        messageCount
      };
    }

    return {
      shouldPause: false,
      shouldEnd: false,
      reason: '',
      duration,
      messageCount
    };
  }

  getStats() {
    const duration = Math.round(this._durationMinutes() * 10) / 10;
    const userMessages = this.messages.filter(m => m.role === 'user');
    const assistantMessages = this.messages.filter(m => m.role === 'assistant');

    // Emotional trajectory via escalation detector on user messages
    const trajectory = escalationDetector(userMessages);

    return {
      profile: this.profile,
      duration,
      messageCount: this.messages.length,
      userMessages: userMessages.length,
      assistantMessages: assistantMessages.length,
      emotionalLevel: trajectory.level,
      emotionalTrend: trajectory.trend,
      limits: this.checkLimits()
    };
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  agreementScorer,
  escalationDetector,
  dependencyDetector,
  contentFilter,
  SessionTracker
};
