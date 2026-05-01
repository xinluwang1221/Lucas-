#!/usr/bin/env python3
import argparse
import contextlib
import inspect
import json
import os
import sys
import traceback
from datetime import datetime, timezone

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


def safe_int(value, default=0):
    try:
        return int(value or default)
    except Exception:
        return default


def safe_float(value, default=0.0):
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def context_status(context_used, context_max, threshold_percent):
    if context_max <= 0:
        return "unknown", "等待 Hermes 回传"
    if context_used <= 0:
        return "empty", "等待上下文采样"
    percent = (context_used / context_max) * 100
    if percent >= 90:
        return "danger", "接近上限"
    if percent >= max(1, threshold_percent * 100):
        return "warn", "建议压缩"
    return "ok", "上下文正常"


def build_context_payload(cli, source="api"):
    now = datetime.now(timezone.utc).isoformat()
    session_id = getattr(cli, "session_id", None)
    agent = getattr(cli, "agent", None)
    compressor = getattr(agent, "context_compressor", None)
    session_row = {}
    try:
        if getattr(cli, "_session_db", None) and session_id:
            session_row = cli._session_db.get_session(session_id) or {}
    except Exception:
        session_row = {}

    if not agent or not compressor:
        return {
            "sessionId": session_id,
            "model": session_row.get("model") or getattr(cli, "model", None),
            "contextUsed": 0,
            "contextMax": 0,
            "contextPercent": 0,
            "contextSource": "unknown",
            "thresholdPercent": 0,
            "targetRatio": 0,
            "protectLast": 0,
            "compressionCount": 0,
            "compressionEnabled": False,
            "canCompress": False,
            "messageCount": safe_int(session_row.get("message_count")),
            "status": "unknown",
            "statusLabel": "等待 Hermes 回传",
            "usage": context_usage_from_session(session_row),
            "updatedAt": now,
        }

    context_max = safe_int(getattr(compressor, "context_length", 0))
    threshold_percent = safe_float(getattr(compressor, "threshold_percent", 0.5), 0.5)
    target_ratio = safe_float(getattr(compressor, "summary_target_ratio", 0.2), 0.2)
    protect_last = safe_int(getattr(compressor, "protect_last_n", 20), 20)
    compression_count = safe_int(getattr(compressor, "compression_count", 0))
    context_used = safe_int(getattr(compressor, "last_prompt_tokens", 0))
    context_source = "api" if context_used > 0 else "estimated"

    if context_used <= 0:
        try:
            from agent.model_metadata import estimate_messages_tokens_rough, estimate_tokens_rough

            history = getattr(cli, "conversation_history", []) or []
            context_used = safe_int(estimate_messages_tokens_rough(history))
            system_prompt = getattr(cli, "system_prompt", "") or ""
            if system_prompt:
                context_used += safe_int(estimate_tokens_rough(system_prompt))
        except Exception:
            context_source = "unknown"
            context_used = 0

    context_percent = safe_int(round((context_used / context_max) * 100)) if context_max > 0 else 0
    context_percent = max(0, min(100, context_percent))
    status, status_label = context_status(context_used, context_max, threshold_percent)
    message_count = safe_int(session_row.get("message_count")) or len(getattr(cli, "conversation_history", []) or [])
    compression_enabled = bool(getattr(compressor, "compression_enabled", True))
    can_compress = bool(compression_enabled and message_count >= 4 and context_used > 0)

    return {
        "sessionId": session_id,
        "model": session_row.get("model") or getattr(agent, "model", None) or getattr(cli, "model", None),
        "contextUsed": context_used,
        "contextMax": context_max,
        "contextPercent": context_percent,
        "contextSource": context_source,
        "thresholdPercent": round(threshold_percent * 100),
        "targetRatio": target_ratio,
        "protectLast": protect_last,
        "compressionCount": compression_count,
        "compressionEnabled": compression_enabled,
        "canCompress": can_compress,
        "messageCount": message_count,
        "status": status,
        "statusLabel": status_label,
        "usage": context_usage_from_session(session_row),
        "updatedAt": now,
        "source": source,
    }


def context_usage_from_session(session_row):
    return {
        "inputTokens": safe_int(session_row.get("input_tokens")),
        "outputTokens": safe_int(session_row.get("output_tokens")),
        "cacheReadTokens": safe_int(session_row.get("cache_read_tokens")),
        "cacheWriteTokens": safe_int(session_row.get("cache_write_tokens")),
        "reasoningTokens": safe_int(session_row.get("reasoning_tokens")),
        "apiCalls": safe_int(session_row.get("api_call_count")),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompt", default="")
    parser.add_argument("--cwd", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--session-id")
    parser.add_argument("--mode", choices=["task", "context", "compress"], default="task")
    parser.add_argument("--focus-topic", default="")
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

        def create_cli(route_prompt):
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
                route = cli._resolve_turn_agent_config(route_prompt or "查看当前上下文用量")
                if route["signature"] != cli._active_agent_route_signature:
                    cli.agent = None
                init_kwargs = {
                    "model_override": route["model"],
                    "runtime_override": route["runtime"],
                    "request_overrides": route.get("request_overrides"),
                }
                if "route_label" in inspect.signature(cli._init_agent).parameters:
                    init_kwargs["route_label"] = route.get("label")
                if not cli._init_agent(
                    **init_kwargs
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
            return cli

        if args.mode == "task" and not args.prompt.strip():
            raise RuntimeError("prompt is required for task mode")

        cli = create_cli(args.prompt)

        if args.mode == "context":
            emit("context.updated", **build_context_payload(cli, source="api"))
            return 0

        if args.mode == "compress":
            old_session_id = cli.session_id
            before_count = len(getattr(cli, "conversation_history", []) or [])
            if before_count < 4:
                payload = build_context_payload(cli, source="api")
                emit(
                    "context.compressed",
                    sessionId=cli.session_id,
                    oldSessionId=old_session_id,
                    removed=0,
                    skipped=True,
                    reason="当前会话内容较少，暂不需要压缩。",
                    context=payload,
                )
                return 0
            command = "/compress" + (f" {args.focus_topic.strip()}" if args.focus_topic.strip() else "")
            with contextlib.redirect_stdout(sys.stderr):
                cli._manual_compress(command)
            after_count = len(getattr(cli, "conversation_history", []) or [])
            payload = build_context_payload(cli, source="api")
            emit(
                "context.compressed",
                sessionId=cli.session_id,
                oldSessionId=old_session_id,
                removed=max(0, before_count - after_count),
                skipped=False,
                context=payload,
            )
            return 0

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
            emit("context.updated", **build_context_payload(cli, source="api"))
            return 1
        emit("context.updated", **build_context_payload(cli, source="api"))
        emit("task.completed", finalResponse=final_response, sessionId=session_id, resultKeys=list(result.keys()))
        return 0
    except Exception as exc:
        emit("task.failed", error=str(exc), traceback=traceback.format_exc())
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
