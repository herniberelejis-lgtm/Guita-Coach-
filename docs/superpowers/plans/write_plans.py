"""Script que escribe los planes de implementacion."""
import os, sys
BASE = os.path.dirname(os.path.abspath(__file__))

plan_a_path = os.path.join(BASE, "2026-05-14-mvp-data-ui.md")
plan_b_path = os.path.join(BASE, "2026-05-14-ai-chat-advisor.md")

plan_a = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else ""
plan_b = open(sys.argv[2], encoding="utf-8").read() if len(sys.argv) > 2 else ""

if plan_a:
    with open(plan_a_path, "w", encoding="utf-8") as f:
        f.write(plan_a)
    print(f"Plan A -> {plan_a_path}")
if plan_b:
    with open(plan_b_path, "w", encoding="utf-8") as f:
        f.write(plan_b)
    print(f"Plan B -> {plan_b_path}")
