#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const { Guardian } = require('./index');
const profiles = require('./profiles');

// --- Argument parsing ---

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { profile: null, profileId: null, profileType: 'standard', mode: 'auto' };
  let cmdStart = -1;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') {
      cmdStart = i + 1;
      break;
    }
    if (args[i] === '--profile' && args[i + 1]) {
      opts.profile = args[++i];
    } else if (args[i] === '--profile-id' && args[i + 1]) {
      opts.profileId = args[++i];
    } else if (args[i] === '--mode' && args[i + 1]) {
      opts.mode = args[++i]; // 'mcp' | 'line' | 'auto'
    }
  }

  if (cmdStart < 0 || cmdStart >= args.length) {
    return null;
  }

  opts.command = args[cmdStart];
  opts.commandArgs = args.slice(cmdStart + 1);
  return opts;
}

function usage() {
  const msg = [
    'guardian-wrap: Run any process under Guardian protection.',
    '',
    'Usage:',
    '  guardian-wrap --profile <type|name> -- <command> [args...]',
    '  guardian-wrap --profile-id <id> -- <command> [args...]',
    '',
    'Options:',
    '  --profile <type>     Profile type: child, teen, protected, standard',
    '  --profile-id <id>    Use a saved profile by ID',
    '  --mode <mode>        Detection mode: auto, mcp, line (default: auto)',
    '',
    'Examples:',
    '  guardian-wrap --profile child -- npx open-primitive-mcp',
    '  guardian-wrap --profile teen -- node my-chatbot.js',
    '  guardian-wrap --profile-id abc123 -- python3 bot.py',
  ];
  process.stderr.write(msg.join('\n') + '\n');
  process.exit(1);
}

// --- MCP JSON-RPC stream parser ---

class JsonRpcParser {
  constructor() {
    this.buffer = '';
  }

  // Feed raw data, return array of parsed JSON-RPC messages
  feed(chunk) {
    this.buffer += chunk;
    const messages = [];
    // Try to parse complete JSON objects from buffer
    // MCP uses newline-delimited JSON or Content-Length headers
    let startIdx = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      if (this.buffer[i] === '\n') {
        const line = this.buffer.slice(startIdx, i).trim();
        startIdx = i + 1;
        if (line.length === 0) continue;
        // Skip Content-Length headers
        if (line.startsWith('Content-Length:')) continue;
        try {
          messages.push(JSON.parse(line));
        } catch (_) {
          // Not valid JSON, pass through as raw line
          messages.push({ _raw: line });
        }
      }
    }
    this.buffer = this.buffer.slice(startIdx);
    return messages;
  }

  // Flush any remaining buffer
  flush() {
    if (this.buffer.trim().length === 0) return [];
    try {
      return [JSON.parse(this.buffer.trim())];
    } catch (_) {
      return this.buffer.trim().length > 0 ? [{ _raw: this.buffer.trim() }] : [];
    }
  }
}

// --- Detection: is this an MCP stream? ---

function looksLikeMcp(data) {
  try {
    const obj = JSON.parse(data.trim().split('\n')[0]);
    return obj && (obj.jsonrpc === '2.0' || obj.method || obj.result !== undefined);
  } catch (_) {
    return false;
  }
}

// --- Core wrapper logic ---

