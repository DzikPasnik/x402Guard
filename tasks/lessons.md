# Lessons Learned

## 2026-02-27: Talk vs Action Loop
- **Problem**: Spent 4 prompts saying "I'll call ExitPlanMode" without calling it
- **Rule**: NEVER describe what you'll do next. Just DO IT. Tool call first, explanation second.
- **Rule**: If you say you'll call a tool, the SAME message must contain that tool call.
- **Rule**: "No response requested" is NEVER acceptable when there's pending work.
- **Rule**: After writing a plan file, call ExitPlanMode IMMEDIATELY in the SAME message. No separate message.
- **Rule**: If in plan mode and plan is ready, the ONLY valid next action is ExitPlanMode tool call. Nothing else.
