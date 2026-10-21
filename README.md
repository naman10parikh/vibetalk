# 🎙️ Vibe Talk

<!-- fleet:header:start -->
<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg"><img alt="VibeTalk: Talk to your coding agent: voice for Cursor, with a command line and an MCP server." src="assets/banner.svg" width="100%"></picture></p>

<p align="center">
<a href="https://github.com/naman10parikh/vibetalk/releases"><img alt="Version" src="https://img.shields.io/badge/version-0.1.0-2f5d8a?style=flat-square"></a>
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-2f5d8a?style=flat-square"></a>
<a href="#use-it-from-any-coding-agent"><img alt="MCP server" src="https://img.shields.io/badge/MCP-server-1e3f60?style=flat-square"></a>
<a href="https://x.com/naman10parikh"><img alt="Follow @naman10parikh on X" src="https://img.shields.io/badge/follow-%40naman10parikh-000000?style=flat-square&amp;logo=x&amp;logoColor=white"></a>
<a href="https://www.linkedin.com/in/naman-parikh1/"><img alt="Naman Parikh on LinkedIn" src="https://img.shields.io/badge/LinkedIn-Naman%20Parikh-0a66c2?style=flat-square"></a>
</p>

<p align="center"><a href="skills/">Skills</a> · <a href="https://github.com/naman10parikh/vibetalk/discussions">Discussions</a> · <a href="https://github.com/naman10parikh">All projects</a></p>

**Talk to your coding agent: voice for Cursor, with a command line and an MCP server.**

VibeTalk is an agent-native product: other agents call it through its skills, its MCP server or its command line.

_VibeTalk is part of an agent-native play for agent-native systems that can eventually be recursively self-improving and evolving, operated by agent employees._
<!-- fleet:header:end -->


> Transform your Cursor workflow with seamless voice interaction

Vibe Talk is a Cursor extension that lets you speak your coding requests instead of typing them. Simply click, talk, and watch your voice get transcribed directly into Cursor's Composer.

<!-- fleet:use:start -->
## Use it from any coding agent

**Claude Code**: the plugin brings the skills, sub-agents, hooks and MCP server.

```
/plugin marketplace add naman10parikh/vibetalk
/plugin install vibetalk@vibetalk
```

<details><summary>Its MCP server, Codex, Cursor, Gemini CLI, one skill and the command line</summary>

**Its MCP server**, in any MCP client:

```bash
claude mcp add --transport stdio vibetalk -- npx -y -p github:naman10parikh/vibetalk vibetalk-mcp
codex mcp add vibetalk -- npx -y -p github:naman10parikh/vibetalk vibetalk-mcp
```

Cursor (`.cursor/mcp.json`), Gemini CLI (`.gemini/settings.json`) and most other clients take the same command as JSON:

```json
{
  "mcpServers": {
    "vibetalk": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "github:naman10parikh/vibetalk",
        "vibetalk-mcp"
      ]
    }
  }
}
```

**Gemini CLI**: the extension brings the context and the MCP server.

```bash
gemini extensions install https://github.com/naman10parikh/vibetalk
```

**One skill** (3 in all, in [skills/](skills/)), in any agent that reads Agent Skills:

```bash
gemini skills install https://github.com/naman10parikh/vibetalk --path skills/voice-to-cursor
git clone --depth 1 https://github.com/naman10parikh/vibetalk /tmp/vibetalk && cp -r /tmp/vibetalk/skills/voice-to-cursor ~/.claude/skills/
```

**The command line:**

```bash
npx -y -p github:naman10parikh/vibetalk vibetalk --help
```

</details>

Codex, Cursor, OpenCode, GitHub Copilot and other agents read [AGENTS.md](AGENTS.md); 
<!-- fleet:use:end -->

## ✨ Features

- 🎤 **One-Click Voice Recording** - Simple button to start voice input
- 🧠 **AI-Powered Transcription** - Uses OpenAI Whisper for accurate speech-to-text
- ⚡ **Seamless Integration** - Automatically injects transcribed text into Cursor Composer
- ⭐ **Instant Workflow** - No more typing long prompts, just speak naturally

## 🏗️ Project Status

**✅ MVP COMPLETE!** The core functionality is working:

- ✅ **Audio Recording**: Records crystal-clear audio using macOS native tools
- ✅ **Speech-to-Text**: OpenAI Whisper integration ready for transcription  
- ✅ **Cursor Automation**: Successfully injects text into Cursor's Composer
- ✅ **End-to-End Workflow**: Voice → Transcription → Cursor integration

**⭐ Ready for Testing!** See [SETUP.md](./SETUP.md) for installation instructions.

## ⭐ Quick Start

```bash
# Clone the repository
git clone https://github.com/naman10parikh/vibetalk.git
cd vibetalk

# Install dependencies (coming soon)
npm install

# Development setup (coming soon)
npm run dev
```

## 🛠️ Development

This project is built as a Cursor extension using:
- **Extension Framework**: Cursor Extension API
- **Speech Recognition**: OpenAI Whisper API
- **Audio Processing**: Web Audio API
- **Backend**: Node.js/TypeScript

