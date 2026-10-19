"""Turns a failed Maestro flow into GitHub error annotations.

Usage: e2e-annotate.py --flow <name> <junit.xml> <maestro.log> <screen.xml>
       e2e-annotate.py --install <install.log>
For a failed flow: Maestro's message, the end of its output, and the text
that was on the emulator's screen when it failed (from uiautomator).
"""
import os
import sys
import xml.etree.ElementTree as ET


def esc(text: str) -> str:
    # GitHub workflow-command escaping for the message part.
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def annotate(title: str, message: str) -> None:
    title = title.replace(',', ' ').replace('::', ' ')
    print(f'::error title={esc(title)}::{esc(message[:3500])}')


def tail(path: str, lines: int = 25) -> str:
    if not os.path.exists(path):
        return '(no output)'
    with open(path, encoding='utf-8', errors='replace') as f:
        return ''.join(f.readlines()[-lines:])


def failure_message(report: str) -> str:
    if not os.path.exists(report):
        return 'Maestro wrote no report (it failed before running the flow).'
    for case in ET.parse(report).getroot().iter('testcase'):
        problem = case.find('failure')
        if problem is None:
            problem = case.find('error')
        if problem is not None:
            return ((problem.get('message') or '') + '\n' + (problem.text or '')).strip()
    return '(no failure recorded in the report)'


def screen_text(dump: str) -> str:
    """Every visible text and accessibility label, top to bottom."""
    if not os.path.exists(dump):
        return '(could not read the screen)'
    seen = []
    for node in ET.parse(dump).getroot().iter('node'):
        for attr in ('text', 'content-desc'):
            value = (node.get(attr) or '').strip()
            if value and value not in seen:
                seen.append(value)
    return '\n'.join(seen) or '(nothing readable on screen)'


def main() -> None:
    if sys.argv[1] == '--install':
        annotate('E2E: installing the APK failed', tail(sys.argv[2]))
        return
    _, _, name, report, log, dump = sys.argv
    annotate(f'E2E failed: {name}', failure_message(report))
    annotate(f'E2E {name}: screen when it failed', screen_text(dump))
    annotate(f'E2E {name}: end of Maestro output', tail(log))


if __name__ == '__main__':
    main()
