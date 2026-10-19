"""Turns a failed Maestro run into GitHub error annotations.

Usage: e2e-annotate.py <junit.xml> <maestro.log>
       e2e-annotate.py --install <install.log>
One annotation per failing flow (its name and Maestro's message), plus the
end of Maestro's output.
"""
import os
import sys
import xml.etree.ElementTree as ET


def esc(text: str) -> str:
    # GitHub workflow-command escaping for the message part.
    return text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def annotate(title: str, message: str) -> None:
    print(f'::error title={esc(title).replace(",", " ").replace("::", " ")}::{esc(message[:3500])}')


def tail(path: str, lines: int = 40) -> str:
    if not os.path.exists(path):
        return '(no output)'
    with open(path, encoding='utf-8', errors='replace') as f:
        return ''.join(f.readlines()[-lines:])


def main() -> None:
    if sys.argv[1] == '--install':
        annotate('E2E: installing the APK failed', tail(sys.argv[2]))
        return
    report, log = sys.argv[1], sys.argv[2]
    failed = 0
    if os.path.exists(report):
        for case in ET.parse(report).getroot().iter('testcase'):
            problem = case.find('failure')
            if problem is None:
                problem = case.find('error')
            if problem is not None:
                failed += 1
                text = (problem.get('message') or '') + '\n' + (problem.text or '')
                annotate(f'E2E failed: {case.get("name")}', text.strip())
    if failed == 0:
        annotate('E2E: Maestro failed before reporting a flow', '')
    annotate('E2E: end of Maestro output', tail(log))


if __name__ == '__main__':
    main()