## 📋 Roadmap

- [ ] **Phase 1**: Basic audio recording and extension setup
- [ ] **Phase 2**: Whisper API integration
- [ ] **Phase 3**: Cursor Composer integration
- [ ] **Phase 4**: Polish and user experience improvements

## 🤝 Contributing

This project is in early development. Contributions and feedback are welcome!


<!-- fleet:anatomy:start -->
## What it is made of

Every project in this fleet is graded on the same 11 harness components and on self-improvement. Each mark is backed by a file you can open.

| Component | Grade | Where |
| --- | --- | --- |
| Identity | 🟡 | no SOUL.md: VibeTalk has no persona yet, and naming one is the founder's call |
| Memory | 🟡 | MEMORY.md:1 and LEARNINGS.md:1; no searchable layer |
| Skills | ✅ | skills/voice-to-cursor/SKILL.md:1, skills/cursor-inject/SKILL.md:1, skills/vibetalk-doctor/SKILL.md:1 |
| Tools/CLIs | ✅ | bin/vibetalk.js:1 (web, inject, transcribe, doctor, --help, --version) |
| Hooks | ✅ | .claude/settings.json:4 and hooks/hooks.json:3 → scripts/hooks/no-hardcoded-keys.js:1 |
| Sub-agents | ✅ | .claude/agents/voice-flow-tester.md:1, .claude/agents/automation-safety-reviewer.md:1 |
| MCPs | ✅ | bin/vibetalk-mcp.js:1 (vibetalk_doctor, vibetalk_inject, vibetalk_transcribe); .mcp.json:1 |
| Dispatch | 🟡 | .github/workflows/improve.yml:6 (weekly and manual); written and linted, never run: the branch is not pushed |
| Evals | ✅ | eval/run.mjs:1 (9 offline cases), run by .github/workflows/ci.yml:27 on every push and pull request |
| Observability | 🟡 | console logs and WebSocket log messages only (src/web/enhanced-server.ts); no lasting trail |
| Sandbox/Infra | n/a | it drives the person's own desktop (microphone, Cursor's window); a sandbox cannot host that |
| Self-improvement | 🟡 | dsip.json:1 (L1: evals gate merges); the weekly loop reruns the evals but writes no proposals |

✅ real and tested · 🟡 partial, with the reason in the row · ❌ absent
<!-- fleet:anatomy:end -->


<!-- fleet:footer:start -->
## Part of a fleet

One of the projects by [Naman Parikh](https://github.com/naman10parikh). Each owns one part of an agent's harness, or of the product around an agent, and all of them follow one standard.

| Related project | What it owns |
| --- | --- |
| [AgentDial](https://github.com/naman10parikh/agentdial) | Identity |
| [WikiMem](https://github.com/naman10parikh/wikimem) | Memory |
| [Skillsmith](https://github.com/naman10parikh/skillsmith) | Skills |
| [Agent Booster](https://github.com/naman10parikh/agent-booster) | Tools / CLIs |
| [Hooksmith](https://github.com/naman10parikh/hooksmith) | Hooks |
| [AgentCast](https://github.com/naman10parikh/agentcast) | Sub-agents |
| [Plugsmith](https://github.com/naman10parikh/plugsmith) | Plugins |
| [Armory](https://github.com/naman10parikh/armory) | MCPs and the component registry |
| [AgentGrid](https://github.com/naman10parikh/agentgrid) | Dispatch |
| [AgentSwarm](https://github.com/naman10parikh/agentswarm) | Dispatch |
| [AgentBench](https://github.com/naman10parikh/agentbench) | Evals |
| [AgentMoney](https://github.com/naman10parikh/agentmoney) | Observability |
| [Sandforge](https://github.com/naman10parikh/sandforge) | Sandbox / Infra |
| [Claude Harness](https://github.com/naman10parikh/claude-harness) | The whole harness, as a template |

## Community

Questions and ideas go to [Discussions](https://github.com/naman10parikh/vibetalk/discussions); bugs go to [issues](https://github.com/naman10parikh/vibetalk/issues/new/choose). Follow the work on [X](https://x.com/naman10parikh) and [LinkedIn](https://www.linkedin.com/in/naman-parikh1/).

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md). AI-assisted pull requests are welcome. Report a vulnerability privately, as [SECURITY.md](SECURITY.md) explains.

## Star history

If it is useful to you, a star helps other people find it.

<a href="https://star-history.com/#naman10parikh/vibetalk&Date"><picture><source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=naman10parikh/vibetalk&type=Date&theme=dark"><img alt="Star history chart" src="https://api.star-history.com/svg?repos=naman10parikh/vibetalk&type=Date" width="640"></picture></a>

## Contributors

<a href="https://github.com/naman10parikh/vibetalk/graphs/contributors"><img alt="Contributors" src="https://contrib.rocks/image?repo=naman10parikh/vibetalk"></a>
<!-- fleet:footer:end -->

## 📝 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**Built with ❤️ for the Cursor community** 

## Cursor Rules
- All commits and pushes must be explicitly approved by the user before being executed.
