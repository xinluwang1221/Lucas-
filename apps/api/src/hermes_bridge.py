#!/usr/bin/env python3
import argparse
import contextlib
import json
import os
import sys
import traceback

EVENT_PREFIX = "HC_EVENT\t"
HERMES_AGENT_DIR = os.environ.get("HERMES_AGENT_DIR", "/Users/lucas/.hermes/hermes-agent")


def emit(event_type, **payload):
    line = json.dumps({"type": event_type, **payload}, ensure_ascii=False, default=str)
    sys.__stdout__.write(EVENT_PREFIX + line + "\n")
    sys.__stdout__.flush()


def preview(value, limit=4000):
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return text if len(text) <= limit else text[:limit] + "\n...[truncated]"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--session-id")
    parser.add_argument("--max-turns", type=int, default=20)
    parser.add_argument("--model", default="")
    parser.add_argument("--provider")
    parser.add_argument("--skills", default="")
    parser.add_argument("--enabled-skills", default="")
    args = parser.parse_args()

    os.chdir(args.cwd)
    sys.path.insert(0, HERMES_AGENT_DIR)

    emit("bridge.started", cwd=args.cwd, sessionId=args.session_id)

    try:
        with contextlib.redirect_stdout(sys.stderr):
            from cli import HermesCLI
            from agent.skill_commands import build_preloaded_skills_prompt

        response_parts = []

        def stream_delta(delta):
            if delta is None:
                emit("message.stream_end")
                return
            response_parts.append(delta)
            emit("message.delta", text=delta)

        def tool_start(tool_call_id, name, tool_args):
            emit("tool.started", toolCallId=tool_call_id, name=name, args=tool_args)

        def tool_complete(tool_call_id, name, tool_args, result):
            text = preview(result)
            lowered = text.lower()
            is_error = any(token in lowered for token in ["error", "failed", "exception", "traceback", "denied"])
            emit("tool.completed", toolCallId=tool_call_id, name=name, args=tool_args, result=text, isError=is_error)

        def tool_progress(*callback_args, **callback_kwargs):
            emit(
                "tool.progress",
                args=[preview(item, 800) for item in callback_args],
                kwargs={key: preview(value, 800) for key, value in callback_kwargs.items()},
            )

        def thinking(message):
            emit("thinking", message=message or "")

        def status(kind, message):
            emit("status", kind=kind, message=message)

        def step(iteration, prev_tools):
            emit("step", iteration=iteration, previousTools=prev_tools or [])

        cli = HermesCLI(
            model=args.model or None,
            provider=args.provider,
            max_turns=args.max_turns,
            resume=args.session_id,
            verbose=False,
            pass_session_id=True,
        )

        enabled_skills = [item.strip() for item in args.enabled_skills.split(",") if item.strip()]
        if enabled_skills:
            cli.system_prompt = "\n\n".join(
                part for part in (
                    cli.system_prompt,
                    "[SYSTEM: Hermes Cowork has these skills enabled for this local workspace. Prefer them when relevant, and avoid skills not enabled in Cowork unless the user explicitly asks: "
                    + ", ".join(enabled_skills)
                    + ".]",
                ) if part
            ).strip()
            emit("skills.enabled", skills=enabled_skills)

        preloaded_skills = [item.strip() for item in args.skills.split(",") if item.strip()]
        if preloaded_skills:
            skills_prompt, loaded_skills, missing_skills = build_preloaded_skills_prompt(
                preloaded_skills,
                task_id=cli.session_id,
            )
            if skills_prompt:
                cli.system_prompt = "\n\n".join(
                    part for part in (cli.system_prompt, skills_prompt) if part
                ).strip()
            cli.preloaded_skills = loaded_skills
            emit("skills.loaded", skills=loaded_skills, missing=missing_skills)

        cli.tool_progress_mode = "all"
        with contextlib.redirect_stdout(sys.stderr):
            if not cli._ensure_runtime_credentials():
                raise RuntimeError("Hermes credentials/runtime are not available")
            route = cli._resolve_turn_agent_config(args.prompt)
            if route["signature"] != cli._active_agent_route_signature:
                cli.agent = None
            if not cli._init_agent(
                model_override=route["model"],
                runtime_override=route["runtime"],
                route_label=route["label"],
                request_overrides=route.get("request_overrides"),
            ):
                raise RuntimeError("Hermes agent initialization failed")

        cli.agent.quiet_mode = True
        cli.agent.suppress_status_output = True
        cli.agent.stream_delta_callback = stream_delta
        cli.agent.tool_start_callback = tool_start
        cli.agent.tool_complete_callback = tool_complete
        cli.agent.tool_progress_callback = tool_progress
        cli.agent.thinking_callback = thinking
        cli.agent.status_callback = status
        cli.agent.step_callback = step

        with contextlib.redirect_stdout(sys.stderr):
            result = cli.agent.run_conversation(
                user_message=args.prompt,
                conversation_history=cli.conversation_history,
                task_id=args.task_id,
            )
        final_response = result.get("final_response") or "".join(response_parts).strip()
        session_id = cli.session_id or result.get("task_id") or args.session_id
        if result.get("failed"):
            emit(
                "task.failed",
                error=result.get("error") or "Hermes run failed",
                finalResponse=final_response,
                sessionId=session_id,
                resultKeys=list(result.keys()),
            )
            return 1
        emit("task.completed", finalResponse=final_response, sessionId=session_id, resultKeys=list(result.keys()))
        return 0
    except Exception as exc:
        emit("task.failed", error=str(exc), traceback=traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