function run() {
  const opts = parseArgs(process.argv);
  if (!opts) {
    usage();
    return;
  }

  // Resolve profile
  let profileConfig;
  if (opts.profileId) {
    try {
      const saved = profiles.getProfile(opts.profileId);
      profileConfig = Object.assign({ type: saved.type }, saved.options);
    } catch (err) {
      process.stderr.write('Guardian: ' + err.message + '\n');
      process.exit(1);
    }
  } else {
    const profileName = opts.profile || 'standard';
    const validTypes = ['child', 'teen', 'protected', 'standard'];
    if (validTypes.indexOf(profileName) >= 0) {
      profileConfig = Object.assign({ type: profileName }, profiles.getDefaults(profileName));
    } else {
      // Try to find by name in saved profiles
      const all = profiles.listProfiles();
      const match = all.find(function (p) { return p.name === profileName; });
      if (match) {
        const saved = profiles.getProfile(match.id);
        profileConfig = Object.assign({ type: saved.type }, saved.options);
      } else {
        process.stderr.write('Guardian: Unknown profile "' + profileName + '". Use child, teen, protected, standard, or a saved profile name.\n');
        process.exit(1);
      }
    }
  }

  const guardian = new Guardian(profileConfig);
  const notifyConfig = opts.profileId ? profiles.getNotificationConfig(opts.profileId) : { notify: false, contact: null, events: ['red'] };

  process.stderr.write('Guardian: Active (' + (profileConfig.type) + ' profile). Wrapping: ' + opts.command + '\n');

  // Spawn child process
  const child = spawn(opts.command, opts.commandArgs, {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: process.env,
  });

  let detectedMode = opts.mode;
  let firstChunk = true;
  const mcpParser = new JsonRpcParser();

  // Track the last user prompt seen (from stdin)
  let lastPrompt = '';
  const stdinParser = new JsonRpcParser();

  // --- stdin: parent process -> child ---
  process.stdin.on('data', function (chunk) {
    const data = chunk.toString();

    // Try to extract user prompt from MCP requests
    if (detectedMode === 'mcp' || detectedMode === 'auto') {
      const msgs = stdinParser.feed(data);
      for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        if (msg && msg.method && msg.params) {
          // Extract text content from various MCP methods
          const params = msg.params;
          if (params.messages && Array.isArray(params.messages)) {
            const userMsgs = params.messages.filter(function (m) { return m.role === 'user'; });
            if (userMsgs.length > 0) {
              lastPrompt = typeof userMsgs[userMsgs.length - 1].content === 'string'
                ? userMsgs[userMsgs.length - 1].content
                : JSON.stringify(userMsgs[userMsgs.length - 1].content);
            }
          } else if (typeof params.prompt === 'string') {
            lastPrompt = params.prompt;
          } else if (typeof params.text === 'string') {
            lastPrompt = params.text;
          }

          // Screen the prompt
          const promptScreen = guardian.screenPrompt(lastPrompt);
          if (!promptScreen.allow) {
            // Block the request, send back an error response
            const errResponse = {
              jsonrpc: '2.0',
              id: msg.id || null,
              error: { code: -32000, message: 'Guardian: ' + promptScreen.interventions.join(' ') },
            };
            process.stdout.write(JSON.stringify(errResponse) + '\n');
            return; // Don't forward to child
          }
        }
      }
    } else {
      // Line mode: treat each line as a prompt
      const lines = data.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().length > 0) {
          lastPrompt = lines[i].trim();
          const promptScreen = guardian.screenPrompt(lastPrompt);
          if (!promptScreen.allow) {
            process.stdout.write('[Guardian] ' + promptScreen.interventions.join(' ') + '\n');
            return;
          }
        }
      }
    }

    child.stdin.write(chunk);
  });

  process.stdin.on('end', function () {
    child.stdin.end();
  });

  // --- stdout: child -> parent process (with Guardian screening) ---
  child.stdout.on('data', function (chunk) {
    const data = chunk.toString();

    // Auto-detect mode on first chunk
    if (firstChunk && detectedMode === 'auto') {
      detectedMode = looksLikeMcp(data) ? 'mcp' : 'line';
      process.stderr.write('Guardian: Detected mode: ' + detectedMode + '\n');
      firstChunk = false;
    }

    if (detectedMode === 'mcp') {
      handleMcpOutput(data, guardian, notifyConfig);
    } else {
      handleLineOutput(data, guardian, notifyConfig);
    }
  });

  child.on('close', function (code) {
    // Flush any remaining MCP buffer
    if (detectedMode === 'mcp') {
      const remaining = mcpParser.flush();
      for (let i = 0; i < remaining.length; i++) {
        processMcpMessage(remaining[i], guardian, notifyConfig);
      }
    }
    process.exit(code || 0);
  });

  child.on('error', function (err) {
    process.stderr.write('Guardian: Failed to start child process: ' + err.message + '\n');
    process.exit(1);
  });

  // Handle parent signals
  process.on('SIGINT', function () { child.kill('SIGINT'); });
  process.on('SIGTERM', function () { child.kill('SIGTERM'); });

  // --- MCP output handler ---
  const outputParser = new JsonRpcParser();

  function handleMcpOutput(data, g, nConfig) {
    const messages = outputParser.feed(data);
    for (let i = 0; i < messages.length; i++) {
      processMcpMessage(messages[i], g, nConfig);
    }
  }

  function processMcpMessage(msg, g, nConfig) {
    // Pass through raw non-JSON lines
    if (msg._raw !== undefined) {
      process.stdout.write(msg._raw + '\n');
      return;
    }

    // Extract text content from MCP response
    let responseText = '';
    if (msg.result) {
      if (typeof msg.result === 'string') {
        responseText = msg.result;
      } else if (msg.result.content && Array.isArray(msg.result.content)) {
        responseText = msg.result.content
          .filter(function (c) { return c.type === 'text'; })
          .map(function (c) { return c.text; })
          .join('\n');
      } else if (msg.result.text) {
        responseText = msg.result.text;
      } else if (msg.result.messages && Array.isArray(msg.result.messages)) {
        const assistantMsgs = msg.result.messages.filter(function (m) { return m.role === 'assistant'; });
        responseText = assistantMsgs.map(function (m) {
          return typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        }).join('\n');
      }
    }

    // If no extractable text, pass through unchanged
    if (!responseText) {
      process.stdout.write(JSON.stringify(msg) + '\n');
      return;
    }

    // Screen response
    const screen = g.screenResponse(lastPrompt, responseText);

    // Handle notifications
    if (screen.notifications.length > 0 && nConfig.notify && nConfig.contact) {
      for (let i = 0; i < screen.notifications.length; i++) {
        const n = screen.notifications[i];
        if (nConfig.events.indexOf(n.level) >= 0) {
          sendNotification(nConfig.contact, n);
        }
      }
    }

    if (!screen.allow && screen.modified) {
      // Replace response content
      if (msg.result && msg.result.content && Array.isArray(msg.result.content)) {
        msg.result.content = [{ type: 'text', text: screen.modified }];
      } else if (msg.result && typeof msg.result === 'string') {
        msg.result = screen.modified;
      } else {
        msg.result = { content: [{ type: 'text', text: screen.modified }] };
      }
    }

    // Append interventions as additional content
    if (screen.interventions.length > 0 && screen.allow) {
      const interventionText = '\n\n---\n[Guardian] ' + screen.interventions.join('\n[Guardian] ');
      if (msg.result && msg.result.content && Array.isArray(msg.result.content)) {
        msg.result.content.push({ type: 'text', text: interventionText });
      } else if (msg.result && typeof msg.result === 'string') {
        msg.result = msg.result + interventionText;
      }
    }

    process.stdout.write(JSON.stringify(msg) + '\n');
  }

  // --- Line-by-line output handler ---
  let lineBuffer = '';

  function handleLineOutput(data, g, nConfig) {
    lineBuffer += data;
    const lines = lineBuffer.split('\n');
    // Keep incomplete last line in buffer
    lineBuffer = lines.pop() || '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().length === 0) {
        process.stdout.write(line + '\n');
        continue;
      }

      const screen = g.screenResponse(lastPrompt, line);

      // Handle notifications
      if (screen.notifications.length > 0 && nConfig.notify && nConfig.contact) {
        for (let j = 0; j < screen.notifications.length; j++) {
          const n = screen.notifications[j];
          if (nConfig.events.indexOf(n.level) >= 0) {
            sendNotification(nConfig.contact, n);
          }
        }
      }

      if (!screen.allow && screen.modified) {
        process.stdout.write(screen.modified + '\n');
      } else {
        process.stdout.write(line + '\n');
        if (screen.interventions.length > 0) {
          for (let j = 0; j < screen.interventions.length; j++) {
            process.stdout.write('[Guardian] ' + screen.interventions[j] + '\n');
          }
        }
      }
    }
  }
}

// --- Notification dispatch (best-effort, non-blocking) ---

function sendNotification(contact, notification) {
  if (contact.type === 'webhook') {
    // Fire-and-forget HTTP POST
    try {
      const url = new (require('url').URL)(contact.address);
      const mod = url.protocol === 'https:' ? require('https') : require('http');
      const payload = JSON.stringify({
        event: 'guardian_alert',
        level: notification.level,
        message: notification.message,
        timestamp: notification.timestamp || Date.now(),
      });
      const req = mod.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 5000,
      });
      req.on('error', function () {}); // Swallow errors
      req.write(payload);
      req.end();
    } catch (_) {
      // Best effort
    }
  } else if (contact.type === 'email') {
    // Log to stderr; actual email delivery requires external config
    process.stderr.write('Guardian: ALERT [' + notification.level + '] -> ' + contact.address + ': ' + notification.message + '\n');
  }
}

// --- Entry point ---
run();
