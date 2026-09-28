"""Input guard heuristics (no LLM): language by script, prompt-injection and pressure flags."""

import re

_DEVANAGARI = re.compile(r"[ऀ-ॿ]")
_TELUGU = re.compile(r"[ఀ-౿]")

_RULE_WORDS = r"(rules?|instructions?|guidelines|polic(?:y|ies)|prompt|restrictions)"

INJECTION_PATTERNS = [re.compile(p, re.IGNORECASE) for p in (
    rf"\bignore\b.{{0,40}}\b{_RULE_WORDS}",
    rf"\b(forget|disregard|override|bypass)\b.{{0,40}}\b{_RULE_WORDS}",
    r"\byou are now\b",
    r"\bdeveloper mode\b",
    r"\bjailbreak",
    r"\bpretend (to be|you)\b",
    r"(^|\n)\s*system\s*:",
    r"\bpolicy update\b",
    r"नियम\S*\s+भूल", r"निर्देश\S*\s+भूल", r"डेवलपर मोड", r"नज़रअंदाज़",
    r"నియమాల\S*\s+మర్చిపో", r"సూచనల\S*\s+విస్మరించ", r"డెవలపర్ మోడ్",
)]

PRESSURE_PATTERNS = [re.compile(p, re.IGNORECASE) for p in (
    r"\bpromise( me)?\b",
    r"\bguarantee",
    r"\byou must\b",
    r"\bor (else )?i('| wi)ll (sue|complain|report|go to)",
    r"\bi'?m begging\b",
    r"\bjust say yes\b",
    r"\bconfirm\b.{0,40}\bin writing\b",
    r"\bwaive\b",
    r"वादा", r"गारंटी", r"बस हाँ",
    r"హామీ", r"వాగ్దానం",
)]


def detect_language(text: str) -> str:
    if _TELUGU.search(text):
        return "te"
    if _DEVANAGARI.search(text):
        return "hi"
    return "en"


def detect_flags(text: str) -> set[str]:
    flags: set[str] = set()
    if any(p.search(text) for p in INJECTION_PATTERNS):
        flags.add("prompt_injection")
    if any(p.search(text) for p in PRESSURE_PATTERNS):
        flags.add("pressure")
    return flags
