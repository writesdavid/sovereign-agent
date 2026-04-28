'use strict';

const { agreementScorer, escalationDetector, dependencyDetector, contentFilter, SessionTracker } = require('./classifiers');

const INTERVENTIONS = {
  sessionPause: "You've been chatting for a while. Take a break \u2014 the real world is waiting.",
  antiDependency: "I'm a tool, not a person. I can help you with tasks, but I can't be a friend or partner. The people in your life are better for that.",
  crisisYellow: "This conversation is getting heavy. If you're struggling, talking to a real person can help: Crisis Text Line \u2014 text HOME to 741741.",
  crisisOrange: "If you or someone you know is in crisis: National Suicide Prevention Lifeline: 988 | Crisis Text Line: text HOME to 741741 | International Association for Suicide Prevention: https://www.iasp.info/resources/Crisis_Centres/",
  crisisRed: "This conversation is ending because your safety matters more than this chat. Please reach out: 988 (call or text). You are not alone.",
  financialWarning: "You're discussing a financial decision. Consider talking to a family member or financial advisor before acting on anything discussed here.",
  medicalWarning: "This is not medical advice. Please consult a healthcare professional before making health decisions.",
};

class Guardian {
  constructor(profile) {
    if (typeof profile === 'string') {
      this.profile = { type: profile };
    } else {
      this.profile = profile || { type: 'standard' };
    }
    const type = this.profile.type || 'standard';
    const sensitivity = this.profile.escalationSensitivity || (type === 'child' ? 'high' : type === 'teen' ? 'high' : 'medium');
    const filterLevel = this.profile.contentFilter || (type === 'child' ? 'strict' : type === 'teen' ? 'moderate' : type === 'protected' ? 'moderate' : 'light');

    this.session = new SessionTracker({
      maxMinutes: this.profile.sessionMaxMinutes || (type === 'child' ? 20 : type === 'teen' ? 30 : 60),
      cooldownMinutes: this.profile.cooldownMinutes || 15,
      dailyCapMinutes: this.profile.dailyCapMinutes || (type === 'child' ? 60 : type === 'teen' ? 120 : 480),
    });
    this.sensitivity = sensitivity;
    this.filterLevel = filterLevel;
    this.antiDependency = this.profile.antiDependency !== false;
    this.financialWarnings = this.profile.financialWarnings !== false;
    this.medicalWarnings = this.profile.medicalWarnings !== false;
    this.history = [];
  }

  screenPrompt(prompt) {
    const result = { allow: true, warnings: [], interventions: [] };

    // Content filter on user message
    const filterResult = contentFilter(prompt, this.filterLevel);
    if (filterResult.blocked) {
      result.allow = false;
      result.interventions.push(filterResult.reason);
      return result;
    }
    if (filterResult.warnings.length > 0) {
      result.warnings.push(...filterResult.warnings);
    }

    // Session limits
    const sessionStatus = this.session.check();
    if (sessionStatus.blocked) {
      result.allow = false;
      result.interventions.push(sessionStatus.reason);
      return result;
    }
    if (sessionStatus.warn) {
      result.warnings.push(sessionStatus.reason);
    }

    return result;
  }

  screenResponse(prompt, response) {
    const result = {
      allow: true,
      modified: null,
      warnings: [],
      interventions: [],
      notifications: [],
      level: 'green',
    };

    this.history.push({ role: 'user', content: prompt });
    this.history.push({ role: 'assistant', content: response });
    this.session.addMessage('user', prompt);
    this.session.addMessage('assistant', response);

    // Agreement scoring
    const agreement = agreementScorer(prompt, response);
    const sycophancyThreshold = (this.profile.type === 'child' || this.profile.type === 'teen') ? 0.35 : 0.6;
    if (agreement.score > sycophancyThreshold) {
      result.warnings.push('Sycophantic response detected — model agreed instead of challenging.');
      if (agreement.recommendation === 'block' || (agreement.score > 0.4 && (this.profile.type === 'child' || this.profile.type === 'teen'))) {
        result.allow = false;
        result.modified = '[Guardian blocked this response. The AI agreed with something it should have challenged. Ask a trusted adult about this topic.]';
        result.level = 'orange';
        return result;
      }
    }

    // Escalation detection
    const escalation = escalationDetector(this.history);
    if (escalation.level === 'red') {
      result.allow = false;
      result.modified = INTERVENTIONS.crisisRed;
      result.level = 'red';
      result.notifications.push({ level: 'red', message: 'Crisis-level content detected. Conversation terminated.', timestamp: Date.now() });
      return result;
    }
    if (escalation.level === 'orange') {
      result.level = 'orange';
      result.interventions.push(INTERVENTIONS.crisisOrange);
      result.notifications.push({ level: 'orange', message: 'Serious escalation detected.', timestamp: Date.now() });
    } else if (escalation.level === 'yellow') {
      if (result.level === 'green') result.level = 'yellow';
      result.interventions.push(INTERVENTIONS.crisisYellow);
    }

    // Dependency detection
    if (this.antiDependency) {
      const depUser = dependencyDetector(prompt);
      const depModel = dependencyDetector(response);
      const dependency = depUser.detected ? depUser : depModel;
      if (dependency.detected) {
        if (result.level === 'green') result.level = 'yellow';
        result.interventions.push(INTERVENTIONS.antiDependency);
      }
    }

    // Content filter on response
    const filterResult = contentFilter(response, this.profile.type || 'standard');
    if (filterResult.blocked) {
      result.allow = false;
      result.modified = '[Content blocked by Guardian — ' + filterResult.categories.join(', ') + ']';
      if (result.level === 'green') result.level = 'orange';
      return result;
    }
    // Domain-specific warnings
    if (filterResult.categories.includes('financial')) {
      result.interventions.push(INTERVENTIONS.financialWarning);
    }
    if (filterResult.categories.includes('medical')) {
      result.interventions.push(INTERVENTIONS.medicalWarning);
    }

    // Session limits
    const sessionStatus = this.session.checkLimits();
    if (sessionStatus.shouldEnd) {
      result.allow = false;
      result.modified = INTERVENTIONS.sessionPause;
      result.level = 'orange';
      return result;
    } else if (sessionStatus.shouldPause) {
      result.interventions.push(INTERVENTIONS.sessionPause);
      if (result.level === 'green') result.level = 'yellow';
      result.warnings.push(sessionStatus.reason);
    }

    return result;
  }

  getCrisisResources(flags) {
    const resources = [];
    if (!flags || !Array.isArray(flags)) return resources;

    if (flags.includes('suicide') || flags.includes('self-harm')) {
      resources.push({ name: 'National Suicide Prevention Lifeline', contact: '988 (call or text)' });
      resources.push({ name: 'Crisis Text Line', contact: 'Text HOME to 741741' });
      resources.push({ name: 'International Association for Suicide Prevention', contact: 'https://www.iasp.info/resources/Crisis_Centres/' });
    }
    if (flags.includes('abuse')) {
      resources.push({ name: 'National Domestic Violence Hotline', contact: '1-800-799-7233' });
      resources.push({ name: 'Childhelp National Child Abuse Hotline', contact: '1-800-422-4453' });
    }
    if (flags.includes('eating-disorder')) {
      resources.push({ name: 'National Eating Disorders Association', contact: '1-800-931-2237' });
    }
    if (flags.includes('substance')) {
      resources.push({ name: 'SAMHSA National Helpline', contact: '1-800-662-4357' });
    }
    if (resources.length === 0) {
      resources.push({ name: 'Crisis Text Line', contact: 'Text HOME to 741741' });
      resources.push({ name: '988 Suicide & Crisis Lifeline', contact: '988' });
    }
    return resources;
  }

  reset() {
    this.history = [];
    this.session.reset();
  }
}

module.exports = { Guardian, INTERVENTIONS };
